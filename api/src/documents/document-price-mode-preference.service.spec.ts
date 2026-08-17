import { DocumentType } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import { DocumentPriceModePreferenceService } from './document-price-mode-preference.service';

/**
 * La gerarchia netto/ivato dei documenti di VENDITA, per intero.
 *
 * ```text
 * memoria dell'operatore per quel tipo  ??  convenzione aziendale
 * ```
 *
 * ⚠️ Queste prove nascono da un dubbio di Luigi il 17/08: dopo l'azzeramento
 * una tantum delle vecchie memorie, la memoria **torna a funzionare**? Cioè: se
 * creo una Fattura in modalità diversa dal default aziendale, la Fattura
 * successiva me la ripropone?
 *
 * La risposta era sì — l'azzeramento è un evento, non un ritiro del meccanismo —
 * ma **niente lo teneva fermo**: nessuna prova copriva questo giro. Adesso sì.
 */
describe('DocumentPriceModePreferenceService', () => {
  const tenantId = 'tenant-1';
  const userId = 'user-1';

  const prisma = {
    userDocumentPriceModePreference: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    tenantFeatureSettings: {
      findUnique: vi.fn(),
    },
  };

  let service: DocumentPriceModePreferenceService;

  /** Convenzione aziendale del tenant. */
  function convenzione(ivato: boolean): void {
    prisma.tenantFeatureSettings.findUnique.mockResolvedValue({ salesPricesIncludeVat: ivato });
  }

  /** Memoria dell'operatore, o `null` se non ne ha. */
  function memoria(ivato: boolean | null): void {
    prisma.userDocumentPriceModePreference.findUnique.mockResolvedValue(
      ivato === null ? null : { pricesIncludeVat: ivato },
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.userDocumentPriceModePreference.upsert.mockResolvedValue({});
    service = new DocumentPriceModePreferenceService(prisma as unknown as PrismaService);
  });

  describe('senza memoria: parla la convenzione aziendale', () => {
    it('convenzione ivata → la Fattura nuova nasce ivata', async () => {
      memoria(null);
      convenzione(true);

      await expect(
        service.resolvePricesIncludeVat(tenantId, userId, DocumentType.invoice_draft),
      ).resolves.toBe(true);
    });

    it('convenzione netta → la Fattura nuova nasce netta', async () => {
      memoria(null);
      convenzione(false);

      await expect(
        service.resolvePricesIncludeVat(tenantId, userId, DocumentType.invoice_draft),
      ).resolves.toBe(false);
    });

    it('senza nemmeno le impostazioni del tenant, resta ivato — com’era prima', async () => {
      memoria(null);
      prisma.tenantFeatureSettings.findUnique.mockResolvedValue(null);

      await expect(
        service.resolvePricesIncludeVat(tenantId, userId, DocumentType.sales_ddt),
      ).resolves.toBe(true);
    });
  });

  describe('con memoria: vince la memoria, ed è la comodità decisa', () => {
    it('memoria netta contro convenzione ivata → vince la memoria', async () => {
      memoria(false);
      convenzione(true);

      await expect(
        service.resolvePricesIncludeVat(tenantId, userId, DocumentType.invoice_draft),
      ).resolves.toBe(false);
    });

    it('memoria ivata contro convenzione netta → vince la memoria', async () => {
      memoria(true);
      convenzione(false);

      await expect(
        service.resolvePricesIncludeVat(tenantId, userId, DocumentType.invoice_draft),
      ).resolves.toBe(true);
    });

    it('con la memoria la convenzione non viene nemmeno letta', async () => {
      memoria(false);
      convenzione(true);

      await service.resolvePricesIncludeVat(tenantId, userId, DocumentType.invoice_draft);

      expect(prisma.tenantFeatureSettings.findUnique).not.toHaveBeenCalled();
    });
  });

  /**
   * ⚠️ Il giro completo, che è il dubbio da cui nascono queste prove:
   * azzerata la memoria, l'operatore sceglie diverso dal default → la scelta
   * torna a essere ricordata → il documento successivo la ripropone.
   */
  it('dopo l’azzeramento la memoria torna a scriversi e a valere', async () => {
    // 1 · memoria azzerata: parla la convenzione
    memoria(null);
    convenzione(true);
    await expect(
      service.resolvePricesIncludeVat(tenantId, userId, DocumentType.invoice_draft),
    ).resolves.toBe(true);

    // 2 · l'operatore compila quella Fattura in NETTO: la scelta si ricorda
    await service.remember(tenantId, userId, DocumentType.invoice_draft, false);
    expect(prisma.userDocumentPriceModePreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          tenantId,
          userId,
          documentType: DocumentType.invoice_draft,
          pricesIncludeVat: false,
        }),
      }),
    );

    // 3 · la Fattura successiva riparte da lì, non dalla convenzione
    memoria(false);
    await expect(
      service.resolvePricesIncludeVat(tenantId, userId, DocumentType.invoice_draft),
    ).resolves.toBe(false);
  });

  describe('chi NON risponde alla convenzione', () => {
    it('Arrivo merce: i costi partono netti, la convenzione non lo governa', async () => {
      memoria(null);
      convenzione(true);

      await expect(
        service.resolvePricesIncludeVat(tenantId, userId, DocumentType.goods_receipt),
      ).resolves.toBe(false);
      expect(prisma.tenantFeatureSettings.findUnique).not.toHaveBeenCalled();
    });

    it('cassa negozio: la sua modalità la decide lo store, non questa catena', async () => {
      memoria(null);
      convenzione(true);

      await expect(
        service.resolvePricesIncludeVat(tenantId, userId, DocumentType.store_sale),
      ).resolves.toBe(false);
    });

    it('trasferimento: non usa la modalità', async () => {
      memoria(null);
      convenzione(true);

      await expect(
        service.resolvePricesIncludeVat(tenantId, userId, DocumentType.transfer),
      ).resolves.toBe(false);
    });
  });

  it('l’Ordine cliente risponde alla convenzione: ha un tipo suo', async () => {
    memoria(null);
    convenzione(true);

    await expect(
      service.resolvePricesIncludeVat(tenantId, userId, DocumentType.customer_order),
    ).resolves.toBe(true);
  });
});
