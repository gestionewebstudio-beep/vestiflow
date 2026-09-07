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
  const GID_SHOP_A = 'gid://shopify/Shop/9101';
  const GID_SHOP_B = 'gid://shopify/Shop/9102';

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
         ($1::uuid, $2::uuid, $3, now()),
         ($4::uuid, $5::uuid, $6, now())`,
      SHOP_A,
      IDS.tenantA,
      GID_SHOP_A,
      SHOP_B,
      IDS.tenantB,
      GID_SHOP_B,
    );
  });

  /** Inserisce un collegamento di sede e restituisce l'errore, se c'e'. */
  async function collega(valori: {
    id?: string;
    tenant?: string;
    shop?: string;
    sede?: string;
    gid: string;
    stato?: string;
    causale?: string | null;
    chiusoIl?: boolean;
  }): Promise<string | null> {
    const stato = valori.stato ?? 'active';
    const chiuso = valori.chiusoIl ?? stato !== 'active';
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO shopify_location_links
           (id, tenant_id, shop_id, location_id, shopify_location_gid, status, close_reason, closed_at, updated_at)
         VALUES (coalesce($1, gen_random_uuid()::text)::uuid, $2::uuid, $3::uuid, $4::uuid, $5,
                 $6::"ShopifyLinkStatus", $7::"ShopifyLinkCloseReason",
                 CASE WHEN $8::boolean THEN now() ELSE NULL END, now())`,
        valori.id ?? null,
        valori.tenant ?? IDS.tenantA,
        valori.shop ?? SHOP_A,
        valori.sede ?? IDS.locA1,
        valori.gid,
        stato,
        valori.causale ?? null,
        chiuso,
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
    const perNome = messaggio.match(/"(shopify_location_links_[a-z_]+)"/);
    if (perNome) return perNome[1]!;
    const perChiave = messaggio.match(/Code: `23505`[\s\S]*?Key \(([^)]*)\)=/);
    if (perChiave) return `unico:${perChiave[1]!.replace(/\s/g, '')}`;
    return `ALTRO: ${messaggio.replace(/\s+/g, ' ').trim().slice(0, 200)}`;
  }

  describe('il caso valido, che rende significativi tutti i rifiuti', () => {
    it('accetta un collegamento ben formato', async () => {
      expect(await collega({ gid: 'gid://shopify/Location/1' })).toBeNull();
      const righe = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        'SELECT count(*) AS n FROM shopify_location_links',
      );
      expect(Number(righe[0]!.n)).toBe(1);
    });

    it('accetta lo storico: piu` collegamenti CHIUSI sulla stessa sede', async () => {
      expect(await collega({ gid: 'gid://shopify/Location/1' })).toBeNull();
      expect(
        await collega({
          gid: 'gid://shopify/Location/2',
          stato: 'remotely_deleted',
          causale: 'not_found',
        }),
      ).toBeNull();
      expect(
        await collega({
          gid: 'gid://shopify/Location/3',
          stato: 'unlinked',
          causale: 'operator',
        }),
      ).toBeNull();
    });

    it('accetta `shop_change` su una sede — deciso il 07/09/2026', async () => {
      expect(
        await collega({
          gid: 'gid://shopify/Location/4',
          stato: 'unlinked',
          causale: 'shop_change',
        }),
      ).toBeNull();
    });
  });

  describe('la forma del GID', () => {
    it('rifiuta un GID di PRODOTTO in una colonna di location', async () => {
      expect(vincoloViolato(await collega({ gid: 'gid://shopify/Product/1' }))).toBe(
        'shopify_location_links_gid_forma',
      );
    });

    it('rifiuta l identificativo NUMERICO nudo, cioe` il formato legacy', async () => {
      expect(vincoloViolato(await collega({ gid: '12345' }))).toBe(
        'shopify_location_links_gid_forma',
      );
    });

    it('rifiuta un GID di negozio', async () => {
      expect(vincoloViolato(await collega({ gid: 'gid://shopify/Shop/1' }))).toBe(
        'shopify_location_links_gid_forma',
      );
    });
  });

  describe('i cinque CHECK di stato, che si leggono come un gruppo', () => {
    it('rifiuta un collegamento ATTIVO con la data di chiusura', async () => {
      expect(
        vincoloViolato(
          await collega({ gid: 'gid://shopify/Location/5', stato: 'active', chiusoIl: true }),
        ),
      ).toBe('shopify_location_links_attivo_pulito');
    });

    it('rifiuta un collegamento CHIUSO senza causale — il varco che il CHECK 2 chiude', async () => {
      expect(
        vincoloViolato(
          await collega({ gid: 'gid://shopify/Location/6', stato: 'unlinked', causale: null }),
        ),
      ).toBe('shopify_location_links_chiuso_completo');
    });

    it('rifiuta `remotely_deleted` con una causale da scollegamento', async () => {
      expect(
        vincoloViolato(
          await collega({
            gid: 'gid://shopify/Location/7',
            stato: 'remotely_deleted',
            causale: 'operator',
          }),
        ),
      ).toBe('shopify_location_links_causale_eliminato');
    });

    it('rifiuta `unlinked` con una causale da eliminazione remota', async () => {
      expect(
        vincoloViolato(
          await collega({
            gid: 'gid://shopify/Location/8',
            stato: 'unlinked',
            causale: 'remote_delete',
          }),
        ),
      ).toBe('shopify_location_links_causale_scollegato');
    });

    it('rifiuta un collegamento che dichiara se stesso come successore', async () => {
      const id = 'd0000000-0000-4000-8000-000000000001';
      expect(await collega({ id, gid: 'gid://shopify/Location/9' })).toBeNull();
      let messaggio: string | null = null;
      try {
        await prisma.$executeRawUnsafe(
          'UPDATE shopify_location_links SET superseded_by_link_id = id WHERE id = $1::uuid',
          id,
        );
      } catch (errore) {
        messaggio = errore instanceof Error ? errore.message : String(errore);
      }
      expect(vincoloViolato(messaggio)).toBe('shopify_location_links_successore_non_se_stesso');
    });
  });

  describe('unicita`: una sede, un solo collegamento vivo', () => {
    it('rifiuta due collegamenti ATTIVI sulla stessa sede', async () => {
      expect(await collega({ gid: 'gid://shopify/Location/10' })).toBeNull();
      expect(vincoloViolato(await collega({ gid: 'gid://shopify/Location/11' }))).toBe(
        'unico:location_id',
      );
    });

    it('rifiuta lo stesso GID due volte nello stesso negozio, anche se il primo e` chiuso', async () => {
      expect(
        await collega({
          gid: 'gid://shopify/Location/12',
          stato: 'unlinked',
          causale: 'operator',
        }),
      ).toBeNull();
      expect(
        vincoloViolato(await collega({ sede: IDS.locA2, gid: 'gid://shopify/Location/12' })),
      ).toBe('unico:shop_id,shopify_location_gid');
    });
  });

  describe('isolamento fra tenant, imposto dal database', () => {
    it('rifiuta un collegamento verso la sede di un altro tenant', async () => {
      expect(
        vincoloViolato(await collega({ sede: IDS.locB1, gid: 'gid://shopify/Location/13' })),
      ).toBe('shopify_location_links_location_id_tenant_id_fkey');
    });

    it('rifiuta un collegamento verso il negozio di un altro tenant', async () => {
      expect(
        vincoloViolato(await collega({ shop: SHOP_B, gid: 'gid://shopify/Location/14' })),
      ).toBe('shopify_location_links_shop_id_tenant_id_fkey');
    });
  });

  describe('la successione, e la sede che non si puo` cancellare', () => {
    const PRIMO = 'd0000000-0000-4000-8000-000000000010';
    const SECONDO = 'd0000000-0000-4000-8000-000000000011';

    async function preparaCatena(): Promise<void> {
      expect(
        await collega({
          id: PRIMO,
          gid: 'gid://shopify/Location/20',
          stato: 'unlinked',
          causale: 'operator',
        }),
      ).toBeNull();
      expect(await collega({ id: SECONDO, gid: 'gid://shopify/Location/21' })).toBeNull();
    }

    async function indicaSuccessore(su: string, successore: string): Promise<string | null> {
      try {
        await prisma.$executeRawUnsafe(
          'UPDATE shopify_location_links SET superseded_by_link_id = $2::uuid WHERE id = $1::uuid',
          su,
          successore,
        );
        return null;
      } catch (errore) {
        return errore instanceof Error ? errore.message : String(errore);
      }
    }

    it('accetta un successore sulla STESSA sede', async () => {
      await preparaCatena();
      expect(await indicaSuccessore(PRIMO, SECONDO)).toBeNull();
    });

    it('rifiuta un successore che appartiene a un ALTRA sede', async () => {
      await preparaCatena();
      const altrove = 'd0000000-0000-4000-8000-000000000012';
      expect(
        await collega({ id: altrove, sede: IDS.locA2, gid: 'gid://shopify/Location/22' }),
      ).toBeNull();
      expect(vincoloViolato(await indicaSuccessore(PRIMO, altrove))).toBe(
        'shopify_location_links_superseded_by_fkey',
      );
    });

    it('rifiuta la cancellazione di un collegamento che ha un successore', async () => {
      await preparaCatena();
      expect(await indicaSuccessore(PRIMO, SECONDO)).toBeNull();
      let messaggio: string | null = null;
      try {
        await prisma.$executeRawUnsafe(
          'DELETE FROM shopify_location_links WHERE id = $1::uuid',
          SECONDO,
        );
      } catch (errore) {
        messaggio = errore instanceof Error ? errore.message : String(errore);
      }
      expect(vincoloViolato(messaggio)).toBe('shopify_location_links_superseded_by_fkey');
    });

    it('rifiuta la cancellazione di una sede che ha collegamenti', async () => {
      expect(await collega({ gid: 'gid://shopify/Location/23' })).toBeNull();
      let messaggio: string | null = null;
      try {
        await prisma.$executeRawUnsafe('DELETE FROM locations WHERE id = $1::uuid', IDS.locA1);
      } catch (errore) {
        messaggio = errore instanceof Error ? errore.message : String(errore);
      }
      expect(vincoloViolato(messaggio)).toBe('shopify_location_links_location_id_tenant_id_fkey');
    });
  });

  describe('le protezioni della tabella', () => {
    it('ha la RLS abilitata, come le tre sorelle', async () => {
      const righe = await prisma.$queryRawUnsafe<{ relname: string; relrowsecurity: boolean }[]>(
        `SELECT c.relname, c.relrowsecurity FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname IN
            ('shopify_shops','shopify_product_links','shopify_variant_links','shopify_location_links')
          ORDER BY c.relname`,
      );
      expect(righe).toHaveLength(4);
      for (const riga of righe) expect(riga.relrowsecurity, riga.relname).toBe(true);
    });

    it('non concede alcun privilegio a PUBLIC', async () => {
      const righe = await prisma.$queryRawUnsafe<{ relname: string }[]>(
        `SELECT c.relname FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace,
           aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
          WHERE n.nspname = 'public' AND a.grantee = 0 AND c.relname IN
            ('shopify_shops','shopify_product_links','shopify_variant_links','shopify_location_links')`,
      );
      expect(righe).toEqual([]);
    });
  });
});
