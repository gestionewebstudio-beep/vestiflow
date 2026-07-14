import { StreamableFile } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { testOwnerUser } from '../test/fixtures/user-profile.fixture';
import type { SupplierOrderPdfService } from './supplier-order-pdf.service';
import type { SupplierOrdersService } from './supplier-orders.service';
import { SupplierOrdersController } from './supplier-orders.controller';

describe('SupplierOrdersController', () => {
  const tenantId = 'tenant-1';
  const user = testOwnerUser();
  const supplierOrders = {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    receive: vi.fn(),
    send: vi.fn(),
    cancel: vi.fn(),
    delete: vi.fn(),
  };
  const supplierOrderPdf = {
    exportPdf: vi.fn(),
  };

  const controller = new SupplierOrdersController(
    supplierOrders as unknown as SupplierOrdersService,
    supplierOrderPdf as unknown as SupplierOrderPdfService,
  );

  it('list delega al service', async () => {
    const query = { page: 1, pageSize: 20 };
    supplierOrders.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });

    await controller.list(tenantId, user, query);

    expect(supplierOrders.list).toHaveBeenCalledWith(tenantId, query, user);
  });

  it('getById delega al service', async () => {
    supplierOrders.getById.mockResolvedValue({ id: 'po-1' });

    await expect(controller.getById(tenantId, user, 'po-1')).resolves.toEqual({ id: 'po-1' });
    expect(supplierOrders.getById).toHaveBeenCalledWith(tenantId, 'po-1', user);
  });

  it('exportPdf recupera l\'ordine via getById (scope location) e restituisce StreamableFile', async () => {
    const order = { id: 'po-1', reference: 'PO-2026-0042' };
    supplierOrders.getById.mockResolvedValue(order);
    supplierOrderPdf.exportPdf.mockResolvedValue({
      buffer: Buffer.from('%PDF-test'),
      filename: 'ordine-fornitore-PO-2026-0042.pdf',
    });

    const result = await controller.exportPdf(tenantId, user, 'po-1');

    expect(supplierOrders.getById).toHaveBeenCalledWith(tenantId, 'po-1', user);
    expect(supplierOrderPdf.exportPdf).toHaveBeenCalledWith(tenantId, order);
    expect(result).toBeInstanceOf(StreamableFile);
    expect(result.options.type).toBe('application/pdf');
    expect(result.options.disposition).toBe(
      'attachment; filename="ordine-fornitore-PO-2026-0042.pdf"',
    );
  });

  it('create delega al service', async () => {
    const dto = { supplierId: 'sup-1', lines: [] };
    supplierOrders.create.mockResolvedValue({ id: 'po-new' });

    await controller.create(tenantId, user, dto as never);

    expect(supplierOrders.create).toHaveBeenCalledWith(tenantId, dto, user);
  });

  it('update delega al service', async () => {
    const dto = { destinationLocationId: 'loc-1', lines: [] };
    supplierOrders.update.mockResolvedValue({ id: 'po-1' });

    await controller.update(tenantId, user, 'po-1', dto as never);

    expect(supplierOrders.update).toHaveBeenCalledWith(tenantId, 'po-1', dto, user);
  });

  it('send delega al service passando l\'utente (scope location)', async () => {
    supplierOrders.send.mockResolvedValue({ id: 'po-1', status: 'sent' });

    await controller.send(tenantId, user, 'po-1');

    expect(supplierOrders.send).toHaveBeenCalledWith(tenantId, 'po-1', user);
  });

  it('cancel delega al service passando l\'utente (scope location)', async () => {
    supplierOrders.cancel.mockResolvedValue({ id: 'po-1', status: 'cancelled' });

    await controller.cancel(tenantId, user, 'po-1');

    expect(supplierOrders.cancel).toHaveBeenCalledWith(tenantId, 'po-1', user);
  });

  it('receive delega al service', async () => {
    const dto = { lines: [{ lineId: 'line-1', receivedQuantity: 2 }] };
    supplierOrders.receive.mockResolvedValue({ id: 'po-1' });

    await controller.receive(tenantId, 'po-1', dto as never);

    expect(supplierOrders.receive).toHaveBeenCalledWith(tenantId, 'po-1', dto);
  });

  it('delete delega al service passando l\'utente (scope location)', async () => {
    supplierOrders.delete.mockResolvedValue(undefined);

    await controller.delete(tenantId, user, 'po-1');

    expect(supplierOrders.delete).toHaveBeenCalledWith(tenantId, 'po-1', user);
  });
});
