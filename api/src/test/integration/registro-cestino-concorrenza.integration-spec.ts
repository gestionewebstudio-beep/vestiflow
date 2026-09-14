import { NotFoundException } from '@nestjs/common';
import { PlatformAuditActor, type PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PlatformAuditService } from '../../common/audit/platform-audit.service';
import type { AttoreRegistro, DatiOperazione } from '../../common/audit/platform-audit.types';
import { ProductsService } from '../../products/products.service';
import { ShopifyLinkHistoryService } from '../../shopify/shopify-link-history.service';
import { ambienteIntegrazione } from './env';
import { creaDataset, IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';
import {
  attendiBloccoCausatoDa,
  sospendiLaPrimaRichiesta,
} from './concorrenza.util';

/**
 * I due casi di concorrenza del cestino, sul database di prova VERO.
 *
 * ⛔ **Nessuno dei due si riproduce con un database simulato**: il primo ha
 *    bisogno di una transazione che commetta davvero prima di perdere la
 *    risposta, il secondo di un LOCK di riga di PostgreSQL. Un finto client
 *    direbbe di si' a entrambi senza provare niente.
 *
 * ```text
 *   caso 1   operazione COMMESSA con riuscita, risposta persa,
 *            operazione INVERSA di un altro utente prima della verifica
 *   caso 2   due richieste simultanee: la seconda lettura cade
 *            (a) PRIMA del primo commit   -> updateMany conta 0
 *            (b) DOPO  il primo commit    -> la rilettura trova l'effetto
 * ```
 */
describe('Cestino — concorrenza e risposte perse', () => {
  let prisma: PrismaClient;
  let products: ProductsService;
  let audit: PlatformAuditService;
  /** Ripristini da eseguire a fine prova, in ordine inverso. */
  let daRipristinare: Array<() => void> = [];

  const P1 = '95000000-0000-4000-8000-000000000001';
  const V1 = '96000000-0000-4000-8000-000000000001';

  /** Chi arriva PRIMO. */
  const primo: AttoreRegistro = {
    tipo: PlatformAuditActor.utente,
    userId: IDS.utenteA1,
    name: 'Mario Rossi',
    email: 'mario@example.test',
  };
  /** Chi arriva SECONDO, sullo stesso articolo e nello stesso istante. */
  const secondo: AttoreRegistro = {
    tipo: PlatformAuditActor.utente,
    userId: IDS.utenteSupervisore,
    name: 'Anna Bianchi',
    email: 'anna@example.test',
  };

  beforeAll(() => {
    ambienteIntegrazione();
    prisma = creaClientIntegrazione();
    audit = new PlatformAuditService(prisma as never, prisma as never);
    products = new ProductsService(
      prisma as never,
      { enqueueProductPush: () => undefined } as never,
      { prepareCategories: async () => undefined } as never,
      audit,
      new ShopifyLinkHistoryService(),
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await svuota(prisma);
    await creaDataset(prisma);
    // ⛔ Il registro non ha FK verso `tenants`: il TRUNCATE della fixture non
    //    lo raggiunge, e senza questa riga si leggerebbero le righe di prima.
    await prisma.platformAuditLog.deleteMany({});
    await prisma.$executeRawUnsafe(
      `INSERT INTO products (id, tenant_id, name, article_code, updated_at)
       VALUES ($1::uuid, $2::uuid, 'Articolo locale', 'LOC-1', now())`,
      P1,
      IDS.tenantA,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO product_variants (id, tenant_id, product_id, sku, selling_price_minor, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'SKU-LOC', 1000, now())`,
      V1,
      IDS.tenantA,
      P1,
    );
  });

  afterEach(() => {
    // ⚠️ Le prove sostituiscono metodi del client CONDIVISO: se un ripristino
    //    saltasse, le prove successive girerebbero su un client truccato.
    while (daRipristinare.length > 0) {
      daRipristinare.pop()!();
    }
    daRipristinare = [];
  });

  // ── attrezzi ─────────────────────────────────────────────────────────────

  /** Le righe di registro di un'entita', in ordine di scrittura. */
  async function registro(entityId: string) {
    return prisma.platformAuditLog.findMany({
      where: { entityId },
      orderBy: { createdAt: 'asc' },
      select: {
        correlationId: true,
        outcome: true,
        operation: true,
        actorUserId: true,
        detail: true,
      },
    });
  }

  /** Gli esiti raggruppati per correlazione, nell'ordine in cui sono comparse. */
  async function esitiPerCorrelazione(entityId: string): Promise<string[][]> {
    const righe = await registro(entityId);
    const gruppi = new Map<string, string[]>();
    for (const riga of righe) {
      const esiti = gruppi.get(riga.correlationId) ?? [];
      esiti.push(riga.outcome);
      gruppi.set(riga.correlationId, esiti);
    }
    return [...gruppi.values()];
  }

  /**
   * Sostituisce `$transaction` sul client condiviso perche' la PRIMA
   * transazione commetta davvero e poi perda la risposta.
   *
   * ⭐ **Il commit avviene sul serio**: `originale(...)` va fino in fondo, e
   *    solo dopo si solleva l'errore. E' la differenza fra «la risposta si e'
   *    persa» e «l'operazione e' fallita», che e' tutto il caso 1.
   *
   * ⚠️ Si disarma da se' alla prima esecuzione: `nelMezzo` puo' quindi
   *    chiamare altri metodi del servizio, che useranno la transazione vera.
   */
  function perdiLaRispostaDopoIlCommit(nelMezzo: () => Promise<void>): void {
    const client = prisma as unknown as {
      $transaction: (...argomenti: unknown[]) => Promise<unknown>;
    };
    const originale = client.$transaction.bind(prisma);
    daRipristinare.push(() => {
      client.$transaction = originale;
    });
    client.$transaction = async (...argomenti: unknown[]) => {
      client.$transaction = originale;
      await originale(...argomenti);
      await nelMezzo();
      throw new Error('connessione persa dopo il commit');
    };
  }

  /**
   * Sostituisce `$transaction` perche' la transazione PARTA e **non venga
   * attesa**: il client rinuncia mentre quella e' ancora viva.
   *
   * ⛔ **E' l'altro caso, e non e' lo stesso di `perdiLaRispostaDopoIlCommit`.**
   *    La' la transazione era gia' terminata e l'assenza di esito nel registro
   *    provava qualcosa. Qui non e' terminata affatto: puo' ancora commettere,
   *    e nessuna assenza prova niente.
   */
  function perdiLaRispostaMentreEInVolo(quandoRinunciare: () => Promise<unknown>): {
    readonly inVolo: Promise<unknown>;
  } {
    const client = prisma as unknown as {
      $transaction: (...argomenti: unknown[]) => Promise<unknown>;
    };
    const originale = client.$transaction.bind(prisma);
    daRipristinare.push(() => {
      client.$transaction = originale;
    });
    const scatola = { inVolo: Promise.resolve() as Promise<unknown> };
    client.$transaction = async (...argomenti: unknown[]) => {
      client.$transaction = originale;
      const inVolo = originale(...argomenti);
      // ⚠️ Nessuno la attende subito: senza questo, un suo fallimento sarebbe
      //    un rifiuto non gestito.
      inVolo.catch(() => undefined);
      scatola.inVolo = inVolo;
      await quandoRinunciare();
      throw new Error('timeout del client: la transazione e ancora in volo');
    };
    return scatola;
  }

  /**
   * Incastra un'altra richiesta FRA la lettura preliminare e la transazione.
   *
   * ⭐ `registraTentativo` e' esattamente quel punto: la lettura di idempotenza
   *    e' gia' passata (ha visto l'articolo intatto) e la transazione non e'
   *    ancora aperta. E' la finestra del caso 2b.
   */
  function altraRichiestaPrimaDellaTransazione(altra: () => Promise<void>): void {
    const originale = audit.registraTentativo.bind(audit);
    daRipristinare.push(() => {
      audit.registraTentativo = originale;
    });
    audit.registraTentativo = async (dati: DatiOperazione) => {
      audit.registraTentativo = originale;
      const correlazione = await originale(dati);
      await altra();
      return correlazione;
    };
  }

  /**
   * Esegue `secondaRichiesta` mentre la prima tiene la riga, e la sblocca solo
   * quando la seconda risulta bloccata PROPRIO da quella.
   *
   * ⛔ **Chiude sempre entrambe**, anche quando la prova fallisce: una
   *    transazione lasciata aperta tiene il lock, e i file successivi si
   *    fermerebbero sul troncamento della fixture con un errore che non nomina
   *    la causa.
   */
  async function conLaPrimaRichiestaSospesa(
    aggiornamento: string,
    parametri: unknown[],
    secondaRichiesta: () => Promise<void>,
  ): Promise<void> {
    const prima = await sospendiLaPrimaRichiesta(
      prisma,aggiornamento, parametri);
    let seconda: Promise<void> | undefined;
    let erroreDelCorpo: unknown;

    try {
      seconda = secondaRichiesta();
      seconda.catch(() => undefined);
      const bloccata = await attendiBloccoCausatoDa(prisma, prima.pid);
      // ⭐ Le due sessioni sono NOMINATE e distinte: la prova sa chi blocca chi.
      expect(bloccata).not.toBe(prima.pid);
    } catch (errore) {
      erroreDelCorpo = errore;
    }

    prima.sblocca();
    const esiti = await Promise.allSettled([prima.transazione, seconda ?? Promise.resolve()]);

    if (erroreDelCorpo !== undefined) {
      throw erroreDelCorpo;
    }
    for (const esito of esiti) {
      if (esito.status === 'rejected') {
        throw esito.reason;
      }
    }
  }

  // ── caso 0 · la prova prova quello che dice ──────────────────────────────

  it('0 · l attesa e` CAUSALE: un blocco fra sessioni ESTRANEE non la soddisfa', async () => {
    // Due sessioni che non c'entrano niente con la prova si bloccano fra loro.
    const estranea = await sospendiLaPrimaRichiesta(
      prisma,
      `UPDATE products SET name = 'contesa' WHERE id = $1::uuid`,
      [P1],
    );
    const contendente = prisma.$executeRawUnsafe(
      `UPDATE products SET name = 'contesa 2' WHERE id = $1::uuid`,
      P1,
    );
    contendente.catch(() => undefined);

    try {
      // ⛔ Esiste davvero un lock non concesso: la forma PRECEDENTE della
      //    attesa — «conta i lock non concessi» — sarebbe passata qui, e
      //    avrebbe dichiarato osservata una concorrenza che non ha causato.
      let nonConcessi = 0;
      for (let tentativo = 0; tentativo < 400 && nonConcessi === 0; tentativo += 1) {
        const righe = await prisma.$queryRawUnsafe<{ n: number }[]>(
          `SELECT count(*)::int AS n FROM pg_locks WHERE NOT granted`,
        );
        nonConcessi = righe[0]?.n ?? 0;
        if (nonConcessi === 0) {
          await new Promise((risolvi) => setTimeout(risolvi, 25));
        }
      }
      expect(nonConcessi).toBeGreaterThan(0);

      // ⭐ Ma nessuno e` bloccato dalla sessione NOMINATA, e l'attesa lo dice.
      const righe = await prisma.$queryRawUnsafe<{ inesistente: number }[]>(
        `SELECT coalesce(max(pid), 0) + 10000 AS inesistente FROM pg_stat_activity`,
      );
      await expect(attendiBloccoCausatoDa(prisma, righe[0]!.inesistente, 8)).rejects.toThrow(
        /nessuna sessione risulta bloccata dalla sessione/,
      );

      // ⭐ E con la sessione GIUSTA la stessa attesa riesce subito.
      const bloccata = await attendiBloccoCausatoDa(prisma, estranea.pid);
      expect(bloccata).not.toBe(estranea.pid);
    } finally {
      estranea.sblocca();
      await Promise.allSettled([estranea.transazione, contendente]);
    }
  });

  // ── caso 1 · risposta persa dopo il commit ───────────────────────────────

  it('1a · PRODOTTO: commesso con riuscita, risposta persa, un altro utente ripristina — nessun fallimento a verbale', async () => {
    perdiLaRispostaDopoIlCommit(async () => {
      // ⭐ L'operazione INVERSA, da un ALTRO utente, prima della verifica.
      await products.restoreFromTrash(IDS.tenantA, P1, secondo);
    });

    await expect(products.moveToTrash(IDS.tenantA, P1, primo, 'doppione')).rejects.toThrow(
      /connessione persa dopo il commit/,
    );

    // ⛔ Lo STATO non accerta il rollback: l'articolo e' fuori dal cestino, ma
    //    non perche' il cestino sia fallito — perche' un altro l'ha ripristinato.
    const prodotto = await prisma.product.findUniqueOrThrow({
      where: { id: P1 },
      select: { deletedAt: true },
    });
    expect(prodotto.deletedAt).toBeNull();

    // ⭐ E il registro dice la verita': il cestino ha COMMESSO.
    const righe = await registro(P1);
    expect(righe.map((r) => r.outcome)).toEqual([
      'tentativo',
      'riuscita',
      'tentativo',
      'riuscita',
    ]);
    expect(righe.filter((r) => r.outcome === 'fallita')).toHaveLength(0);
    expect(righe[1]!.operation).toBe('cestino_prodotto');
    expect(righe[1]!.actorUserId).toBe(IDS.utenteA1);
    expect(righe[3]!.operation).toBe('ripristino_prodotto');
    expect(righe[3]!.actorUserId).toBe(IDS.utenteSupervisore);
  });

  it('1b · VARIANTE: stesso caso, stessa garanzia', async () => {
    perdiLaRispostaDopoIlCommit(async () => {
      await products.restoreVariantFromTrash(IDS.tenantA, P1, V1, secondo);
    });

    await expect(
      products.moveVariantToTrash(IDS.tenantA, P1, V1, primo, 'taglia sbagliata'),
    ).rejects.toThrow(/connessione persa dopo il commit/);

    const variante = await prisma.productVariant.findUniqueOrThrow({
      where: { id: V1 },
      select: { deletedAt: true },
    });
    expect(variante.deletedAt).toBeNull();

    const righe = await registro(V1);
    expect(righe.map((r) => r.outcome)).toEqual([
      'tentativo',
      'riuscita',
      'tentativo',
      'riuscita',
    ]);
    expect(righe.filter((r) => r.outcome === 'fallita')).toHaveLength(0);
    expect(righe[1]!.operation).toBe('cestino_variante');
    expect(righe[3]!.operation).toBe('ripristino_variante');
  });

  it('1c · registro ILLEGGIBILE alla verifica: l esito resta incerto, non fallito', async () => {
    // ⭐ Qui la transazione fallisce DAVVERO (rollback vero), ma la verifica
    //    non riesce a leggere il registro: non si sa se abbia commesso.
    const rotto = new PlatformAuditService(prisma as never, prisma as never);
    rotto.registraRiuscita = async () => {
      throw new Error('scrittura della riuscita rifiutata');
    };
    const conteggio = (
      rotto as unknown as { prisma: { platformAuditLog: { count: () => Promise<number> } } }
    ).prisma.platformAuditLog;
    const contaOriginale = conteggio.count.bind(conteggio);
    daRipristinare.push(() => {
      conteggio.count = contaOriginale;
    });
    conteggio.count = async () => {
      throw new Error('registro non leggibile');
    };
    const servizio = new ProductsService(
      prisma as never,
      { enqueueProductPush: () => undefined } as never,
      { prepareCategories: async () => undefined } as never,
      rotto,
      new ShopifyLinkHistoryService(),
    );

    await expect(servizio.moveToTrash(IDS.tenantA, P1, primo)).rejects.toThrow(
      /scrittura della riuscita rifiutata/,
    );

    // ⭐ La transazione ha rotolato indietro per davvero…
    const prodotto = await prisma.product.findUniqueOrThrow({
      where: { id: P1 },
      select: { deletedAt: true },
    });
    expect(prodotto.deletedAt).toBeNull();

    // ⛔ …ma il registro non era leggibile: resta il tentativo senza esito, che
    //    si legge «non si sa». Mai una `fallita` scritta al buio.
    const righe = await registro(P1);
    expect(righe.map((r) => r.outcome)).toEqual(['tentativo']);
  });

  it('1d · PRODOTTO: la transazione e` ancora IN VOLO — esito incerto, e poi si conclude da se`', async () => {
    // Il primo tiene la riga: la transazione del secondo restera' ferma sul
    // lock, viva, e in grado di commettere piu' tardi.
    const prima = await sospendiLaPrimaRichiesta(
      prisma,
      `UPDATE products
          SET deleted_at = now(), deleted_by_id = $2::uuid, deletion_reason = 'del primo'
        WHERE id = $1::uuid AND deleted_at IS NULL`,
      [P1, IDS.utenteA1],
    );
    const volo = perdiLaRispostaMentreEInVolo(() => attendiBloccoCausatoDa(prisma, prima.pid));

    try {
      await expect(products.moveToTrash(IDS.tenantA, P1, secondo, 'del secondo')).rejects.toThrow(
        /ancora in volo/,
      );

      // ⛔ QUI e` il punto della prova: la transazione non e` terminata, quindi
      //    non si e` accertato nessun rollback. Scrivere «fallita» adesso
      //    sarebbe la stessa deduzione sbagliata, spostata di un passo.
      expect((await registro(P1)).map((r) => r.outcome)).toEqual(['tentativo']);
    } finally {
      prima.sblocca();
      await Promise.allSettled([prima.transazione, volo.inVolo]);
    }

    // ⭐ E infatti si conclude da se`: l'esito vero e` `ininfluente`.
    expect((await registro(P1)).map((r) => r.outcome)).toEqual(['tentativo', 'ininfluente']);
    const prodotto = await prisma.product.findUniqueOrThrow({
      where: { id: P1 },
      select: { deletedById: true, deletionReason: true },
    });
    expect(prodotto.deletedById).toBe(IDS.utenteA1);
    expect(prodotto.deletionReason).toBe('del primo');
  });

  it('1e · VARIANTE: la transazione e` ancora IN VOLO — esito incerto', async () => {
    const prima = await sospendiLaPrimaRichiesta(
      prisma,
      `UPDATE product_variants
          SET deleted_at = now(), deleted_by_id = $2::uuid, deletion_reason = 'del primo'
        WHERE id = $1::uuid AND deleted_at IS NULL`,
      [V1, IDS.utenteA1],
    );
    const volo = perdiLaRispostaMentreEInVolo(() => attendiBloccoCausatoDa(prisma, prima.pid));

    try {
      await expect(
        products.moveVariantToTrash(IDS.tenantA, P1, V1, secondo, 'del secondo'),
      ).rejects.toThrow(/ancora in volo/);
      expect((await registro(V1)).map((r) => r.outcome)).toEqual(['tentativo']);
    } finally {
      prima.sblocca();
      await Promise.allSettled([prima.transazione, volo.inVolo]);
    }

    expect((await registro(V1)).map((r) => r.outcome)).toEqual(['tentativo', 'ininfluente']);
    const variante = await prisma.productVariant.findUniqueOrThrow({
      where: { id: V1 },
      select: { deletedById: true },
    });
    expect(variante.deletedById).toBe(IDS.utenteA1);
  });

  it('1f · registro e transazione sono DUE testimoni: davanti a un esito gia` scritto non si aggiunge un fallimento', async () => {
    // ⚠️ Questa prova esiste perche` i due controlli sono ridondanti nel
    //    percorso reale: lo stato della transazione assorbe quello del
    //    registro, e togliendo il secondo NESSUNA delle altre prove
    //    arrossisce. Un controllo che nessuno puo` falsificare e` un controllo
    //    che prima o poi qualcuno toglie.
    const dati: DatiOperazione = {
      tenantId: IDS.tenantA,
      attore: primo,
      operation: 'cestino_prodotto',
      entityId: P1,
      entityLabel: 'Articolo locale',
    };

    // Una transazione ABORTITA davvero, di cui si conosce l'identificativo.
    let xidAbortito = '';
    await prisma
      .$transaction(async (tx) => {
        xidAbortito = await audit.identificaTransazione(tx);
        throw new Error('rollback voluto');
      })
      .catch(() => undefined);
    expect(xidAbortito).not.toBe('');

    // …ma il registro porta gia` una riuscita per quella correlazione. E` uno
    // stato INCOERENTE, che non dovrebbe potersi produrre: proprio per questo
    // la reazione non puo` essere aggiungere un secondo fatto contrario.
    const correlazione = await audit.registraTentativo(dati);
    await audit.registraRiuscita(prisma as never, correlazione, dati);

    await audit.registraEsitoNegativo(correlazione, dati, 'fallita', 'prova', xidAbortito);

    const righe = await registro(P1);
    expect(righe.map((r) => r.outcome)).toEqual(['tentativo', 'riuscita']);
    expect(righe.filter((r) => r.outcome === 'fallita')).toHaveLength(0);
  });

  // ── caso 2a · la seconda lettura precede il primo commit ─────────────────

  it('2a · PRODOTTO: la seconda richiesta legge PRIMA del commit e si blocca sul lock — ininfluente, non riuscita', async () => {
    await conLaPrimaRichiestaSospesa(
      `UPDATE products
          SET deleted_at = now(), deleted_by_id = $2::uuid, deletion_reason = 'del primo'
        WHERE id = $1::uuid AND deleted_at IS NULL`,
      [P1, IDS.utenteA1],
      // ⭐ Non deve sollevare: una richiesta concorrente non e' un errore.
      () => products.moveToTrash(IDS.tenantA, P1, secondo, 'del secondo'),
    );

    // ⛔ La modifica NON e' del secondo operatore: non gliela si attribuisce.
    const prodotto = await prisma.product.findUniqueOrThrow({
      where: { id: P1 },
      select: { deletedById: true, deletionReason: true },
    });
    expect(prodotto.deletedById).toBe(IDS.utenteA1);
    expect(prodotto.deletionReason).toBe('del primo');

    // ⭐ Il tentativo del secondo ha un esito, e l'esito e' `ininfluente`.
    const righe = await registro(P1);
    expect(righe.map((r) => r.outcome)).toEqual(['tentativo', 'ininfluente']);
    expect(righe[1]!.actorUserId).toBe(IDS.utenteSupervisore);
    expect(righe[1]!.detail).toContain('concorrente');
    expect(righe.filter((r) => r.outcome === 'riuscita')).toHaveLength(0);
  });

  it('2b · VARIANTE: la seconda richiesta legge PRIMA del commit — ininfluente', async () => {
    await conLaPrimaRichiestaSospesa(
      `UPDATE product_variants
          SET deleted_at = now(), deleted_by_id = $2::uuid, deletion_reason = 'del primo'
        WHERE id = $1::uuid AND deleted_at IS NULL`,
      [V1, IDS.utenteA1],
      () => products.moveVariantToTrash(IDS.tenantA, P1, V1, secondo, 'del secondo'),
    );

    const variante = await prisma.productVariant.findUniqueOrThrow({
      where: { id: V1 },
      select: { deletedById: true, deletionReason: true },
    });
    expect(variante.deletedById).toBe(IDS.utenteA1);
    expect(variante.deletionReason).toBe('del primo');

    const righe = await registro(V1);
    expect(righe.map((r) => r.outcome)).toEqual(['tentativo', 'ininfluente']);
    expect(righe.filter((r) => r.outcome === 'riuscita')).toHaveLength(0);
  });

  it('2c · RIPRISTINO concorrente: la seconda legge prima del commit — ininfluente', async () => {
    await products.moveToTrash(IDS.tenantA, P1, primo, 'doppione');
    await prisma.platformAuditLog.deleteMany({});

    await conLaPrimaRichiestaSospesa(
      `UPDATE products
          SET deleted_at = NULL, deleted_by_id = NULL, deletion_reason = NULL, status = 'archived'
        WHERE id = $1::uuid AND deleted_at IS NOT NULL`,
      [P1],
      () => products.restoreFromTrash(IDS.tenantA, P1, secondo),
    );

    const prodotto = await prisma.product.findUniqueOrThrow({
      where: { id: P1 },
      select: { deletedAt: true },
    });
    expect(prodotto.deletedAt).toBeNull();

    const righe = await registro(P1);
    expect(righe.map((r) => r.outcome)).toEqual(['tentativo', 'ininfluente']);
    expect(righe[1]!.operation).toBe('ripristino_prodotto');
  });

  // ── caso 2b · la seconda lettura segue il primo commit ───────────────────

  it('2d · PRODOTTO: la seconda richiesta legge DOPO il commit — ininfluente, non un falso 404', async () => {
    altraRichiestaPrimaDellaTransazione(async () => {
      await products.moveToTrash(IDS.tenantA, P1, primo, 'del primo');
    });

    // ⛔ Prima dell'08/09/2026 questa riga sollevava «Prodotto non trovato» su
    //    un prodotto che esiste: un 404 falso, per una richiesta concorrente.
    await expect(
      products.moveToTrash(IDS.tenantA, P1, secondo, 'del secondo'),
    ).resolves.toBeUndefined();

    const prodotto = await prisma.product.findUniqueOrThrow({
      where: { id: P1 },
      select: { deletedById: true, deletionReason: true },
    });
    expect(prodotto.deletedById).toBe(IDS.utenteA1);
    expect(prodotto.deletionReason).toBe('del primo');

    // ⭐ Due correlazioni, ognuna col proprio esito: nessun tentativo orfano.
    expect(await esitiPerCorrelazione(P1)).toEqual([
      ['tentativo', 'ininfluente'],
      ['tentativo', 'riuscita'],
    ]);
  });

  it('2e · VARIANTE: la seconda richiesta legge DOPO il commit — ininfluente', async () => {
    altraRichiestaPrimaDellaTransazione(async () => {
      await products.moveVariantToTrash(IDS.tenantA, P1, V1, primo, 'del primo');
    });

    await expect(
      products.moveVariantToTrash(IDS.tenantA, P1, V1, secondo, 'del secondo'),
    ).resolves.toBeUndefined();

    const variante = await prisma.productVariant.findUniqueOrThrow({
      where: { id: V1 },
      select: { deletedById: true, deletionReason: true },
    });
    expect(variante.deletedById).toBe(IDS.utenteA1);
    expect(variante.deletionReason).toBe('del primo');

    expect(await esitiPerCorrelazione(V1)).toEqual([
      ['tentativo', 'ininfluente'],
      ['tentativo', 'riuscita'],
    ]);
  });

  it('2f · un articolo davvero SCOMPARSO resta un 404: `ininfluente` non copre tutto', async () => {
    altraRichiestaPrimaDellaTransazione(async () => {
      // ⛔ Non il cestino: la riga viene proprio tolta dal database.
      await prisma.$executeRawUnsafe(`DELETE FROM products WHERE id = $1::uuid`, P1);
    });

    await expect(products.moveToTrash(IDS.tenantA, P1, secondo)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const righe = await registro(P1);
    expect(righe.map((r) => r.outcome)).toEqual(['tentativo', 'fallita']);
  });
});
