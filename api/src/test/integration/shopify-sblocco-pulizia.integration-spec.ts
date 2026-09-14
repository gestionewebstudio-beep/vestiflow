import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ambienteIntegrazione } from './env';
import { conStoricoSbloccato } from './fixture';
import { creaClientIntegrazione } from './prisma';

/**
 * `conStoricoSbloccato` — la promessa e' che le protezioni tornino SEMPRE
 * accese, e qui si verifica rompendo l'operazione in tre punti diversi.
 *
 * ⛔ **La prima stesura non la manteneva**, ed e' il difetto che queste prove
 *    esistono per impedire che torni: lo spegnimento stava FUORI dal blocco che
 *    garantiva il ripristino — alcune tabelle spente e un errore sulla
 *    successiva le lasciavano scoperte — e la riaccensione, essendo un ciclo
 *    senza rete, si fermava al primo errore.
 *
 * ⭐ **Ora e' UNA transazione sulla stessa connessione.** In PostgreSQL il DDL e'
 *    transazionale: non c'e' un `finally` che possa fallire a meta', perche' a
 *    ripristinare e' il rollback.
 */

/** Le tabelle su cui `conStoricoSbloccato` interviene. */
const PROTETTE = [
  'shopify_product_identities',
  'shopify_variant_identities',
  'shopify_product_links',
  'shopify_variant_links',
  'shopify_location_links',
];
const ELENCO = PROTETTE.map((t) => `'${t}'`).join(',');

/**
 * Quanti trigger sono ACCESI su quelle tabelle, divisi per mestiere.
 *
 * ⛔ **Il conteggio e' ristretto alle tabelle protette, e non e' un dettaglio.**
 *    La prima stesura contava i trigger di TUTTO il database: rimessa
 *    `DISABLE TRIGGER USER` al posto dei dieci nomi, la prova restava VERDE —
 *    gli altri trigger dello schema bastavano a soddisfarla. Falsificata il
 *    08/09/2026, e corretta perche' la falsificazione l'aveva trovata cieca.
 */
const CONTA = `
  SELECT
    count(*) FILTER (
      WHERE t.tgname LIKE '%\\_mai\\_delete' OR t.tgname LIKE '%\\_mai\\_truncate'
    ) AS anti,
    count(*) FILTER (
      WHERE t.tgname NOT LIKE '%\\_mai\\_delete' AND t.tgname NOT LIKE '%\\_mai\\_truncate'
    ) AS altri
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND c.relname IN (${ELENCO})`;

interface Conteggio {
  readonly anti: number;
  readonly altri: number;
}

describe('conStoricoSbloccato — le protezioni tornano sempre accese', () => {
  let prisma: PrismaClient;

  async function conta(su?: { $queryRawUnsafe: PrismaClient['$queryRawUnsafe'] }): Promise<Conteggio> {
    const dove = su ?? prisma;
    const righe = await dove.$queryRawUnsafe<{ anti: bigint; altri: bigint }[]>(CONTA);
    return { anti: Number(righe[0]!.anti), altri: Number(righe[0]!.altri) };
  }

  beforeAll(() => {
    ambienteIntegrazione();
    prisma = creaClientIntegrazione();
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('lo stato di partenza e` dieci protezioni piu` sei trigger di merito', async () => {
    // ⭐ I numeri sono misurati, non stimati: 5 tabelle × (mai_delete +
    //    mai_truncate) = 10, piu` i 6 `…_immutabile` / `…_nasce_agganciata`.
    //    Se la migration ne aggiunge, questa prova lo dice invece di adattarsi.
    expect(await conta()).toEqual({ anti: 10, altri: 6 });
  });

  it('dopo una pulizia riuscita tutto torna acceso', async () => {
    await conStoricoSbloccato(prisma, async (tx) => {
      await tx.$executeRawUnsafe('SELECT 1');
    });
    expect(await conta()).toEqual({ anti: 10, altri: 6 });
  });

  it('spegne SOLO le protezioni anticancellazione, non gli altri trigger', async () => {
    let dentro: Conteggio | null = null;
    await conStoricoSbloccato(prisma, async (tx) => {
      dentro = await conta(tx);
    });
    // ⭐ Dentro la transazione: le dieci spente, le sei di merito ANCORA ACCESE.
    // ⚠️ `…_immutabile` e `…_nasce_agganciata` scrivono mentre le fixture
    //    scrivono: con `DISABLE TRIGGER USER` sarebbero spente anche loro, e
    //    le prove girerebbero senza i vincoli che dicono di verificare.
    expect(dentro).toEqual({ anti: 0, altri: 6 });
    expect(await conta()).toEqual({ anti: 10, altri: 6 });
  });

  it('se la PULIZIA fallisce, le protezioni tornano accese', async () => {
    await expect(
      conStoricoSbloccato(prisma, async (tx) => {
        await tx.$executeRawUnsafe('SELECT 1 FROM tabella_che_non_esiste');
      }),
    ).rejects.toThrow();
    expect(await conta()).toEqual({ anti: 10, altri: 6 });
  });

  it('se lo SPEGNIMENTO fallisce a meta`, non ne resta nessuno spento', async () => {
    // Un trigger inesistente dopo che alcuni sono gia` stati spenti: con lo
    // spegnimento fuori dal blocco protetto, quelli restavano spenti.
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          'ALTER TABLE "shopify_product_identities" DISABLE TRIGGER "shopify_product_identities_mai_delete"',
        );
        await tx.$executeRawUnsafe(
          'ALTER TABLE "shopify_variant_links" DISABLE TRIGGER "trigger_che_non_esiste"',
        );
      }),
    ).rejects.toThrow();
    expect(await conta()).toEqual({ anti: 10, altri: 6 });
  });

  it('se il RIPRISTINO fallisce, il rollback riaccende comunque tutto', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          'ALTER TABLE "shopify_product_links" DISABLE TRIGGER "shopify_product_links_mai_delete"',
        );
        await tx.$executeRawUnsafe(
          'ALTER TABLE "shopify_product_links" ENABLE TRIGGER "trigger_che_non_esiste"',
        );
      }),
    ).rejects.toThrow();
    expect(await conta()).toEqual({ anti: 10, altri: 6 });
  });

  it('lo sblocco non esce dalla transazione: da fuori i trigger restano accesi', async () => {
    // ⚠️ E` la ragione per cui la firma passa `tx`: una pulizia scritta sul
    //    client esterno girerebbe fuori dalla transazione e troverebbe le
    //    protezioni ancora attive — fallirebbe, invece di pulire.
    await conStoricoSbloccato(prisma, async () => {
      expect(await conta()).toEqual({ anti: 10, altri: 6 });
    });
    expect(await conta()).toEqual({ anti: 10, altri: 6 });
  });

  it("rifiuta un AMBIENTE che non sia quello di prova, e non pulisce nulla", async () => {
    // ⭐ Prima barriera: il bersaglio DICHIARATO. Vive dentro l'helper, non nei
    //    chiamanti, e ferma prima ancora di aprire la transazione.
    const vero = process.env['DATABASE_URL_TEST'];
    let pulizieEseguite = 0;
    try {
      process.env['DATABASE_URL_TEST'] = 'postgresql://x:y@localhost:5433/vestiflow_altro';
      await expect(
        conStoricoSbloccato(prisma, async () => {
          pulizieEseguite += 1;
        }),
      ).rejects.toThrow(/vestiflow_altro/);
    } finally {
      process.env['DATABASE_URL_TEST'] = vero;
    }
    expect(pulizieEseguite).toBe(0);
    expect(await conta()).toEqual({ anti: 10, altri: 6 });
    expect(ambienteIntegrazione().database).toBe('vestiflow_test');
  });

  /**
   * ⛔ **Il divario che la sola barriera d'ambiente lasciava aperto.**
   *
   * `conStoricoSbloccato` accetta un `PrismaClient` qualunque, e la barriera
   * d'ambiente non dice niente su DOVE quel client sia connesso: il DDL va
   * sulla sua connessione, non sull'URL che la barriera ha letto.
   *
   * ⚠️ **Non e' il "client nudo"**: dentro questa suite `setup.ts` riscrive
   *    `DATABASE_URL` con la connessione di prova, quindi un client nudo
   *    atterra sul posto giusto. Le vie reali sono un `datasources` esplicito
   *    con url sbagliata — l'unica forma ammessa da `check:integration-db` R3,
   *    cioe' un refuso — e un chiamante fuori dalla suite di integrazione,
   *    dove `setup.ts` non e' caricato.
   *
   * ⚠️ **Il client sbagliato di questa prova e' locale e sacrificabile**: e' il
   *    database `postgres` della STESSA istanza di prova (misurato l'08/09/2026:
   *    sull'istanza ci sono due database, `postgres` e `vestiflow_test`). Non
   *    si punta mai a un bersaglio vero per dimostrare che verrebbe rifiutato.
   */
  it('rifiuta un CLIENT connesso altrove, prima di emettere il DDL', async () => {
    const url = new URL(ambienteIntegrazione().databaseUrl);
    expect(url.hostname, 'il bersaglio della prova deve restare locale').toBe('localhost');
    url.pathname = '/postgres';

    // ⚠️ `datasources` esplicito, mai un client nudo: un `new PrismaClient()`
    //    senza override leggerebbe l'ambiente del processo, ed e` proprio la
    //    strada che `check:integration-db` (R3) vieta.
    const sbagliato = new PrismaClient({
      datasources: { db: { url: url.toString() } },
      log: ['error'],
    });
    let pulizieEseguite = 0;
    let messaggio = '';
    try {
      await conStoricoSbloccato(sbagliato, async () => {
        pulizieEseguite += 1;
      });
      throw new Error('la pulizia NON e` stata rifiutata');
    } catch (errore) {
      messaggio = errore instanceof Error ? errore.message : String(errore);
    } finally {
      await sbagliato.$disconnect();
    }

    // ⭐ 1 · Rifiutata, e il messaggio nomina il database SBAGLIATO.
    expect(messaggio).toMatch(/il CLIENT è connesso a «postgres»/);
    // ⭐ 2 · Rifiutata dalla NOSTRA barriera, non da PostgreSQL che non trova
    //        la tabella: e` la differenza fra «fermato prima» e «fallito dopo».
    expect(messaggio).toContain('Nessun DDL è stato emesso');
    expect(messaggio).not.toMatch(/does not exist|relation/i);
    // ⭐ 3 · La pulizia non e` stata nemmeno invocata.
    expect(pulizieEseguite).toBe(0);
    // ⭐ 4 · E il database di prova e` intatto.
    expect(await conta()).toEqual({ anti: 10, altri: 6 });
  });
});
