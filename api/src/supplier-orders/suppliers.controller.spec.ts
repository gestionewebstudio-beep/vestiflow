import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';

describe('SuppliersController', () => {
  const tenantId = 'tenant-1';

  const suppliers = {
    listAll: vi.fn(),
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    listVariantLinksBySupplier: vi.fn(),
    upsertVariantLink: vi.fn(),
    deleteVariantLink: vi.fn(),
  };

  let controller: SuppliersController;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new SuppliersController(suppliers as unknown as SuppliersService);
  });

  it('listAll delega listAll', async () => {
    suppliers.listAll.mockResolvedValue([{ id: 'sup-1', name: 'Fornitore' }]);
    await expect(controller.listAll(tenantId)).resolves.toHaveLength(1);
    expect(suppliers.listAll).toHaveBeenCalledWith(tenantId);
  });

  it('create delega create', async () => {
    const dto = { name: 'Nuovo' };
    suppliers.create.mockResolvedValue({ id: 'sup-2', ...dto });
    await controller.create(tenantId, dto);
    expect(suppliers.create).toHaveBeenCalledWith(tenantId, dto);
  });
});
