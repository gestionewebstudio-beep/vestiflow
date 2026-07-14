import { describe, expect, it, vi } from 'vitest';

import type { VatCodesService } from './vat-codes.service';
import { VatCodesController } from './vat-codes.controller';

describe('VatCodesController', () => {
  const tenantId = 'tenant-1';
  const vatCodes = {
    list: vi.fn(),
    listNatures: vi.fn(),
    create: vi.fn(),
    reorder: vi.fn(),
    duplicate: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  const controller = new VatCodesController(vatCodes as unknown as VatCodesService);

  it('list delega al service per il tenant corrente', async () => {
    vatCodes.list.mockResolvedValue([{ id: 'vc-1' }]);

    await expect(controller.list(tenantId)).resolves.toEqual([{ id: 'vc-1' }]);
    expect(vatCodes.list).toHaveBeenCalledWith(tenantId);
  });

  it('listNatures delega al service (catalogo di sistema, non per tenant)', async () => {
    vatCodes.listNatures.mockResolvedValue([{ id: 'nat-1', key: 'TAXABLE' }]);

    await expect(controller.listNatures()).resolves.toEqual([{ id: 'nat-1', key: 'TAXABLE' }]);
    expect(vatCodes.listNatures).toHaveBeenCalledWith();
  });

  it('create delega al service col body ricevuto', async () => {
    const dto = { code: '22', natureId: 'nat-1', ratePercent: 22, description: 'Imponibile 22%' };
    vatCodes.create.mockResolvedValue({ id: 'vc-new' });

    await expect(controller.create(tenantId, dto)).resolves.toEqual({ id: 'vc-new' });
    expect(vatCodes.create).toHaveBeenCalledWith(tenantId, dto);
  });

  it('reorder delega al service con la lista ordinata di id', async () => {
    const dto = { orderedIds: ['vc-2', 'vc-1'] };
    vatCodes.reorder.mockResolvedValue([{ id: 'vc-2' }, { id: 'vc-1' }]);

    await controller.reorder(tenantId, dto);

    expect(vatCodes.reorder).toHaveBeenCalledWith(tenantId, dto.orderedIds);
  });

  it('duplicate delega al service con id sorgente e nuovo codice', async () => {
    const dto = { code: '22-BIS' };
    vatCodes.duplicate.mockResolvedValue({ id: 'vc-dup' });

    await controller.duplicate(tenantId, 'vc-1', dto);

    expect(vatCodes.duplicate).toHaveBeenCalledWith(tenantId, 'vc-1', dto.code);
  });

  it('update delega al service con id e body', async () => {
    const dto = { description: 'Nuova descrizione' };
    vatCodes.update.mockResolvedValue({ id: 'vc-1', description: 'Nuova descrizione' });

    await controller.update(tenantId, 'vc-1', dto);

    expect(vatCodes.update).toHaveBeenCalledWith(tenantId, 'vc-1', dto);
  });

  it('delete delega al service e non restituisce contenuto', async () => {
    vatCodes.delete.mockResolvedValue(undefined);

    await expect(controller.delete(tenantId, 'vc-1')).resolves.toBeUndefined();
    expect(vatCodes.delete).toHaveBeenCalledWith(tenantId, 'vc-1');
  });
});
