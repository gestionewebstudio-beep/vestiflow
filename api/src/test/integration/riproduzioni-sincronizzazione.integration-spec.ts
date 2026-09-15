import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { PlatformAuditService } from '../../common/audit/platform-audit.service';
import { ShopifyLinkHistoryService } from '../../shopify/shopify-link-history.service';
import { ShopifyProductPushService } from '../../shopify/shopify-product-push.service';
import { creaDataset, IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';
import { NegozioSimulato } from './shopify-simulato.util';

/**
 * RIPRODUZIONI dei rischi di `docs/30` che ancora non hanno una correzione (15/09/2026).
 *
 * ⛔ Ogni prova qui è `it.fails`: asserisce il comportamento DESIDERATO e oggi fallisce,
 *    cioè riproduce il difetto sull'ambiente isolato. Quando una correzione arriverà, la
 *    prova diventerà rossa per `.fails`: si toglie il suffisso e la prova resta a guardia.
 *    Non sono prove che «fissano» il difetto: sono la sua misura.
 */
describe('Riproduzioni — sincronizzazione Shopify (PostgreSQL isolato, negozio simulato)', () => {
  const DOMINIO = 'riproduzioni.myshopify.com';
  let prisma: PrismaClient;
  let negozio: NegozioSimulato;
  let storico: ShopifyLinkHistoryService;
  let registro: PlatformAuditService;

  beforeAll(() => {
    prisma = creaClientIntegrazione();
    storico = new ShopifyLinkHistoryService();
    registro = new PlatformAuditService(prisma as never, prisma as never);
  });

  afterAll(async () => {
    if (prisma) {
      await svuota(prisma).catch(() => undefined);
      await prisma.$disconnect().catch(() => undefined);
    }
  });

  beforeEach(async () => {
    await svuota(prisma);
    await creaDataset(prisma);
    negozio = new NegozioSimulato(DOMINIO, 995000);
    const riga = await prisma.shopifyShop.create({
      data: { tenantId: IDS.tenantA, shopGid: 'gid://shopify/Shop/995001' },
    });
    await prisma.shopifyConnection.create({
      data: {
        tenantId: IDS.tenantA,
        status: 'connected',
        shopDomain: DOMINIO,
        shopId: riga.id,
        scopes: ['read_products', 'write_products'],
      },
    });
    await prisma.shopifyCredential.create({
      data: {
        tenantId: IDS.tenantA,
        shopDomain: DOMINIO,
        accessTokenEnc: 'cifrato',
        scopes: ['read_products', 'write_products'],
      },
    });
  });

  function creaPush(): ShopifyProductPushService {
    return new ShopifyProductPushService(
      prisma as never,
      negozio.oauth() as never,
      negozio.admin() as never,
      { markSynced: vi.fn(), markError: vi.fn(), touchSync: vi.fn() } as never,
      { resolveCategoryId: vi.fn().mockResolvedValue(null) } as never,
      { buildMetafields: vi.fn().mockResolvedValue([]) } as never,
      negozio.graphql() as never,
      storico,
      registro,
    );
  }

  /**
   * ⛔ `docs/30` #5 — creazione REST del prodotto senza chiave di idempotenza e senza
   *    «tentativo aperto»: se la risposta si perde DOPO che Shopify ha creato il prodotto,
   *    VestiFlow non ne conosce l'id e alla ripubblicazione ne crea un SECONDO.
   *    Desiderato: un solo prodotto remoto, e un esito che chieda di verificare sul negozio.
   */
  it.fails(
    'RIPRODUZIONE: risposta persa dopo la creazione del prodotto → alla ripubblicazione NON nasce un secondo prodotto su Shopify',
    async () => {
      const locale = await prisma.product.create({
        data: {
          tenantId: IDS.tenantA,
          name: 'Articolo con risposta persa',
          articleCode: 'PERSA-1',
          shopifySyncEnabled: true,
          variants: {
            create: [
              {
                tenantId: IDS.tenantA,
                sku: 'PERSA-M',
                optionValues: { T: 'M' },
                sellingPriceMinor: 2990,
              },
            ],
          },
        },
      });
      negozio.perdiProssimaRisposta('createProduct');

      // Primo tentativo: Shopify crea, la risposta non arriva.
      await creaPush()
        .pushProduct(IDS.tenantA, locale.id)
        .catch(() => undefined);
      const dopoPrimo = await prisma.product.findUniqueOrThrow({ where: { id: locale.id } });
      expect(dopoPrimo.shopifyProductId).toBeNull();
      expect(negozio.prodotti.size).toBe(1);

      // Secondo tentativo (l'operatore ripubblica, o un salvataggio successivo).
      await creaPush()
        .pushProduct(IDS.tenantA, locale.id)
        .catch(() => undefined);

      // ⛔ Oggi: due prodotti remoti per un articolo. Desiderato: uno.
      expect(negozio.chiamate.get('createProduct')).toBe(1);
      expect(negozio.prodotti.size).toBe(1);
    },
  );
});
