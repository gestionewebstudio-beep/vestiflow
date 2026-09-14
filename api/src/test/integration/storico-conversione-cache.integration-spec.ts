import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PlatformAuditService } from '../../common/audit/platform-audit.service';
import { ShopifyLinkHistoryService } from '../../shopify/shopify-link-history.service';
import { ShopifyLocationLinkService } from '../../shopify/shopify-location-link.service';
import { ShopifyStoricoBackfillService } from '../../shopify/shopify-storico-backfill.service';
import { ambienteIntegrazione } from './env';
import { creaDataset, IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';

/**
 * ⭐ Fase 3-4 dello storico (`docs/24` §8.5.8): i collegamenti fatti PRIMA
 *    dello storico vivono nelle sole colonne-cache. Il backfill li converte in
 *    identità + periodo (prodotti, varianti) e coppia + periodo (sedi) con i
 *    servizi ordinari, dopo i controlli bloccanti, e VERIFICA che ogni id in
 *    cache abbia un periodo attivo. Idempotente; ciò che lo storico vieta non
 *    si riapre e si nomina; un duplicato ferma il tenant senza dedupe.
 */
describe('Backfill dello storico dei collegamenti, su PostgreSQL', () => {
  let prisma: PrismaClient;
  let backfill: ShopifyStoricoBackfillService;
  const GID_NEGOZIO = 'gid://shopify/Shop/997001';

  beforeAll(() => {
    ambienteIntegrazione();
    prisma = creaClientIntegrazione();
  });

  afterAll(async () => {
    await svuota(prisma);
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await svuota(prisma);
    await creaDataset(prisma);
    // ⚠️ Il registro non ha FK verso `tenants` e sopravvive a `svuota`: si azzera a parte.
    await prisma.platformAuditLog.deleteMany({});
    const storico = new ShopifyLinkHistoryService();
    const sedi = new ShopifyLocationLinkService(prisma as never);
    // §10.3 · il registro VERO, sui due client della prova (stesso database).
    const registro = new PlatformAuditService(prisma as never, prisma as never);
    backfill = new ShopifyStoricoBackfillService(prisma as never, storico, sedi, registro);
  });

  /** Le righe di registro del backfill, nell'ordine in cui sono state scritte. */
  async function registro() {
    return prisma.platformAuditLog.findMany({
      where: { tenantId: IDS.tenantA, operation: 'backfill_storico' },
      orderBy: { createdAt: 'asc' },
      select: { outcome: true, actor: true, shopGid: true, reason: true, correlationId: true },
    });
  }

  /** La connessione com'era prima dello storico: cache piena, tabelle vuote. */
  async function connessioneConCache(conNegozio = true) {
    const negozio = conNegozio
      ? await prisma.shopifyShop.create({ data: { tenantId: IDS.tenantA, shopGid: GID_NEGOZIO } })
      : null;
    await prisma.shopifyConnection.create({
      data: {
        tenantId: IDS.tenantA,
        status: 'connected',
        shopDomain: 'backfill.myshopify.com',
        shopId: negozio?.id ?? null,
        scopes: ['read_products'],
      },
    });
    const prodotto = await prisma.product.create({
      data: {
        tenantId: IDS.tenantA,
        name: 'Maglia in cache',
        articleCode: 'BF-1',
        shopifyProductId: '880001',
        variants: {
          create: [
            {
              tenantId: IDS.tenantA,
              sku: 'BF-1-M',
              sellingPriceMinor: 1000,
              shopifyVariantId: '990001',
              shopifyInventoryItemId: '770001',
            },
            {
              tenantId: IDS.tenantA,
              sku: 'BF-1-L',
              sellingPriceMinor: 1000,
              shopifyVariantId: '990002',
              shopifyInventoryItemId: '770002',
            },
          ],
        },
      },
      include: { variants: true },
    });
    await prisma.location.update({
      where: { id: IDS.locA1 },
      data: { shopifyLocationId: '55001' },
    });
    return prodotto;
  }

  it('converte cache → storico, verifica la copertura, ed è idempotente', async () => {
    const prodotto = await connessioneConCache();
    expect(await backfill.controlliBloccanti(IDS.tenantA)).toEqual([]);

    // Senza applicare: niente si scrive, e la verifica nomina i non coperti.
    const prova = await backfill.esegui(IDS.tenantA, { applica: false });
    expect(prova.esito).toBe('eseguito');
    expect(prova.dopo).toEqual(prova.prima);
    expect(prova.nonCoperti.prodotti).toEqual([prodotto.id]);
    expect(prova.nonCoperti.varianti).toHaveLength(2);
    expect(prova.nonCoperti.sedi).toEqual([IDS.locA1]);
    expect(await registro()).toEqual([]);

    const primo = await backfill.esegui(IDS.tenantA, { applica: true });
    expect(primo.esito).toBe('eseguito');
    expect(primo.prodotti).toEqual({ registrati: 1, giaCollegati: 0, rifiutati: [] });
    expect(primo.varianti).toEqual({ registrate: 2, giaAgganciate: 0, rifiutate: [] });
    expect(primo.sedi).toEqual({ registrate: 1, giaCollegate: 0, rifiutate: [] });
    expect(primo.dopo).toEqual({
      identitaProdotto: 1,
      periodiProdottoAttivi: 1,
      identitaVariante: 2,
      periodiVarianteAttivi: 2,
      coppieSede: 1,
      periodiSedeAttivi: 1,
    });
    expect(primo.nonCoperti).toEqual({ prodotti: [], varianti: [], sedi: [] });
    // §14 punto 5 · la riga di registro, nella forma di §10.3: tentativo con il
    // piano, riuscita con i conteggi, stessa correlazione, attore `backfill`.
    const righe = await registro();
    expect(righe).toHaveLength(2);
    expect(righe.map((r) => [r.outcome, r.actor, r.shopGid, r.reason])).toEqual([
      ['tentativo', 'backfill', GID_NEGOZIO, 'da convertire: 1 prodotti, 2 varianti, 1 sedi'],
      [
        'riuscita',
        'backfill',
        GID_NEGOZIO,
        'prodotti +1 (0 già, 0 rifiutati) · varianti +2 (0 già, 0 rifiutate) · sedi +1 (0 già, 0 rifiutate)',
      ],
    ]);
    expect(righe[0]!.correlationId).toBe(righe[1]!.correlationId);

    // Seconda passata: niente di nuovo, nessun doppione — e nessuna riga di
    // registro in più: l'idempotenza sta PRIMA del tentativo.
    const secondo = await backfill.esegui(IDS.tenantA, { applica: true });
    expect(secondo.prodotti).toEqual({ registrati: 0, giaCollegati: 1, rifiutati: [] });
    expect(secondo.varianti).toEqual({ registrate: 0, giaAgganciate: 2, rifiutate: [] });
    expect(secondo.sedi).toEqual({ registrate: 0, giaCollegate: 1, rifiutate: [] });
    expect(secondo.dopo).toEqual(primo.dopo);
    expect(await registro()).toHaveLength(2);
  });

  it('⛔ un id remoto duplicato BLOCCA il tenant: nessuna dedupe, nessuna scrittura, righe nominate', async () => {
    const prodotto = await connessioneConCache();
    const doppione = await prisma.product.create({
      data: {
        tenantId: IDS.tenantA,
        name: 'Doppione',
        articleCode: 'BF-2',
        shopifyProductId: '880001',
      },
    });
    const esito = await backfill.esegui(IDS.tenantA, { applica: true });
    expect(esito.esito).toBe('bloccato');
    expect(esito.anomalie).toEqual([
      {
        controllo: 'prodotto_id_remoto_duplicato',
        valore: '880001',
        righe: [prodotto.id, doppione.id].sort(),
      },
    ]);
    expect(esito.dopo).toEqual(esito.prima);
    expect(await prisma.shopifyProductIdentity.count()).toBe(0);
    // Un tenant bloccato non arriva alla scrittura: nessun tentativo nel registro.
    expect(await registro()).toEqual([]);
  });

  it('senza negozio (fase 2 non fatta) non scrive niente e lo dice', async () => {
    await connessioneConCache(false);
    const esito = await backfill.esegui(IDS.tenantA, { applica: true });
    expect(esito.esito).toBe('negozio_assente');
    expect(await prisma.shopifyProductIdentity.count()).toBe(0);
    expect(await registro()).toEqual([]);
  });

  it('ciò che lo storico VIETA non si riapre: un periodo chiuso resta chiuso e viene nominato', async () => {
    const prodotto = await connessioneConCache();
    await backfill.esegui(IDS.tenantA, { applica: true });
    // Una persona ha scollegato l'articolo (operator): prima le varianti, poi il
    // prodotto — la FK `padre_attivo` esige quest'ordine, come nel regime vero.
    for (const tabella of ['shopify_variant_links', 'shopify_product_links']) {
      await prisma.$executeRawUnsafe(
        `UPDATE "${tabella}"
            SET status = 'unlinked', close_reason = 'operator',
                closed_at = GREATEST(now(), linked_at), updated_at = now()
          WHERE tenant_id = $1::uuid AND status = 'active'`,
        IDS.tenantA,
      );
    }
    const dopo = await backfill.esegui(IDS.tenantA, { applica: true });
    expect(dopo.esito).toBe('eseguito');
    expect(dopo.prodotti).toEqual({
      registrati: 0,
      giaCollegati: 0,
      rifiutati: [`Maglia in cache (${prodotto.id}): collegamento_chiuso`],
    });
    // Le varianti di un prodotto rifiutato non si toccano: nessun periodo orfano.
    expect(dopo.varianti).toEqual({ registrate: 0, giaAgganciate: 0, rifiutate: [] });
    expect(dopo.sedi).toEqual({ registrate: 0, giaCollegate: 1, rifiutate: [] });
    // La verifica lo dice: la cache li dichiara collegati, lo storico no.
    expect(dopo.nonCoperti.prodotti).toEqual([prodotto.id]);
    expect([...dopo.nonCoperti.varianti].sort()).toEqual(prodotto.variants.map((v) => v.id).sort());
    expect(dopo.nonCoperti.sedi).toEqual([]);
    expect(
      await prisma.shopifyProductLink.count({ where: { tenantId: IDS.tenantA, status: 'active' } }),
    ).toBe(0);
    // C'era qualcosa da convertire, quindi il tentativo si scrive; la riuscita
    // dice la verità: niente scritto, un rifiuto. Non è «ininfluente» (nessuna
    // richiesta concorrente) e non è «rifiutata» (l'operazione è andata a termine).
    const righe = await registro();
    expect(righe).toHaveLength(4); // due del primo backfill, due di questo
    expect(righe.slice(2).map((r) => [r.outcome, r.reason])).toEqual([
      ['tentativo', 'da convertire: 1 prodotti, 2 varianti, 0 sedi'],
      [
        'riuscita',
        'prodotti +0 (0 già, 1 rifiutati) · varianti +0 (0 già, 0 rifiutate) · sedi +0 (1 già, 0 rifiutate)',
      ],
    ]);
  });
});
