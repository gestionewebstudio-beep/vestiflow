import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ambienteIntegrazione } from './env';
import { creaDataset, IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';

/**
 * Identita' remote e periodi — la famiglia ARTICOLI.
 *
 * ⛔ **Ogni prova qui nasce da un difetto MISURATO il 07/09/2026**, non da un
 *    timore: quattro agenti hanno attaccato il disegno sul database di prova, e
 *    due bloccanti sono passati. Questi test sono la loro riproduzione, e la
 *    controprova che il rimedio regge.
 *
 * ⚠️ **E ogni divieto ha accanto il suo permesso.** Un controllo che blocca
 *    tutto non e' accettabile: la ripubblicazione, la ripresa e l'eliminazione
 *    definitiva devono continuare a riuscire, e qui si verifica che riescano.
 */
describe('Articoli — identita` remote e periodi di collegamento', () => {
  let prisma: PrismaClient;

  const SHOP = 'c0000000-0000-4000-8000-0000000000a1';
  const P1 = '90000000-0000-4000-8000-000000000001';
  const P2 = '90000000-0000-4000-8000-000000000002';
  const V1 = '91000000-0000-4000-8000-000000000001';
  const V2 = '91000000-0000-4000-8000-000000000002';

  beforeAll(() => {
    ambienteIntegrazione();
    prisma = creaClientIntegrazione();
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await svuota(prisma);
    await creaDataset(prisma);
    await prisma.$executeRawUnsafe(
      `INSERT INTO shopify_shops (id, tenant_id, shop_gid, updated_at)
       VALUES ($1::uuid, $2::uuid, 'gid://shopify/Shop/7001', now())`,
      SHOP,
      IDS.tenantA,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO products (id, tenant_id, name, article_code, updated_at) VALUES
         ($1::uuid, $3::uuid, 'Articolo uno', 'ART-1', now()),
         ($2::uuid, $3::uuid, 'Articolo due', 'ART-2', now())`,
      P1,
      P2,
      IDS.tenantA,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO product_variants (id, tenant_id, product_id, sku, selling_price_minor, updated_at) VALUES
         ($1::uuid, $3::uuid, $4::uuid, 'SKU-1', 1000, now()),
         ($2::uuid, $3::uuid, $4::uuid, 'SKU-2', 2000, now())`,
      V1,
      V2,
      IDS.tenantA,
      P1,
    );
  });

  // ── attrezzi ──────────────────────────────────────────────────────────────

  async function esito(sql: string, ...parametri: unknown[]): Promise<string | null> {
    try {
      await prisma.$executeRawUnsafe(sql, ...parametri);
      return null;
    } catch (errore) {
      return errore instanceof Error ? errore.message.replace(/\s+/g, ' ') : String(errore);
    }
  }

  function violato(messaggio: string | null): string | null {
    if (messaggio === null) return null;
    // ⚠️ Il nome del VINCOLO prima di tutto: il messaggio PostgreSQL nomina
    //    anche la TABELLA fra virgolette, e prenderla per prima faceva
    //    fallire quattro prove che il modello superava benissimo.
    const perVincolo = messaggio.match(/violates (?:foreign key|check) constraint "([a-z_]+)"/);
    if (perVincolo) return perVincolo[1]!;
    const perNome = messaggio.match(/"(shopify_[a-z_]+)"/);
    if (perNome) return perNome[1]!;
    const perFunzione = messaggio.match(/(shopify_[a-z_]+): /);
    if (perFunzione) return perFunzione[1]!;
    const perChiave = messaggio.match(/Code: `23505`[\s\S]*?Key \(([^)]*)\)=/);
    if (perChiave) return `unico:${perChiave[1]!.replace(/\s/g, '')}`;
    return `ALTRO: ${messaggio.trim().slice(0, 180)}`;
  }

  /** Crea un'identita` prodotto agganciata, e restituisce l'errore se c'e`. */
  function creaIdentita(id: string, gid: string, prodotto = P1): Promise<string | null> {
    return esito(
      `INSERT INTO shopify_product_identities
         (id, tenant_id, shop_id, shopify_product_gid, original_product_id, product_id, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, $5::uuid, now())`,
      id,
      IDS.tenantA,
      SHOP,
      gid,
      prodotto,
    );
  }

  function apriPeriodo(id: string, identita: string, prodotto = P1): Promise<string | null> {
    return esito(
      `INSERT INTO shopify_product_links
         (id, tenant_id, identity_id, original_product_id, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, now())`,
      id,
      IDS.tenantA,
      identita,
      prodotto,
    );
  }

  function chiudiPeriodo(id: string, causale = 'operator'): Promise<string | null> {
    return esito(
      `UPDATE shopify_product_links
          SET status = 'unlinked', close_reason = $2::"ShopifyLinkCloseReason", closed_at = now()
        WHERE id = $1::uuid`,
      id,
      causale,
    );
  }

  /** Chiude come ELIMINATO SU SHOPIFY: `remote_delete` vuole `remotely_deleted`. */
  function chiudiPeriodoComeEliminato(id: string): Promise<string | null> {
    return esito(
      `UPDATE shopify_product_links
          SET status = 'remotely_deleted', close_reason = 'remote_delete', closed_at = now()
        WHERE id = $1::uuid`,
      id,
    );
  }

  const ID = (n: number) => `a0000000-0000-4000-8000-00000000000${n}`;
  const PER = (n: number) => `b0000000-0000-4000-8000-00000000000${n}`;

  // ── 1 · L'identita` non si riassegna ──────────────────────────────────────

  describe('l identita` remota non si riassegna a un altro articolo', () => {
    it('rifiuta una seconda identita` con lo stesso GID', async () => {
      expect(await creaIdentita(ID(1), 'gid://shopify/Product/1')).toBeNull();
      expect(violato(await creaIdentita(ID(2), 'gid://shopify/Product/1', P2))).toBe(
        'unico:shop_id,shopify_product_gid',
      );
    });

    it('rifiuta di spostare il GID su un altra identita`', async () => {
      expect(await creaIdentita(ID(1), 'gid://shopify/Product/2')).toBeNull();
      expect(
        violato(
          await esito(
            `UPDATE shopify_product_identities SET shopify_product_gid = 'gid://shopify/Product/99' WHERE id = $1::uuid`,
            ID(1),
          ),
        ),
      ).toBe('shopify_product_identities_immutabile');
    });

    it('rifiuta di spostare l appartenenza originaria', async () => {
      expect(await creaIdentita(ID(1), 'gid://shopify/Product/3')).toBeNull();
      expect(
        violato(
          await esito(
            'UPDATE shopify_product_identities SET original_product_id = $2::uuid WHERE id = $1::uuid',
            ID(1),
            P2,
          ),
        ),
      ).toBe('shopify_product_identities_immutabile');
    });

    it('rifiuta un identita` che nasce gia` SGANCIATA — l appartenenza non verrebbe verificata mai', async () => {
      expect(
        violato(
          await esito(
            `INSERT INTO shopify_product_identities
               (tenant_id, shop_id, shopify_product_gid, original_product_id, product_id, local_deleted_at, updated_at)
             VALUES ($1::uuid, $2::uuid, 'gid://shopify/Product/4', $3::uuid, NULL, now(), now())`,
            IDS.tenantA,
            SHOP,
            '99999999-9999-4999-8999-999999999999',
          ),
        ),
      ).toBe('shopify_product_identities_nasce_agganciata');
    });

    it('rifiuta di RIAGGANCIARE un identita` sganciata', async () => {
      expect(await creaIdentita(ID(1), 'gid://shopify/Product/5')).toBeNull();
      expect(await apriPeriodo(PER(1), ID(1))).toBeNull();
      expect(await chiudiPeriodo(PER(1), 'local_delete')).toBeNull();
      expect(
        await esito(
          'UPDATE shopify_product_identities SET product_id = NULL, local_deleted_at = now() WHERE id = $1::uuid',
          ID(1),
        ),
      ).toBeNull();
      expect(
        violato(
          await esito(
            'UPDATE shopify_product_identities SET product_id = $2::uuid, local_deleted_at = NULL WHERE id = $1::uuid',
            ID(1),
            P1,
          ),
        ),
      ).toBe('shopify_product_identities_immutabile');
    });
  });

  // ── 2 · IL PRIMO BLOCCANTE: cancellare la storia ──────────────────────────

  describe('la storia non si cancella — il difetto misurato il 07/09/2026', () => {
    /**
     * ⛔ Riproduzione: cancellato il PERIODO (nessun vincolo lo guardava), poi
     *    l'identita', lo stesso GID rinasceva su un altro prodotto.
     */
    it('rifiuta di cancellare un periodo', async () => {
      expect(await creaIdentita(ID(1), 'gid://shopify/Product/10')).toBeNull();
      expect(await apriPeriodo(PER(1), ID(1))).toBeNull();
      expect(
        violato(await esito('DELETE FROM shopify_product_links WHERE id = $1::uuid', PER(1))),
      ).toBe('shopify_storico_non_si_cancella');
    });

    it('rifiuta di cancellare un identita`', async () => {
      expect(await creaIdentita(ID(1), 'gid://shopify/Product/11')).toBeNull();
      expect(
        violato(
          await esito('DELETE FROM shopify_product_identities WHERE id = $1::uuid', ID(1)),
        ),
      ).toBe('shopify_storico_non_si_cancella');
    });

    it('rifiuta il TRUNCATE, che non e` un DELETE e scavalcherebbe tutto', async () => {
      expect(await creaIdentita(ID(1), 'gid://shopify/Product/12')).toBeNull();
      expect(violato(await esito('TRUNCATE TABLE shopify_product_identities CASCADE'))).toBe(
        'shopify_storico_non_si_cancella',
      );
      expect(violato(await esito('TRUNCATE TABLE shopify_product_links CASCADE'))).toBe(
        'shopify_storico_non_si_cancella',
      );
    });

    it('e il GID resta quindi INDISPONIBILE per un altro articolo', async () => {
      expect(await creaIdentita(ID(1), 'gid://shopify/Product/13')).toBeNull();
      expect(await apriPeriodo(PER(1), ID(1))).toBeNull();
      expect(await chiudiPeriodo(PER(1))).toBeNull();
      // la via di fuga misurata: cancella il periodo, poi l'identita`, poi ricrea
      expect(
        violato(await esito('DELETE FROM shopify_product_links WHERE id = $1::uuid', PER(1))),
      ).toBe('shopify_storico_non_si_cancella');
      expect(violato(await creaIdentita(ID(2), 'gid://shopify/Product/13', P2))).toBe(
        'unico:shop_id,shopify_product_gid',
      );
    });
  });

  // ── 3 · IL SECONDO BLOCCANTE: la concorrenza ──────────────────────────────

  describe('un periodo attivo non convive con un identita` eliminata', () => {
    it('rifiuta di aprire un periodo su un identita` gia` sganciata', async () => {
      expect(await creaIdentita(ID(1), 'gid://shopify/Product/20')).toBeNull();
      expect(await apriPeriodo(PER(1), ID(1))).toBeNull();
      expect(await chiudiPeriodo(PER(1), 'local_delete')).toBeNull();
      expect(
        await esito(
          'UPDATE shopify_product_identities SET product_id = NULL, local_deleted_at = now() WHERE id = $1::uuid',
          ID(1),
        ),
      ).toBeNull();
      expect(violato(await apriPeriodo(PER(2), ID(1)))).toBe(
        'shopify_product_links_identita_viva_fkey',
      );
    });

    it('rifiuta di sganciare un identita` che ha un periodo attivo', async () => {
      expect(await creaIdentita(ID(1), 'gid://shopify/Product/21')).toBeNull();
      expect(await apriPeriodo(PER(1), ID(1))).toBeNull();
      expect(
        violato(
          await esito(
            'UPDATE shopify_product_identities SET product_id = NULL, local_deleted_at = now() WHERE id = $1::uuid',
            ID(1),
          ),
        ),
      ).toBe('shopify_product_links_identita_viva_fkey');
    });

    it('accetta un periodo CHIUSO su un identita` sganciata: la storia sopravvive', async () => {
      expect(await creaIdentita(ID(1), 'gid://shopify/Product/22')).toBeNull();
      expect(await apriPeriodo(PER(1), ID(1))).toBeNull();
      expect(await chiudiPeriodo(PER(1), 'local_delete')).toBeNull();
      expect(
        await esito(
          'UPDATE shopify_product_identities SET product_id = NULL, local_deleted_at = now() WHERE id = $1::uuid',
          ID(1),
        ),
      ).toBeNull();
      const righe = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        "SELECT count(*) AS n FROM shopify_product_links WHERE identity_id = $1::uuid AND status = 'unlinked'",
        ID(1),
      );
      expect(Number(righe[0]!.n)).toBe(1);
    });

    /**
     * ⭐ **La prova che un trigger non avrebbe superato.** Due connessioni vere,
     *    con l'incastro DICHIARATO invece che sperato: T1 chiude e sgancia, T2
     *    apre un periodo. Con la sola guardia procedurale entrambe committavano
     *    e restava un periodo attivo su un'identita' eliminata. Con la FK,
     *    PostgreSQL le serializza.
     *
     * ⛔ **La prima stesura era verde per il motivo sbagliato**, e va scritto
     *    perche' e' il difetto che questa riscrittura chiude:
     *
     *    - lanciava le due transazioni con `Promise.allSettled` e sperava che
     *      si incrociassero: nessuno verificava che la seconda si BLOCCASSE
     *      davvero. Due esecuzioni in fila l'avrebbero superata uguale;
     *    - chiedeva `riuscite < 2`, quindi **entrambe fallite** passava — e
     *      «non riesce niente» non e' la garanzia che si vuole;
     *    - lasciava il periodo PER(1) ATTIVO durante la prova, quindi
     *      l'inserimento di PER(2) cadeva sull'indice unico dei periodi attivi
     *      (`…_identity_attivo_key`) **prima** di arrivare alla FK: la nuova
     *      protezione non veniva nemmeno interrogata.
     *
     * ⭐ Qui il periodo di partenza e' CHIUSO — lo si verifica — quindi l'unica
     *    cosa che puo' rifiutare e' `…_identita_viva_fkey`, e la prova lo esige
     *    per nome.
     */
    describe('in CONCORRENZA, con le due transazioni coordinate', () => {
      const SGANCIA =
        'UPDATE shopify_product_identities SET product_id = NULL, local_deleted_at = now() WHERE id = $1::uuid';
      const APRI = `INSERT INTO shopify_product_links
           (id, tenant_id, identity_id, original_product_id, updated_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, now())`;

      /** Un cancello a un colpo: chi aspetta riparte quando qualcuno lo apre. */
      function cancello(): { attesa: Promise<void>; apri: () => void } {
        let sblocca!: () => void;
        const attesa = new Promise<void>((risolvi) => {
          sblocca = risolvi;
        });
        return { attesa, apri: () => sblocca() };
      }

      /**
       * Attende che UNA sessione risulti davvero **in attesa di un lock** su
       * quella tabella, e non si limita a dormire.
       *
       * ⭐ E' il cuore del coordinamento: senza, «le due transazioni si sono
       *    incrociate» resta un'ipotesi. Restituisce `false` se non accade,
       *    cosi` la prova fallisce dicendo che l'incastro non c'e' stato.
       */
      async function attendiBloccata(tabella: string): Promise<boolean> {
        for (let tentativo = 0; tentativo < 200; tentativo += 1) {
          const righe = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
            `SELECT count(*) AS n FROM pg_stat_activity
              WHERE state = 'active' AND wait_event_type = 'Lock' AND query ILIKE $1`,
            `%${tabella}%`,
          );
          if (Number(righe[0]!.n) > 0) return true;
          await new Promise((r) => setTimeout(r, 25));
        }
        return false;
      }

      function motivo(esito: PromiseSettledResult<unknown>): string | null {
        if (esito.status !== 'rejected') return null;
        const causa: unknown = esito.reason;
        return causa instanceof Error
          ? causa.message.replace(/\s+/g, ' ')
          : String(causa);
      }

      /**
       * Identita` VIVA, e nessun periodo attivo su di lei.
       *
       * ⚠️ E` la condizione che toglie di mezzo l'indice unico: senza, la prova
       *    misurerebbe quello invece della FK.
       */
      async function preparaSenzaPeriodoAttivo(): Promise<void> {
        expect(await creaIdentita(ID(1), 'gid://shopify/Product/30')).toBeNull();
        expect(await apriPeriodo(PER(1), ID(1))).toBeNull();
        expect(await chiudiPeriodo(PER(1), 'operator')).toBeNull();

        const attivi = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
          "SELECT count(*) AS n FROM shopify_product_links WHERE identity_id = $1::uuid AND status = 'active'",
          ID(1),
        );
        expect(
          Number(attivi[0]!.n),
          'nessun periodo attivo: altrimenti a rifiutare sarebbe l indice unico, non la FK',
        ).toBe(0);
      }

      /** Quanti periodi attivi pendono da un identita` gia` eliminata. */
      async function appesi(): Promise<number> {
        const righe = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
          `SELECT count(*) AS n FROM shopify_product_links l
             JOIN shopify_product_identities i ON i.id = l.identity_id
            WHERE l.status = 'active' AND i.product_id IS NULL`,
        );
        return Number(righe[0]!.n);
      }

      /** Lo stato dell'identita` e del periodo conteso, a giochi fatti. */
      async function statoFinale(): Promise<{ viva: boolean; per2: string | null }> {
        const identita = await prisma.$queryRawUnsafe<{ product_id: string | null }[]>(
          'SELECT product_id FROM shopify_product_identities WHERE id = $1::uuid',
          ID(1),
        );
        const periodo = await prisma.$queryRawUnsafe<{ status: string }[]>(
          'SELECT status::text AS status FROM shopify_product_links WHERE id = $1::uuid',
          PER(2),
        );
        return {
          viva: identita[0]!.product_id !== null,
          per2: periodo.length > 0 ? periodo[0]!.status : null,
        };
      }

      it('se SGANCIA per prima, l apertura concorrente viene rifiutata dalla FK', async () => {
        expect(ambienteIntegrazione().host).toBe('localhost:5433');
        await preparaSenzaPeriodoAttivo();

        const uno = creaClientIntegrazione();
        const due = creaClientIntegrazione();
        let bloccata = false;
        let esiti: PromiseSettledResult<unknown>[] = [];
        try {
          const sganciato = cancello();
          const viaLibera = cancello();

          const t1 = uno.$transaction(
            async (tx) => {
              await tx.$executeRawUnsafe(SGANCIA, ID(1));
              sganciato.apri();
              // ⭐ Non committa finche` T2 non e` davvero bloccata su di lei.
              await viaLibera.attesa;
            },
            { timeout: 60_000, maxWait: 30_000 },
          );
          t1.catch(() => undefined);

          await sganciato.attesa;
          const t2 = due.$transaction(
            async (tx) => {
              await tx.$executeRawUnsafe(APRI, PER(2), IDS.tenantA, ID(1), P1);
            },
            { timeout: 60_000, maxWait: 30_000 },
          );
          t2.catch(() => undefined);

          bloccata = await attendiBloccata('shopify_product_links');
          viaLibera.apri();
          esiti = await Promise.allSettled([t1, t2]);
        } finally {
          await uno.$disconnect();
          await due.$disconnect();
        }

        // ⭐ 1 · L'incastro c'e` stato davvero: T2 ha ATTESO T1.
        expect(bloccata, 'T2 doveva bloccarsi sul lock della riga identita`').toBe(true);
        // ⭐ 2 · Una riesce e una fallisce. «Entrambe fallite» NON passa.
        expect(esiti[0]!.status, 'chi committa per prima vince').toBe('fulfilled');
        expect(esiti[1]!.status).toBe('rejected');
        // ⭐ 3 · E fallisce per la RAGIONE attesa: la FK, non l indice unico.
        expect(violato(motivo(esiti[1]!))).toBe('shopify_product_links_identita_viva_fkey');
        // ⭐ 4 · Lo stato finale e` quello coerente, non «nessuno dei due».
        expect(await statoFinale()).toEqual({ viva: false, per2: null });
        expect(await appesi()).toBe(0);
      }, 90_000);

      it('se APRE per prima, lo sgancio concorrente viene rifiutato dalla FK', async () => {
        expect(ambienteIntegrazione().host).toBe('localhost:5433');
        await preparaSenzaPeriodoAttivo();

        const uno = creaClientIntegrazione();
        const due = creaClientIntegrazione();
        let bloccata = false;
        let esiti: PromiseSettledResult<unknown>[] = [];
        try {
          const aperto = cancello();
          const viaLibera = cancello();

          const t2 = due.$transaction(
            async (tx) => {
              await tx.$executeRawUnsafe(APRI, PER(2), IDS.tenantA, ID(1), P1);
              aperto.apri();
              await viaLibera.attesa;
            },
            { timeout: 60_000, maxWait: 30_000 },
          );
          t2.catch(() => undefined);

          await aperto.attesa;
          const t1 = uno.$transaction(
            async (tx) => {
              await tx.$executeRawUnsafe(SGANCIA, ID(1));
            },
            { timeout: 60_000, maxWait: 30_000 },
          );
          t1.catch(() => undefined);

          // ⭐ Qui a bloccarsi e` lo SGANCIO: la riga identita` e` gia`
          //    trattenuta dal lock che l'inserimento del figlio ha preso.
          bloccata = await attendiBloccata('shopify_product_identities');
          viaLibera.apri();
          esiti = await Promise.allSettled([t2, t1]);
        } finally {
          await uno.$disconnect();
          await due.$disconnect();
        }

        expect(bloccata, 'lo sgancio doveva bloccarsi sul lock preso dall inserimento').toBe(
          true,
        );
        expect(esiti[0]!.status, 'chi committa per prima vince').toBe('fulfilled');
        expect(esiti[1]!.status).toBe('rejected');
        expect(violato(motivo(esiti[1]!))).toBe('shopify_product_links_identita_viva_fkey');
        expect(await statoFinale()).toEqual({ viva: true, per2: 'active' });
        expect(await appesi()).toBe(0);
      }, 90_000);
    });
  });

  // ── 4 · Cio` che DEVE restare possibile ───────────────────────────────────

  describe('cio` che non deve essere bloccato', () => {
    it('la RIPUBBLICAZIONE: piu` identita` storiche per lo stesso articolo', async () => {
      expect(await creaIdentita(ID(1), 'gid://shopify/Product/40')).toBeNull();
      expect(await apriPeriodo(PER(1), ID(1))).toBeNull();
      expect(await chiudiPeriodo(PER(1), 'operator')).toBeNull();
      // ⭐ GID NUOVO per lo STESSO articolo: e` la ripubblicazione
      expect(await creaIdentita(ID(2), 'gid://shopify/Product/41')).toBeNull();
      expect(await apriPeriodo(PER(2), ID(2))).toBeNull();

      const identita = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        'SELECT count(*) AS n FROM shopify_product_identities WHERE original_product_id = $1::uuid',
        P1,
      );
      const attivi = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        "SELECT count(*) AS n FROM shopify_product_links WHERE original_product_id = $1::uuid AND status = 'active'",
        P1,
      );
      expect(Number(identita[0]!.n)).toBe(2);
      expect(Number(attivi[0]!.n)).toBe(1);
    });

    it('la RIPRESA della stessa identita`: periodo nuovo, stesso GID', async () => {
      expect(await creaIdentita(ID(1), 'gid://shopify/Product/42')).toBeNull();
      expect(await apriPeriodo(PER(1), ID(1))).toBeNull();
      expect(await chiudiPeriodo(PER(1), 'shop_change')).toBeNull();
      expect(await apriPeriodo(PER(2), ID(1))).toBeNull();
    });

    it('rifiuta pero` due collegamenti attivi sulla stessa ANAGRAFICA', async () => {
      expect(await creaIdentita(ID(1), 'gid://shopify/Product/43')).toBeNull();
      expect(await apriPeriodo(PER(1), ID(1))).toBeNull();
      expect(await creaIdentita(ID(2), 'gid://shopify/Product/44')).toBeNull();
      expect(violato(await apriPeriodo(PER(2), ID(2)))).toBe('unico:original_product_id');
    });

    it("l'ELIMINAZIONE DEFINITIVA dell anagrafica resta possibile", async () => {
      expect(await creaIdentita(ID(1), 'gid://shopify/Product/45')).toBeNull();
      expect(await apriPeriodo(PER(1), ID(1))).toBeNull();
      // la sequenza: chiudo, sgancio, elimino
      expect(await chiudiPeriodo(PER(1), 'local_delete')).toBeNull();
      expect(
        await esito(
          'UPDATE shopify_product_identities SET product_id = NULL, local_deleted_at = now() WHERE id = $1::uuid',
          ID(1),
        ),
      ).toBeNull();
      await prisma.$executeRawUnsafe('DELETE FROM product_variants WHERE product_id = $1::uuid', P1);
      expect(await esito('DELETE FROM products WHERE id = $1::uuid', P1)).toBeNull();

      // ⭐ L'anagrafica non c'e` piu`, l'identita` remota SI`
      const rimaste = await prisma.$queryRawUnsafe<{ n: bigint; gid: string }[]>(
        'SELECT count(*)::int AS n, min(shopify_product_gid) AS gid FROM shopify_product_identities WHERE original_product_id = $1::uuid',
        P1,
      );
      expect(Number(rimaste[0]!.n)).toBe(1);
      expect(rimaste[0]!.gid).toBe('gid://shopify/Product/45');
    });

    it("e dopo l'eliminazione il GID NON e` riutilizzabile per un altro articolo", async () => {
      expect(await creaIdentita(ID(1), 'gid://shopify/Product/46')).toBeNull();
      expect(await apriPeriodo(PER(1), ID(1))).toBeNull();
      expect(await chiudiPeriodo(PER(1), 'local_delete')).toBeNull();
      expect(
        await esito(
          'UPDATE shopify_product_identities SET product_id = NULL, local_deleted_at = now() WHERE id = $1::uuid',
          ID(1),
        ),
      ).toBeNull();
      expect(violato(await creaIdentita(ID(2), 'gid://shopify/Product/46', P2))).toBe(
        'unico:shop_id,shopify_product_gid',
      );
    });
  });

  // ── 5 · Causali e date non si riscrivono ──────────────────────────────────

  describe('causali e date restano quelle', () => {
    it('non si riapre un periodo chiuso e non se ne riscrive la causale', async () => {
      expect(await creaIdentita(ID(1), 'gid://shopify/Product/50')).toBeNull();
      expect(await apriPeriodo(PER(1), ID(1))).toBeNull();
      expect(await chiudiPeriodoComeEliminato(PER(1))).toBeNull();
      expect(
        violato(
          await esito(
            `UPDATE shopify_product_links SET status='active', close_reason=NULL, closed_at=NULL WHERE id=$1::uuid`,
            PER(1),
          ),
        ),
      ).toBe('shopify_periodo_immutabile');
      expect(
        violato(
          await esito(
            `UPDATE shopify_product_links SET close_reason='operator' WHERE id=$1::uuid`,
            PER(1),
          ),
        ),
      ).toBe('shopify_periodo_immutabile');
    });

    it('local_deleted_at si scrive UNA volta: un eliminazione successiva non la riscrive', async () => {
      expect(await creaIdentita(ID(1), 'gid://shopify/Product/51')).toBeNull();
      expect(await apriPeriodo(PER(1), ID(1))).toBeNull();
      expect(await chiudiPeriodo(PER(1), 'local_delete')).toBeNull();
      expect(
        await esito(
          `UPDATE shopify_product_identities SET product_id = NULL, local_deleted_at = TIMESTAMP '2026-03-01 10:00:00' WHERE id = $1::uuid`,
          ID(1),
        ),
      ).toBeNull();
      expect(
        violato(
          await esito(
            'UPDATE shopify_product_identities SET local_deleted_at = now() WHERE id = $1::uuid',
            ID(1),
          ),
        ),
      ).toBe('shopify_product_identities_immutabile');
      const quando = await prisma.$queryRawUnsafe<{ d: Date }[]>(
        'SELECT local_deleted_at AS d FROM shopify_product_identities WHERE id = $1::uuid',
        ID(1),
      );
      expect(quando[0]!.d.toISOString()).toContain('2026-03-01');
    });
  });

  // ── 6 · La gerarchia variante -> prodotto ─────────────────────────────────

  describe('la gerarchia regge anche a riferimenti sganciati', () => {
    async function creaVariante(id: string, padre: string, gid: string, variante = V1) {
      return esito(
        `INSERT INTO shopify_variant_identities
           (id, tenant_id, shop_id, product_identity_id, shopify_variant_gid,
            original_variant_id, original_product_id, variant_id, product_id, updated_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6::uuid, $7::uuid, $6::uuid, $7::uuid, now())`,
        id,
        IDS.tenantA,
        SHOP,
        padre,
        gid,
        variante,
        P1,
      );
    }

    it('accetta una variante sotto il proprio prodotto', async () => {
      expect(await creaIdentita(ID(1), 'gid://shopify/Product/60')).toBeNull();
      expect(
        await creaVariante(ID(3), ID(1), 'gid://shopify/ProductVariant/60'),
      ).toBeNull();
    });

    it('rifiuta di sganciare il PRODOTTO mentre una variante e` viva', async () => {
      expect(await creaIdentita(ID(1), 'gid://shopify/Product/61')).toBeNull();
      expect(await creaVariante(ID(3), ID(1), 'gid://shopify/ProductVariant/61')).toBeNull();
      expect(
        violato(
          await esito(
            'UPDATE shopify_product_identities SET product_id = NULL, local_deleted_at = now() WHERE id = $1::uuid',
            ID(1),
          ),
        ),
      ).toBe('shopify_variant_identities_padre_vivo_fkey');
    });

    it('accetta la purga nell ordine giusto: prima le varianti, poi il prodotto', async () => {
      expect(await creaIdentita(ID(1), 'gid://shopify/Product/62')).toBeNull();
      expect(await creaVariante(ID(3), ID(1), 'gid://shopify/ProductVariant/62')).toBeNull();
      expect(
        await esito(
          'UPDATE shopify_variant_identities SET variant_id = NULL, product_id = NULL, local_deleted_at = now() WHERE id = $1::uuid',
          ID(3),
        ),
      ).toBeNull();
      expect(
        await esito(
          'UPDATE shopify_product_identities SET product_id = NULL, local_deleted_at = now() WHERE id = $1::uuid',
          ID(1),
        ),
      ).toBeNull();
      // ⭐ Tutta la storia remota e` ancora li`
      const storia = await prisma.$queryRawUnsafe<{ p: bigint; v: bigint }[]>(
        `SELECT (SELECT count(*) FROM shopify_product_identities) AS p,
                (SELECT count(*) FROM shopify_variant_identities) AS v`,
      );
      expect(Number(storia[0]!.p)).toBe(1);
      expect(Number(storia[0]!.v)).toBe(1);
    });
  });

  // ── 7 · Rollback ──────────────────────────────────────────────────────────

  it('una sequenza che fallisce a meta` lascia tutto come prima', async () => {
    expect(await creaIdentita(ID(1), 'gid://shopify/Product/70')).toBeNull();
    expect(await apriPeriodo(PER(1), ID(1))).toBeNull();

    const prima = await prisma.$queryRawUnsafe<{ s: string; p: string | null }[]>(
      `SELECT l.status::text AS s, i.product_id::text AS p
         FROM shopify_product_links l JOIN shopify_product_identities i ON i.id = l.identity_id
        WHERE l.id = $1::uuid`,
      PER(1),
    );

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `UPDATE shopify_product_links SET status='unlinked', close_reason='local_delete', closed_at=now() WHERE id=$1::uuid`,
          PER(1),
        );
        await tx.$executeRawUnsafe(
          'UPDATE shopify_product_identities SET product_id = NULL, local_deleted_at = now() WHERE id = $1::uuid',
          ID(1),
        );
        // il guasto: una riga che non esiste
        await tx.$executeRawUnsafe('SELECT 1 FROM tabella_che_non_esiste');
      }),
    ).rejects.toThrow();

    const dopo = await prisma.$queryRawUnsafe<{ s: string; p: string | null }[]>(
      `SELECT l.status::text AS s, i.product_id::text AS p
         FROM shopify_product_links l JOIN shopify_product_identities i ON i.id = l.identity_id
        WHERE l.id = $1::uuid`,
      PER(1),
    );
    expect(dopo).toEqual(prima);
    expect(dopo[0]!.s).toBe('active');
    expect(dopo[0]!.p).toBe(P1);
  });

  // ── 8 · Le sedi non hanno perso la correzione iniziale ────────────────────

  describe('le sedi: stessa falla chiusa, ma la correzione iniziale resta', () => {
    const COPPIA = 'd0000000-0000-4000-8000-0000000000f1';

    it('rifiuta di cancellare un periodo di sede', async () => {
      await prisma.$executeRawUnsafe(
        `INSERT INTO shopify_location_pairs (id, tenant_id, shop_id, location_id, shopify_location_gid, updated_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'gid://shopify/Location/80', now())`,
        COPPIA,
        IDS.tenantA,
        SHOP,
        IDS.locA1,
      );
      await prisma.$executeRawUnsafe(
        `INSERT INTO shopify_location_links (tenant_id, pair_id, updated_at) VALUES ($1::uuid, $2::uuid, now())`,
        IDS.tenantA,
        COPPIA,
      );
      expect(
        violato(
          await esito('DELETE FROM shopify_location_links WHERE pair_id = $1::uuid', COPPIA),
        ),
      ).toBe('shopify_storico_non_si_cancella');
    });

    it('MA una coppia SENZA periodi resta cancellabile: e` la correzione iniziale', async () => {
      await prisma.$executeRawUnsafe(
        `INSERT INTO shopify_location_pairs (id, tenant_id, shop_id, location_id, shopify_location_gid, updated_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'gid://shopify/Location/81', now())`,
        COPPIA,
        IDS.tenantA,
        SHOP,
        IDS.locA1,
      );
      expect(
        await esito('DELETE FROM shopify_location_pairs WHERE id = $1::uuid', COPPIA),
      ).toBeNull();
    });
  });
});
