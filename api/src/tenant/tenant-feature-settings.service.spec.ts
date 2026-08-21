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
      defaultUnitOfMeasure: 'pz',
    });

    await expect(service.getOrCreate(tenantId)).resolves.toMatchObject({
      lotsEnabled: false,
    });
    expect(prisma.tenantFeatureSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId },
        create: expect.objectContaining({ tenantId, defaultUnitOfMeasure: 'pz' }),
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
      defaultUnitOfMeasure: 'kg',
    });

    await expect(
      service.update(tenantId, {
        lotsEnabled: true,
        serialsEnabled: true,
        defaultUnitOfMeasure: 'kg',
      }),
    ).resolves.toMatchObject({
      lotsEnabled: true,
      serialsEnabled: true,
      defaultUnitOfMeasure: 'kg',
    });

    expect(prisma.tenantFeatureSettings.update).toHaveBeenCalledWith({
      where: { tenantId },
      data: {
        lotsEnabled: true,
        serialsEnabled: true,
        defaultUnitOfMeasure: 'kg',
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
          documentType: { in: expect.arrayContaining(['invoice_draft', 'sales_ddt', 'quote']) },
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
