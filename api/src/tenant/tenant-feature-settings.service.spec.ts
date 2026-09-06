import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import { TenantFeatureSettingsService } from './tenant-feature-settings.service';

describe('TenantFeatureSettingsService', () => {
  const tenantId = 'tenant-1';
  const prisma = {
    tenantFeatureSettings: {
      upsert: vi.fn(),
      update: vi.fn(),
    },
    userDocumentPriceModePreference: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };

  let service: TenantFeatureSettingsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TenantFeatureSettingsService(prisma as unknown as PrismaService);
  });

  it('getOrCreate crea defaults se mancante', async () => {
    prisma.tenantFeatureSettings.upsert.mockResolvedValue({
      tenantId,
      lotsEnabled: false,
      serialsEnabled: false,
      variantsEnabled: true,
      barcodeScannerEnabled: true,
      supplierOrdersEnabled: true,
      goodsReceiptEnabled: true,
      warehouseValuationEnabled: true,
      allowNegativeInventory: false,
      warnNegativeInventory: true,
      blockNegativeInventory: false,
    });

    await expect(service.getOrCreate(tenantId)).resolves.toMatchObject({
      lotsEnabled: false,
    });
    expect(prisma.tenantFeatureSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId },
        // ⚠️ L'asserzione nominava anche `defaultUnitOfMeasure: 'pz'`, tolto il
        //   26/08/2026. L’intento resta, e non va perso: la creazione deve portare
        //   il tenant e partire dai valori di default, non da un oggetto vuoto.
        create: expect.objectContaining({ tenantId, lotsEnabled: false }),
      }),
    );
  });

  // §B3b-4: i tre listini si rinominano e si attivano da qui. Il nome `null`
  // non e' un nome vuoto — e' «torna a chiamarsi Listino N» — e va distinto dal
  // campo assente, che significa «non toccare».
  it('update rinomina e attiva i listini, e null riporta al nome di default', async () => {
    prisma.tenantFeatureSettings.upsert.mockResolvedValue({});
    prisma.tenantFeatureSettings.update.mockResolvedValue({
      tenantId,
      listino1Name: 'Ingrosso',
      listino1Active: true,
      listino2Name: null,
      listino2Active: true,
      listino3Name: null,
      listino3Active: false,
    });

    await expect(
      service.update(tenantId, {
        listino1Name: 'Ingrosso',
        listino2Name: null,
        listino2Active: true,
      }),
    ).resolves.toMatchObject({
      listino1Name: 'Ingrosso',
      listino2Name: null,
      listino2Active: true,
    });

    expect(prisma.tenantFeatureSettings.update).toHaveBeenCalledWith({
      where: { tenantId },
      data: { listino1Name: 'Ingrosso', listino2Name: null, listino2Active: true },
    });
  });

  it('update persiste i campi modificati', async () => {
    prisma.tenantFeatureSettings.upsert.mockResolvedValue({});
    prisma.tenantFeatureSettings.update.mockResolvedValue({
      tenantId,
      lotsEnabled: true,
      serialsEnabled: true,
      variantsEnabled: true,
      barcodeScannerEnabled: true,
      supplierOrdersEnabled: true,
      goodsReceiptEnabled: true,
      warehouseValuationEnabled: true,
      allowNegativeInventory: false,
      warnNegativeInventory: true,
      blockNegativeInventory: false,
    });

    await expect(
      service.update(tenantId, {
        lotsEnabled: true,
        serialsEnabled: true,
      }),
    ).resolves.toMatchObject({
      lotsEnabled: true,
      serialsEnabled: true,
    });

    expect(prisma.tenantFeatureSettings.update).toHaveBeenCalledWith({
      where: { tenantId },
      data: {
        lotsEnabled: true,
        serialsEnabled: true,
      },
    });
  });

  /**
   * Cambiare la convenzione aziendale azzera le memorie netto/ivato degli
   * operatori sui tipi di VENDITA.
   *
   * Senza, l'impostazione sembrerebbe rotta: il titolare mette «netto» e chi
   * ha già creato una fattura continua a vedersela nascere ivata, per una
   * memoria che non sa di avere.
   */
  describe('cambio della convenzione aziendale prezzi', () => {
    beforeEach(() => {
      prisma.tenantFeatureSettings.upsert.mockResolvedValue({
        tenantId,
        salesPricesIncludeVat: true,
      });
      prisma.tenantFeatureSettings.update.mockResolvedValue({
        tenantId,
        salesPricesIncludeVat: false,
      });
    });

    it('cambiandola, azzera le memorie degli operatori sui tipi di vendita', async () => {
      await service.update(tenantId, { salesPricesIncludeVat: false });

      expect(prisma.userDocumentPriceModePreference.deleteMany).toHaveBeenCalledWith({
        where: {
          tenantId,
          documentType: { in: expect.arrayContaining(['invoice', 'sales_ddt', 'quote']) },
        },
      });
    });

    it('non tocca i tipi di ACQUISTO: i costi non hanno né convenzione né memoria', async () => {
      await service.update(tenantId, { salesPricesIncludeVat: false });

      const chiamata = prisma.userDocumentPriceModePreference.deleteMany.mock.calls[0]![0] as {
        where: { documentType: { in: string[] } };
      };
      const tipi = chiamata.where.documentType.in;
      expect(tipi).not.toContain('goods_receipt');
      expect(tipi).not.toContain('supplier_order');
    });

    it('⭐ azzera anche le memorie del BANCO: risponde alla convenzione', async () => {
      // ⛔ Qui si provava il contrario — «store_sale resta fuori» — perché al
      // banco la modalità era cablata a «sempre ivato». Tolta il 21/08/2026
      // (`11` A4). ⚠️ Entrare nella convenzione significa **anche** questo: se
      // le memorie non si azzerassero, il titolare imposterebbe «netto» e chi
      // sta al banco continuerebbe a vedere ivato per una memoria che non sa di
      // avere — l'impostazione sembrerebbe rotta.
      await service.update(tenantId, { salesPricesIncludeVat: false });

      const chiamata = prisma.userDocumentPriceModePreference.deleteMany.mock.calls[0]![0] as {
        where: { documentType: { in: string[] } };
      };
      const tipi = chiamata.where.documentType.in;
      expect(tipi).toContain('store_sale');
      expect(tipi).toContain('store_return');
    });

    it('riscriverla UGUALE non azzera niente: nessuno ha cambiato convenzione', async () => {
      await service.update(tenantId, { salesPricesIncludeVat: true });

      expect(prisma.userDocumentPriceModePreference.deleteMany).not.toHaveBeenCalled();
    });

    it('cambiare un altro campo non azzera le memorie', async () => {
      await service.update(tenantId, { lotsEnabled: true });

      expect(prisma.userDocumentPriceModePreference.deleteMany).not.toHaveBeenCalled();
    });
  });
});

/**
 * ⛔ **L'interruttore della Vendita manuale lo gira SOLO il titolare.**
 *
 * Non è una preferenza fra le altre: quel documento riduce la giacenza senza
 * generare movimenti di magazzino, e l'interruttore serve a proteggersene. Chi
 * amministra le impostazioni non deve poterselo riaccendere.
 *
 * ⚠️ **La UI non è la protezione.** Il pannello Impostazioni è già visibile al
 * solo titolare, ma un amministratore può chiamare `PATCH /tenant/feature-settings`
 * direttamente. Queste due prove guardano il servizio, non lo schermo — sono le
 * due che il proprietario ha reso obbligatorie il 26/08/2026.
 */
describe('TenantFeatureSettingsService — chi può girare l’interruttore', () => {
  const tenantId = 'tenant-1';

  function creaServizio() {
    const prisma = {
      tenantFeatureSettings: {
        upsert: vi.fn().mockResolvedValue({ tenantId, manualUnloadEnabled: false }),
        update: vi.fn().mockResolvedValue({ tenantId, manualUnloadEnabled: true }),
      },
      userDocumentPriceModePreference: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    };
    return {
      prisma,
      service: new TenantFeatureSettingsService(prisma as unknown as PrismaService),
    };
  }

  /** Un utente qualunque, col ruolo e i permessi che gli si vogliono dare. */
  function utente(role: string, permessi: readonly string[] = []) {
    return { role, permissions: permessi, supportSession: null } as never;
  }

  it('⭐ il TITOLARE la accende', async () => {
    const { service, prisma } = creaServizio();

    await service.update(tenantId, { manualUnloadEnabled: true }, utente('owner'));

    expect(prisma.tenantFeatureSettings.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { manualUnloadEnabled: true } }),
    );
  });

  it('⭐ e la spegne', async () => {
    const { service, prisma } = creaServizio();

    await service.update(tenantId, { manualUnloadEnabled: false }, utente('owner'));

    expect(prisma.tenantFeatureSettings.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { manualUnloadEnabled: false } }),
    );
  });

  it('⛔ un AMMINISTRATORE con tutti i permessi viene respinto dall’API', async () => {
    // ⚠️ `settings.company` è il permesso che apre le Impostazioni generali:
    //   averlo non basta, ed è esattamente il punto della richiesta.
    const { service, prisma } = creaServizio();

    await expect(
      service.update(
        tenantId,
        { manualUnloadEnabled: true },
        utente('admin', ['settings.company']),
      ),
    ).rejects.toThrow(/titolare/i);
    expect(prisma.tenantFeatureSettings.update).not.toHaveBeenCalled();
  });

  it('⛔ e viene respinto anche SPEGNENDOLA, non solo accendendola', async () => {
    const { service } = creaServizio();

    await expect(
      service.update(
        tenantId,
        { manualUnloadEnabled: false },
        utente('admin', ['settings.company']),
      ),
    ).rejects.toThrow(/titolare/i);
  });

  it('⛔ e senza utente affatto', async () => {
    const { service } = creaServizio();

    await expect(service.update(tenantId, { manualUnloadEnabled: true })).rejects.toThrow(
      /titolare/i,
    );
  });

  it('⭐ ma le ALTRE impostazioni restano dell’amministratore', async () => {
    // ⚠️ Il rifiuto è mirato al campo sensibile. Se coprisse tutto il PATCH,
    //   IVA predefinita, listini e netto/ivato diventerebbero owner-only senza
    //   che nessuno l'abbia chiesto.
    const { service, prisma } = creaServizio();

    await service.update(tenantId, { lotsEnabled: true }, utente('admin', ['settings.company']));

    expect(prisma.tenantFeatureSettings.update).toHaveBeenCalled();
  });
});
