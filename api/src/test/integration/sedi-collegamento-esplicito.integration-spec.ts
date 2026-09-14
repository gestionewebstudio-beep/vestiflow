import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ShopifyLocationLinkService } from '../../shopify/shopify-location-link.service';
import { ShopifyLocationSyncService } from '../../shopify/shopify-location-sync.service';
import { ambienteIntegrazione } from './env';
import { creaDataset, IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';

/**
 * ⭐ B7 — il collegamento sede ↔ location è ESPLICITO (`docs/27` §2, `DA-FARE`
 *    §12): la sincronizzazione delle sedi collega solo per identificativo già
 *    noto, non crea sedi, non abbina per nome; ciò che non è collegato lo
 *    RIPORTA. Coppia e periodo si scrivono una volta, e la stessa sede o la
 *    stessa location non si assegnano due volte.
 *
 * ⛔ Qui c’erano il collegamento per NOME (`normalizeName`) e la creazione
 *    automatica della sede (`location.create`): tolti l’11/09/2026. La prova
 *    «stesso nome» è la falsificazione: se il nome tornasse a contare, il
 *    primo caso diventerebbe rosso.
 */
describe('Sedi — collegamento esplicito (B7), su PostgreSQL', () => {
  let prisma: PrismaClient;
  let collegamento: ShopifyLocationLinkService;
  const DOMINIO = 'sedi.myshopify.com';

  type LocationRemota = {
    id: number;
    name: string;
    active: boolean;
    address1?: string | null;
    city?: string | null;
    zip?: string | null;
    province?: string | null;
    country_code?: string | null;
  };

  function sync(remote: readonly LocationRemota[]) {
    return new ShopifyLocationSyncService(
      prisma as never,
      { listLocations: async () => remote } as never,
      collegamento,
    );
  }

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
    collegamento = new ShopifyLocationLinkService(prisma as never);
    const negozio = await prisma.shopifyShop.create({
      data: { tenantId: IDS.tenantA, shopGid: 'gid://shopify/Shop/996001' },
    });
    await prisma.shopifyConnection.create({
      data: {
        tenantId: IDS.tenantA,
        status: 'connected',
        shopDomain: DOMINIO,
        shopId: negozio.id,
        scopes: ['read_products'],
      },
    });
  });

  async function coppieDelTenant() {
    return prisma.shopifyLocationPair.findMany({
      where: { locationId: { in: [IDS.locA1, IDS.locA2] } },
      include: { periodi: true },
      orderBy: { shopifyLocationGid: 'asc' },
    });
  }

  it('⛔ stesso NOME della sede VestiFlow: nessun collegamento, nessuna sede creata, e la location è riportata', async () => {
    const sediPrima = await prisma.location.count({ where: { tenantId: IDS.tenantA } });
    const esito = await sync([
      { id: 55001, name: 'A1 — sede assegnata', active: true },
      { id: 55002, name: 'Deposito nuovo', active: true },
    ]).syncFromShopify(IDS.tenantA, DOMINIO, 'token');

    expect(esito.matchedCount).toBe(0);
    expect(esito.importedCount).toBe(0);
    expect(esito.unlinked.map((u) => u.shopifyLocationId)).toEqual(['55001', '55002']);
    expect(await prisma.location.count({ where: { tenantId: IDS.tenantA } })).toBe(sediPrima);
    expect(await coppieDelTenant()).toEqual([]);
    const a1 = await prisma.location.findUniqueOrThrow({ where: { id: IDS.locA1 } });
    expect(a1.shopifyLocationId).toBeNull();
  });

  it('⭐ id già noto sulla sede: coppia e periodo attivo UNA volta, anche rieseguendo', async () => {
    await prisma.location.update({
      where: { id: IDS.locA1 },
      data: { shopifyLocationId: '55001' },
    });
    const servizio = sync([{ id: 55001, name: 'Qualunque nome', active: true }]);

    const primo = await servizio.syncFromShopify(IDS.tenantA, DOMINIO, 'token');
    expect(primo.matchedCount).toBe(1);
    expect(primo.unlinked).toEqual([]);

    const secondo = await servizio.syncFromShopify(IDS.tenantA, DOMINIO, 'token');
    expect(secondo.matchedCount).toBe(1);

    const coppie = await coppieDelTenant();
    expect(coppie).toHaveLength(1);
    expect(coppie[0]?.shopifyLocationGid).toBe('gid://shopify/Location/55001');
    expect(coppie[0]?.periodi.filter((l) => l.status === 'active')).toHaveLength(1);
    expect(coppie[0]?.periodi).toHaveLength(1);
  });

  it('collega/crea/lascia passano dal servizio di collegamento: la stessa sede o la stessa location non si assegnano due volte', async () => {
    const collega = (locationId: string, shopifyLocationId: string) =>
      prisma.$transaction((tx) =>
        collegamento.collega(tx, { tenantId: IDS.tenantA, locationId, shopifyLocationId }),
      );

    expect((await collega(IDS.locA1, '55001')).tipo).toBe('registrato');
    expect((await collega(IDS.locA1, '55001')).tipo).toBe('gia_collegata');
    // La sede A1 ha già la sua location: un’altra location non la prende.
    expect((await collega(IDS.locA1, '55009')).tipo).toBe('sede_di_altra_location');
    // La location 55001 ha già la sua sede: un’altra sede non la prende.
    expect((await collega(IDS.locA2, '55001')).tipo).toBe('location_di_altra_sede');

    const collegate = await collegamento.sediCollegate(IDS.tenantA);
    expect(collegate).toEqual([
      { locationId: IDS.locA1, shopifyLocationId: '55001', gid: 'gid://shopify/Location/55001' },
    ]);
    // La colonna-cache segue la coppia, che è la fonte.
    const a1 = await prisma.location.findUniqueOrThrow({ where: { id: IDS.locA1 } });
    expect(a1.shopifyLocationId).toBe('55001');
  });

  it('senza negozio registrato non si collega niente: lo dice, non lo inventa', async () => {
    await prisma.shopifyConnection.update({
      where: { tenantId: IDS.tenantA },
      data: { shopId: null },
    });
    const esito = await prisma.$transaction((tx) =>
      collegamento.collega(tx, {
        tenantId: IDS.tenantA,
        locationId: IDS.locA1,
        shopifyLocationId: '55001',
      }),
    );
    expect(esito.tipo).toBe('negozio_assente');
    expect(await coppieDelTenant()).toEqual([]);
  });
});
