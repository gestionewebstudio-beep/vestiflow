import type { PrismaClient } from '@prisma/client';
import { CatalogOrigin, ShopifyCatalogLinkKind, UserRole } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { avviaApp, chiama, type AppIntegrazione } from './app';
import { creaDataset, IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';

/**
 * ⭐ **I PRODOTTI IMPORTATI DA SHOPIFY SI MODIFICANO** — docs/24 §1.8, decisione
 * dell'08/08/2026 riconfermata il 03/09: l'origine è provenienza, non un vincolo
 * di sola lettura.
 *
 * ⛔ Prima la `PATCH` rifiutava con 409 ogni cambio a nome, descrizione, stato,
 * opzioni e varianti di un prodotto con `catalogOrigin: shopify`. Questa prova
 * attraversa il percorso vero — guardia JWT, `ValidationPipe`, servizio, Prisma —
 * e dice che quel 409 non c'è più, e che il dato locale è davvero cambiato.
 *
 * ⚠️ Il tenant A NON ha Shopify collegato: il push post-commit non parte per
 * costruzione (il facade lo salta), e il salvataggio locale non ne dipende. È
 * anche la prova che «tenant senza Shopify» non vede logica del canale lato API.
 */
const PRODOTTO = '7b100000-0000-4000-8000-00000000c001';
const VARIANTE = '7b200000-0000-4000-8000-00000000c002';
const UTENTE_CATALOGO = '2a300000-0000-4000-8000-00000000a301';
const AUTH_CATALOGO = '3a300000-0000-4000-8000-00000000a303';

describe('Prodotti importati da Shopify — modifica via HTTP su PostgreSQL TEST', () => {
  let app: AppIntegrazione;
  let prisma: PrismaClient;
  let token: string;

  beforeAll(async () => {
    prisma = creaClientIntegrazione();
    await creaDataset(prisma);

    // Un operatore col permesso di catalogo: la fixture condivisa ne ha solo di
    // documentali, e non si tocca per una prova.
    await prisma.user.create({
      data: {
        id: UTENTE_CATALOGO,
        tenantId: IDS.tenantA,
        authUserId: AUTH_CATALOGO,
        email: 'catalogo@integrazione.local',
        displayName: 'Operatore catalogo',
        role: UserRole.clerk,
        isActive: true,
        hasAllLocationsAccess: true,
        permissions: ['section.products', 'catalog.manage'],
      },
    });

    // Il prodotto COME LO LASCIA L'IMPORT: origine Shopify, collegato, mai spinto.
    await prisma.product.create({
      data: {
        id: PRODOTTO,
        tenantId: IDS.tenantA,
        name: 'Nome venuto da Shopify',
        articleCode: 'ART-IMPORTATO',
        description: 'Descrizione venuta da Shopify',
        catalogOrigin: CatalogOrigin.shopify,
        shopifyProductId: '10328079597863',
        shopifyCatalogLinkKind: ShopifyCatalogLinkKind.imported,
      },
    });
    await prisma.productVariant.create({
      data: {
        id: VARIANTE,
        tenantId: IDS.tenantA,
        productId: PRODOTTO,
        sku: 'SKU-IMPORTATO',
        shopifyVariantId: '501',
        sellingPriceMinor: 2500,
      },
    });

    app = await avviaApp();
    token = await app.token(AUTH_CATALOGO);
  }, 120_000);

  afterAll(async () => {
    await app?.chiudi();
    if (prisma) {
      await svuota(prisma);
      await prisma.$disconnect();
    }
  }, 60_000);

  it('⭐ cambiare NOME e DESCRIZIONE a un importato è accettato, e il dato locale cambia', async () => {
    const esito = await chiama(app, 'PATCH', `/products/${PRODOTTO}`, {
      token,
      corpo: { name: 'Nome deciso in VestiFlow', description: 'Descrizione riscritta qui' },
    });

    // Il corpo entra nel messaggio: se torna il 409, questa prova dice quale.
    expect(`${esito.stato} ${JSON.stringify(esito.corpo)}`).toContain('200');

    const salvato = await prisma.product.findUniqueOrThrow({
      where: { id: PRODOTTO },
      select: { name: true, description: true, catalogOrigin: true, shopifyProductId: true },
    });
    expect(salvato).toMatchObject({
      name: 'Nome deciso in VestiFlow',
      description: 'Descrizione riscritta qui',
      // L'origine resta provenienza, il collegamento resta.
      catalogOrigin: CatalogOrigin.shopify,
      shopifyProductId: '10328079597863',
    });
  });

  it('⭐ anche lo STATO locale si cambia: era il campo che bloccava «Non attiva»', async () => {
    const esito = await chiama(app, 'PATCH', `/products/${PRODOTTO}`, {
      token,
      corpo: { status: 'draft' },
    });

    expect(`${esito.stato} ${JSON.stringify(esito.corpo)}`).toContain('200');
    const salvato = await prisma.product.findUniqueOrThrow({
      where: { id: PRODOTTO },
      select: { status: true },
    });
    expect(salvato.status).toBe('draft');
  });
});
