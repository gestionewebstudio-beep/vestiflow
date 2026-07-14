import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import { SkuGeneratorService } from './sku-generator.service';

describe('SkuGeneratorService', () => {
  const tenantId = 'tenant-1';

  function createService() {
    const prisma = {
      productVariant: {
        count: vi.fn(),
        findFirst: vi.fn(),
      },
    };
    const service = new SkuGeneratorService(prisma as unknown as PrismaService);
    return { service, prisma };
  }

  it('prodotto semplice: propone il codice base + progressivo a 5 cifre partendo dal conteggio esistente', async () => {
    const { service, prisma } = createService();
    prisma.productVariant.count.mockResolvedValue(124);
    prisma.productVariant.findFirst.mockResolvedValue(null);

    const sku = await service.previewSku(tenantId, {
      productName: 'Maglia girocollo Basic',
      category: 'Maglie',
    });

    expect(sku).toBe('MAG-BASIC-00125');
    expect(prisma.productVariant.count).toHaveBeenCalledWith({
      where: { tenantId, sku: { startsWith: 'MAG-BASIC-', mode: 'insensitive' } },
    });
  });

  it('prodotto semplice: se il progressivo stimato collide, incrementa finche trova un codice libero', async () => {
    const { service, prisma } = createService();
    prisma.productVariant.count.mockResolvedValue(0);
    // Il primo candidato (00001) risulta gia' preso, il secondo (00002) e' libero.
    prisma.productVariant.findFirst
      .mockResolvedValueOnce({ id: 'existing-1' })
      .mockResolvedValueOnce(null);

    const sku = await service.previewSku(tenantId, {
      productName: 'Borraccia termica',
      category: 'Accessori',
    });

    expect(sku).toBe('ACC-TERMIC-00002');
    expect(prisma.productVariant.findFirst).toHaveBeenCalledTimes(2);
  });

  it('variante con colore/taglia: propone il codice "pulito" se libero, senza progressivo', async () => {
    const { service, prisma } = createService();
    prisma.productVariant.findFirst.mockResolvedValue(null);

    const sku = await service.previewSku(tenantId, {
      productName: 'Maglia girocollo Basic',
      category: 'Maglie',
      optionValues: [
        { name: 'Colore', value: 'Nero' },
        { name: 'Taglia', value: 'S' },
      ],
    });

    expect(sku).toBe('MAG-BASIC-NER-S');
    expect(prisma.productVariant.count).not.toHaveBeenCalled();
  });

  it('variante con attributi: in caso di collisione propone un suffisso progressivo breve (mai un errore)', async () => {
    const { service, prisma } = createService();
    prisma.productVariant.findFirst
      .mockResolvedValueOnce({ id: 'existing-1' }) // MAG-BASIC-NER-S gia' preso
      .mockResolvedValueOnce({ id: 'existing-2' }) // MAG-BASIC-NER-S-02 gia' preso
      .mockResolvedValueOnce(null); // MAG-BASIC-NER-S-03 libero

    const sku = await service.previewSku(tenantId, {
      productName: 'Maglia girocollo Basic',
      category: 'Maglie',
      optionValues: [
        { name: 'Colore', value: 'Nero' },
        { name: 'Taglia', value: 'S' },
      ],
    });

    expect(sku).toBe('MAG-BASIC-NER-S-03');
  });

  it('non lancia mai un errore per collisione: risolve sempre un codice, anche in scenari patologici', async () => {
    const { service, prisma } = createService();
    prisma.productVariant.count.mockResolvedValue(0);
    prisma.productVariant.findFirst.mockResolvedValue({ id: 'always-taken' });

    await expect(
      service.previewSku(tenantId, { productName: 'X', category: 'Y' }),
    ).resolves.toEqual(expect.any(String));
  });
});
