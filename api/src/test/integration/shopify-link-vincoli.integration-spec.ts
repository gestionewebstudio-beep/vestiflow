import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ambienteIntegrazione } from './env';
import { creaDataset, IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';

/**
 * I vincoli dello storico dei collegamenti Shopify, provati VIOLANDOLI.
 *
 * ⛔ **Un test che verifica solo i rifiuti si rompe restando verde.** Se un
 *    vincolo diventasse piu' largo del dovuto, i rifiuti continuerebbero a
 *    fallire per un'altra ragione e nessuno se ne accorgerebbe: per questo ogni
 *    gruppo ha anche il suo CASO VALIDO, che deve RIUSCIRE.
 *
 * ⚠️ **Si controlla il NOME del vincolo, non solo che l'errore ci sia.** Un
 *    INSERT rifiutato dalla chiave esterna sul tenant sembra identico a uno
 *    rifiutato dal CHECK che si voleva provare — ed e' successo davvero, in una
 *    prima stesura di queste prove eseguita a mano: la preparazione falliva su
 *    una colonna inesistente e meta' delle verifiche era rifiutata dalla FK
 *    invece che dal vincolo in esame.
 *
 * Riferimenti: `docs/24` §1.13 (sedi), §8.5.2 (modello), migration
 * `20260907000000_shopify_link_history`.
 */
describe('Storico collegamenti Shopify — i vincoli del modello', () => {
  let prisma: PrismaClient;

  const SHOP_A = 'c0000000-0000-4000-8000-00000000000a';
  const SHOP_B = 'c0000000-0000-4000-8000-00000000000b';

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
      `INSERT INTO shopify_shops (id, tenant_id, shop_gid, updated_at) VALUES
         ($1::uuid, $2::uuid, 'gid://shopify/Shop/9101', now()),
         ($3::uuid, $4::uuid, 'gid://shopify/Shop/9102', now())`,
      SHOP_A,
      IDS.tenantA,
      SHOP_B,
      IDS.tenantB,
    );
  });

  /** Crea una COPPIA sede ↔ location e restituisce l'errore, se c'e'. */
  async function abbina(valori: {
    id?: string;
    tenant?: string;
    shop?: string;
    sede?: string;
    gid: string;
  }): Promise<string | null> {
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO shopify_location_pairs
           (id, tenant_id, shop_id, location_id, shopify_location_gid, updated_at)
         VALUES (coalesce($1, gen_random_uuid()::text)::uuid, $2::uuid, $3::uuid, $4::uuid, $5, now())`,
        valori.id ?? null,
        valori.tenant ?? IDS.tenantA,
        valori.shop ?? SHOP_A,
        valori.sede ?? IDS.locA1,
        valori.gid,
      );
      return null;
    } catch (errore) {
      return errore instanceof Error ? errore.message : String(errore);
    }
  }

  /** Apre un PERIODO di collegamento su una coppia. */
  async function apriPeriodo(valori: {
    id?: string;
    tenant?: string;
    coppia: string;
    stato?: string;
    causale?: string | null;
    chiusoIl?: boolean;
    chiusuraPrimaDellApertura?: boolean;
  }): Promise<string | null> {
    const stato = valori.stato ?? 'active';
    const chiuso = valori.chiusoIl ?? stato !== 'active';
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO shopify_location_links
           (id, tenant_id, pair_id, status, close_reason, linked_at, closed_at, updated_at)
         VALUES (coalesce($1, gen_random_uuid()::text)::uuid, $2::uuid, $3::uuid,
                 $4::"ShopifyLinkStatus", $5::"ShopifyLinkCloseReason",
                 now(),
                 CASE WHEN $7::boolean THEN now() - interval '1 day'
                      WHEN $6::boolean THEN now() ELSE NULL END,
                 now())`,
        valori.id ?? null,
        valori.tenant ?? IDS.tenantA,
        valori.coppia,
        stato,
        valori.causale ?? null,
        chiuso,
        valori.chiusuraPrimaDellApertura ?? false,
      );
      return null;
    } catch (errore) {
      return errore instanceof Error ? errore.message : String(errore);
    }
  }

  /**
   * Il nome del vincolo violato, o `null` se l'operazione e' riuscita.
   *
   * ⚠️ **Su un INDICE UNICO il nome non arriva**, ed e' misurato: Prisma
   *    restituisce `Code: 23505` con la chiave che ha collidito
   *    (`Key (location_id)=(...) already exists`) e nient'altro. E' la conferma
   *    di cio' che §8.5.2 dichiara — «una violazione arriva come 23505», da
   *    tradurre nel servizio — quindi qui si verificano le COLONNE, che sono
   *    l'informazione davvero disponibile. I CHECK e le chiavi esterne arrivano
   *    invece col nome fra virgolette.
   */
  function vincoloViolato(messaggio: string | null): string | null {
    if (messaggio === null) return null;
    const perNome = messaggio.match(/"(shopify_location_(?:links|pairs)_[a-z_]+)"/);
    if (perNome) return perNome[1]!;
    const perChiave = messaggio.match(/Code: `23505`[\s\S]*?Key \(([^)]*)\)=/);
    if (perChiave) return `unico:${perChiave[1]!.replace(/\s/g, '')}`;
    return `ALTRO: ${messaggio.replace(/\s+/g, ' ').trim().slice(0, 200)}`;
  }

  describe('il caso valido, che rende significativi tutti i rifiuti', () => {
    it('accetta una coppia ben formata e il suo primo periodo', async () => {
      const coppia = 'e0000000-0000-4000-8000-000000000001';
      expect(await abbina({ id: coppia, gid: 'gid://shopify/Location/1' })).toBeNull();
      expect(await apriPeriodo({ coppia })).toBeNull();
      const righe = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        'SELECT count(*) AS n FROM shopify_location_links',
      );
      expect(Number(righe[0]!.n)).toBe(1);
    });

    it('ACCETTA di interrompere e RIPRISTINARE la stessa coppia', async () => {
      const coppia = 'e0000000-0000-4000-8000-000000000002';
      expect(await abbina({ id: coppia, gid: 'gid://shopify/Location/2' })).toBeNull();
      // primo periodo, poi chiuso dall'operatore
      expect(
        await apriPeriodo({ coppia, stato: 'unlinked', causale: 'operator' }),
      ).toBeNull();
      // ⭐ il ripristino apre un periodo NUOVO sulla stessa coppia
      expect(await apriPeriodo({ coppia })).toBeNull();
      const periodi = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        'SELECT count(*) AS n FROM shopify_location_links WHERE pair_id = $1::uuid',
        coppia,
      );
      expect(Number(periodi[0]!.n)).toBe(2);
    });

    it('ACCETTA il ritorno al negozio A dopo A -> B, sulla stessa coppia', async () => {
      const coppia = 'e0000000-0000-4000-8000-000000000003';
      expect(await abbina({ id: coppia, gid: 'gid://shopify/Location/3' })).toBeNull();
      expect(
        await apriPeriodo({ coppia, stato: 'unlinked', causale: 'shop_change' }),
      ).toBeNull();
      expect(await apriPeriodo({ coppia })).toBeNull();
    });

    it('ACCETTA il ripristino dopo che la location era sparita da Shopify', async () => {
      const coppia = 'e0000000-0000-4000-8000-000000000004';
      expect(await abbina({ id: coppia, gid: 'gid://shopify/Location/4' })).toBeNull();
      expect(
        await apriPeriodo({ coppia, stato: 'remotely_deleted', causale: 'not_found' }),
      ).toBeNull();
      expect(await apriPeriodo({ coppia })).toBeNull();
    });
  });

  describe('il divieto di riassegnazione, che e` la decisione del 07/09/2026', () => {
    it('rifiuta di abbinare la stessa SEDE a una seconda location', async () => {
      expect(await abbina({ gid: 'gid://shopify/Location/10' })).toBeNull();
      expect(vincoloViolato(await abbina({ gid: 'gid://shopify/Location/11' }))).toBe(
        'unico:location_id',
      );
    });

    it('rifiuta di abbinare la stessa LOCATION a una seconda sede', async () => {
      expect(await abbina({ gid: 'gid://shopify/Location/12' })).toBeNull();
      expect(
        vincoloViolato(await abbina({ sede: IDS.locA2, gid: 'gid://shopify/Location/12' })),
      ).toBe('unico:shop_id,shopify_location_gid');
    });

    it('rifiuta anche con una SEDE NUOVA: e` il modo per aggirare il divieto', async () => {
      expect(await abbina({ gid: 'gid://shopify/Location/13' })).toBeNull();
      // La sede A2 e` "nuova" rispetto alla coppia, ma la location e` gia` impegnata.
      expect(
        vincoloViolato(await abbina({ sede: IDS.locA2, gid: 'gid://shopify/Location/13' })),
      ).toBe('unico:shop_id,shopify_location_gid');
    });

    it('rifiuta la riassegnazione ANCHE dopo che tutti i periodi sono chiusi', async () => {
      const coppia = 'e0000000-0000-4000-8000-000000000020';
      expect(await abbina({ id: coppia, gid: 'gid://shopify/Location/14' })).toBeNull();
      expect(
        await apriPeriodo({ coppia, stato: 'unlinked', causale: 'operator' }),
      ).toBeNull();
      // ⛔ E' il punto per cui le tabelle sono DUE: con un indice parziale sui
      //    soli collegamenti attivi, qui la sede sarebbe tornata libera.
      expect(vincoloViolato(await abbina({ gid: 'gid://shopify/Location/15' }))).toBe(
        'unico:location_id',
      );
    });

    /**
     * ⛔ **I due `UNIQUE` da soli NON rendono immutabili i valori**, ed e' stato
     *    misurato prima di scrivere il trigger: impediscono di INSERIRE una
     *    seconda coppia, non di MODIFICARE quella che c'e'. Senza queste due
     *    prove la riassegnazione passava con un `UPDATE`, e i vincoli sembravano
     *    reggere.
     */
    describe('e la riassegnazione per UPDATE, che gli UNIQUE non vedono', () => {
      const COPPIA = 'e0000000-0000-4000-8000-000000000021';
      beforeEach(async () => {
        expect(await abbina({ id: COPPIA, gid: 'gid://shopify/Location/16' })).toBeNull();
      });

      async function modifica(assegnazione: string, valore: string): Promise<string | null> {
        try {
          await prisma.$executeRawUnsafe(
            `UPDATE shopify_location_pairs SET ${assegnazione} WHERE id = $2::uuid`,
            valore,
            COPPIA,
          );
          return null;
        } catch (errore) {
          return errore instanceof Error ? errore.message : String(errore);
        }
      }

      function immutabile(messaggio: string | null): boolean {
        return messaggio !== null && messaggio.includes('shopify_location_pairs_immutabile');
      }

      it('rifiuta di spostare la coppia su un altra LOCATION', async () => {
        expect(immutabile(await modifica('shopify_location_gid = $1', 'gid://shopify/Location/17'))).toBe(
          true,
        );
      });

      it('rifiuta di spostare la coppia su un altra SEDE', async () => {
        expect(immutabile(await modifica('location_id = $1::uuid', IDS.locA2))).toBe(true);
      });

      it('rifiuta di spostare la coppia su un altro NEGOZIO', async () => {
        expect(immutabile(await modifica('shop_id = $1::uuid', SHOP_B))).toBe(true);
      });

      it('rifiuta di spostare la coppia su un altro TENANT', async () => {
        expect(immutabile(await modifica('tenant_id = $1::uuid', IDS.tenantB))).toBe(true);
      });

      it('CONSENTE pero` la manutenzione: si vieta l identita`, non updated_at', async () => {
        let messaggio: string | null = null;
        try {
          await prisma.$executeRawUnsafe(
            'UPDATE shopify_location_pairs SET updated_at = now() WHERE id = $1::uuid',
            COPPIA,
          );
        } catch (errore) {
          messaggio = errore instanceof Error ? errore.message : String(errore);
        }
        expect(messaggio).toBeNull();
      });
    });
  });

  describe('la forma del GID', () => {
    it('rifiuta un GID di PRODOTTO in una colonna di location', async () => {
      expect(vincoloViolato(await abbina({ gid: 'gid://shopify/Product/1' }))).toBe(
        'shopify_location_pairs_gid_forma',
      );
    });

    it('rifiuta l identificativo NUMERICO nudo, cioe` il formato legacy', async () => {
      expect(vincoloViolato(await abbina({ gid: '12345' }))).toBe(
        'shopify_location_pairs_gid_forma',
      );
    });

    it('rifiuta un GID di negozio', async () => {
      expect(vincoloViolato(await abbina({ gid: 'gid://shopify/Shop/1' }))).toBe(
        'shopify_location_pairs_gid_forma',
      );
    });
  });

  describe('i CHECK di stato del periodo, che si leggono come un gruppo', () => {
    const COPPIA = 'e0000000-0000-4000-8000-000000000030';
    beforeEach(async () => {
      expect(await abbina({ id: COPPIA, gid: 'gid://shopify/Location/30' })).toBeNull();
    });

    it('rifiuta un periodo ATTIVO con la data di chiusura', async () => {
      expect(
        vincoloViolato(await apriPeriodo({ coppia: COPPIA, stato: 'active', chiusoIl: true })),
      ).toBe('shopify_location_links_attivo_pulito');
    });

    it('rifiuta un periodo CHIUSO senza causale — il varco che il CHECK 2 chiude', async () => {
      expect(
        vincoloViolato(
          await apriPeriodo({ coppia: COPPIA, stato: 'unlinked', causale: null }),
        ),
      ).toBe('shopify_location_links_chiuso_completo');
    });

    it('rifiuta `remotely_deleted` con una causale da scollegamento', async () => {
      expect(
        vincoloViolato(
          await apriPeriodo({
            coppia: COPPIA,
            stato: 'remotely_deleted',
            causale: 'operator',
          }),
        ),
      ).toBe('shopify_location_links_causale_eliminato');
    });

    it('rifiuta `unlinked` con una causale da eliminazione remota', async () => {
      expect(
        vincoloViolato(
          await apriPeriodo({
            coppia: COPPIA,
            stato: 'unlinked',
            causale: 'remote_delete',
          }),
        ),
      ).toBe('shopify_location_links_causale_scollegato');
    });

    it('rifiuta un periodo che si chiude PRIMA di cominciare', async () => {
      expect(
        vincoloViolato(
          await apriPeriodo({
            coppia: COPPIA,
            stato: 'unlinked',
            causale: 'operator',
            chiusuraPrimaDellApertura: true,
          }),
        ),
      ).toBe('shopify_location_links_periodo_coerente');
    });

    it('accetta `shop_change` — deciso il 07/09/2026', async () => {
      expect(
        await apriPeriodo({ coppia: COPPIA, stato: 'unlinked', causale: 'shop_change' }),
      ).toBeNull();
    });
  });

  describe('un solo periodo vivo per coppia', () => {
    it('rifiuta due periodi ATTIVI sulla stessa coppia', async () => {
      const coppia = 'e0000000-0000-4000-8000-000000000040';
      expect(await abbina({ id: coppia, gid: 'gid://shopify/Location/40' })).toBeNull();
      expect(await apriPeriodo({ coppia })).toBeNull();
      expect(vincoloViolato(await apriPeriodo({ coppia }))).toBe('unico:pair_id');
    });

    it('accetta molti periodi CHIUSI sulla stessa coppia: e` la storia', async () => {
      const coppia = 'e0000000-0000-4000-8000-000000000041';
      expect(await abbina({ id: coppia, gid: 'gid://shopify/Location/41' })).toBeNull();
      for (const causale of ['operator', 'shop_change', 'operator'] as const) {
        expect(await apriPeriodo({ coppia, stato: 'unlinked', causale })).toBeNull();
      }
      expect(await apriPeriodo({ coppia })).toBeNull();
    });
  });

  describe('isolamento fra tenant, imposto dal database', () => {
    it('rifiuta una coppia verso la sede di un altro tenant', async () => {
      expect(
        vincoloViolato(await abbina({ sede: IDS.locB1, gid: 'gid://shopify/Location/50' })),
      ).toBe('shopify_location_pairs_location_id_tenant_id_fkey');
    });

    it('rifiuta una coppia verso il negozio di un altro tenant', async () => {
      expect(
        vincoloViolato(await abbina({ shop: SHOP_B, gid: 'gid://shopify/Location/51' })),
      ).toBe('shopify_location_pairs_shop_id_tenant_id_fkey');
    });

    it('rifiuta un periodo che dichiara un tenant diverso da quello della coppia', async () => {
      const coppia = 'e0000000-0000-4000-8000-000000000052';
      expect(await abbina({ id: coppia, gid: 'gid://shopify/Location/52' })).toBeNull();
      expect(vincoloViolato(await apriPeriodo({ coppia, tenant: IDS.tenantB }))).toBe(
        'shopify_location_links_pair_id_tenant_id_fkey',
      );
    });
  });

  describe('cio` che non si puo` cancellare', () => {
    it('rifiuta la cancellazione di una sede che ha una coppia', async () => {
      expect(await abbina({ gid: 'gid://shopify/Location/60' })).toBeNull();
      let messaggio: string | null = null;
      try {
        await prisma.$executeRawUnsafe('DELETE FROM locations WHERE id = $1::uuid', IDS.locA1);
      } catch (errore) {
        messaggio = errore instanceof Error ? errore.message : String(errore);
      }
      expect(vincoloViolato(messaggio)).toBe('shopify_location_pairs_location_id_tenant_id_fkey');
    });

    it('rifiuta la cancellazione di una coppia che ha periodi', async () => {
      const coppia = 'e0000000-0000-4000-8000-000000000061';
      expect(await abbina({ id: coppia, gid: 'gid://shopify/Location/61' })).toBeNull();
      expect(await apriPeriodo({ coppia })).toBeNull();
      let messaggio: string | null = null;
      try {
        await prisma.$executeRawUnsafe(
          'DELETE FROM shopify_location_pairs WHERE id = $1::uuid',
          coppia,
        );
      } catch (errore) {
        messaggio = errore instanceof Error ? errore.message : String(errore);
      }
      expect(vincoloViolato(messaggio)).toBe('shopify_location_links_pair_id_tenant_id_fkey');
    });

    /**
     * ⚠️ **«Nessun periodo» NON e' «nessun effetto», e i due non vanno
     *    confusi.** La correzione di un abbinamento iniziale errato richiede la
     *    SECONDA condizione (§1.13.6), e il database non la conosce: sa dire
     *    che non esistono periodi, non che nulla e' stato sincronizzato,
     *    ricevuto o spinto verso il canale.
     *
     * ⭐ Quello che il database garantisce e' quindi solo il PRIMO gradino —
     *    con periodi presenti la coppia non si smonta — e il secondo resta una
     *    verifica del comando applicativo, che guardera' giacenze pubblicate,
     *    ordini ricevuti e riferimenti al canale. Queste prove fissano la
     *    divisione, invece di lasciar credere che il vincolo basti.
     */
    it('il database garantisce solo «nessun periodo»: con periodi, la coppia non si smonta', async () => {
      const coppia = 'e0000000-0000-4000-8000-000000000062';
      expect(await abbina({ id: coppia, gid: 'gid://shopify/Location/62' })).toBeNull();
      expect(await apriPeriodo({ coppia, stato: 'unlinked', causale: 'operator' })).toBeNull();
      let messaggio: string | null = null;
      try {
        await prisma.$executeRawUnsafe(
          'DELETE FROM shopify_location_pairs WHERE id = $1::uuid',
          coppia,
        );
      } catch (errore) {
        messaggio = errore instanceof Error ? errore.message : String(errore);
      }
      expect(vincoloViolato(messaggio)).toBe('shopify_location_links_pair_id_tenant_id_fkey');
    });

    it('senza periodi la coppia si smonta — ma «senza effetti» lo deve verificare il comando', async () => {
      const coppia = 'e0000000-0000-4000-8000-000000000063';
      expect(await abbina({ id: coppia, gid: 'gid://shopify/Location/63' })).toBeNull();
      await prisma.$executeRawUnsafe(
        'DELETE FROM shopify_location_pairs WHERE id = $1::uuid',
        coppia,
      );
      // ⛔ Il database ha lasciato passare perche' non c'erano periodi. NON ha
      //    verificato che l'abbinamento non abbia prodotto effetti: quella
      //    condizione non e' esprimibile qui, e resta del comando applicativo.
      expect(await abbina({ gid: 'gid://shopify/Location/64' })).toBeNull();
    });
  });

  describe('le protezioni delle tabelle', () => {
    const TABELLE = [
      'shopify_shops',
      'shopify_product_links',
      'shopify_variant_links',
      'shopify_location_pairs',
      'shopify_location_links',
    ];

    it('hanno tutte la RLS abilitata', async () => {
      const righe = await prisma.$queryRawUnsafe<{ relname: string; relrowsecurity: boolean }[]>(
        `SELECT c.relname, c.relrowsecurity FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])
          ORDER BY c.relname`,
        TABELLE,
      );
      expect(righe).toHaveLength(TABELLE.length);
      for (const riga of righe) expect(riga.relrowsecurity, riga.relname).toBe(true);
    });

    it('non concedono alcun privilegio a PUBLIC', async () => {
      const righe = await prisma.$queryRawUnsafe<{ relname: string }[]>(
        `SELECT c.relname FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace,
           aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
          WHERE n.nspname = 'public' AND a.grantee = 0 AND c.relname = ANY($1::text[])`,
        TABELLE,
      );
      expect(righe).toEqual([]);
    });
  });
});
