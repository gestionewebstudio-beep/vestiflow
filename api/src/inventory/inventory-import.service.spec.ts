import { BadRequestException } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { InventoryService } from './inventory.service';
import type { PrismaService } from '../prisma/prisma.service';
import { TenantPermission } from '../auth/tenant-permission.constants';
import { testClerkUser, testOwnerUser } from '../test/fixtures/user-profile.fixture';
import { InventoryImportService } from './inventory-import.service';

const SAMPLE_CSV = `SKU,Location,Disponibile,Soglia minima
SKU-RED-M,Napoli,10,2
UNKNOWN-SKU,Milano,5,
`;

describe('InventoryImportService', () => {
  const ownerUser = testOwnerUser();
  function createService(options: {
    variants?: Array<{
      id: string;
      sku: string;
      optionValues: Record<string, string>;
      product: { name: string };
    }>;
    locations?: Array<{ id: string; name: string }>;
    levels?: Array<{ variantId: string; locationId: string; available: number }>;
  } = {}) {
    const {
      variants = [
        {
          id: 'var-1',
          sku: 'SKU-RED-M',
          optionValues: { Taglia: 'M' },
          product: { name: 'Maglietta' },
        },
      ],
      locations = [
        { id: 'loc-1', name: 'Napoli' },
        { id: 'loc-2', name: 'Milano' },
      ],
      levels = [{ variantId: 'var-1', locationId: 'loc-1', available: 8 }],
    } = options;

    const prisma = {
      productVariant: { findMany: vi.fn().mockResolvedValue(variants) },
      location: { findMany: vi.fn().mockResolvedValue(locations) },
      inventoryLevel: { findMany: vi.fn().mockResolvedValue(levels) },
      inventoryLevelUpdateMany: vi.fn(),
    };

    const inventory = {
      registerMovement: vi.fn(),
    };

    const service = new InventoryImportService(
      prisma as unknown as PrismaService,
      inventory as unknown as InventoryService,
    );

    return { service, prisma, inventory };
  }

  it('previewCsv restituisce righe pronte e con errori', async () => {
    const { service } = createService();

    const preview = await service.previewCsv('tenant-1', SAMPLE_CSV);

    expect(preview.summary.total).toBe(2);
    expect(preview.summary.ready).toBe(1);
    expect(preview.summary.errors).toBe(1);
    expect(preview.rows[0]).toMatchObject({
      sku: 'SKU-RED-M',
      locationName: 'Napoli',
      currentAvailable: 8,
      newAvailable: 10,
      delta: 2,
      status: 'ready',
    });
    expect(preview.rows[1]?.status).toBe('error');
  });

  it('previewCsv segna riga invariata se quantità uguale', async () => {
    const { service } = createService({
      levels: [{ variantId: 'var-1', locationId: 'loc-1', available: 10 }],
    });

    const csv = `SKU,Location,Disponibile\nSKU-RED-M,Napoli,10\n`;
    const preview = await service.previewCsv('tenant-1', csv);

    expect(preview.summary.unchanged).toBe(1);
    expect(preview.rows[0]?.status).toBe('unchanged');
  });

  it('previewCsv rifiuta CSV non valido', async () => {
    const { service } = createService();

    await expect(service.previewCsv('tenant-1', 'SKU,Disponibile\nx,1\n')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('importCsv applica righe pronte via inventory service', async () => {
    const { service, inventory } = createService({
      levels: [{ variantId: 'var-1', locationId: 'loc-1', available: 8 }],
    });

    const csv = `SKU,Location,Disponibile\nSKU-RED-M,Napoli,10\n`;
    const result = await service.importCsv('tenant-1', csv, ownerUser);

    expect(result.updated).toBe(1);
    expect(result.failed).toBe(0);
    expect(inventory.registerMovement).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        type: 'adjustment',
        variantId: 'var-1',
        locationId: 'loc-1',
        quantity: 2,
      }),
      'Import CSV',
      undefined,
      ownerUser,
    );
  });

  /**
   * ⛔ **L'anteprima era un oracolo di Disponibile.**
   *
   * `POST /inventory/levels/import/preview` restituisce `currentAvailable` per
   * ogni riga del CSV, e la sede si nomina **nel file**. Fino al 28/08/2026 la
   * rotta non riceveva nemmeno `@CurrentUser()`: bastava scrivere il nome di un
   * magazzino altrui per leggerne la Disponibile, articolo per articolo.
   *
   * ⚠️ Il permesso della rotta (`inventory.import_export`) non dice nulla su
   * QUALE sede — è la stessa forma già trovata sulla cassa e sugli impegni.
   *
   * Politica di **LETTURA**: è il pavimento documentato (`T15` §12 chiama questo
   * endpoint «sola lettura»), non una scelta presa qui.
   */
  describe('InventoryImportService — la sede nominata dal CSV', () => {
    const CSV_NAPOLI = 'SKU,Location,Disponibile\nSKU-RED-M,Napoli,10\n';
    const CSV_MILANO = 'SKU,Location,Disponibile\nSKU-RED-M,Milano,10\n';
    const CSV_MISTO = 'SKU,Location,Disponibile\nSKU-RED-M,Napoli,10\nSKU-RED-M,Milano,4\n';

    /** Commesso assegnato alla sola Napoli: Milano è fuori dal suo ambito. */
    const soloNapoli = () => testClerkUser({ assignedLocationIds: ['loc-1'] });

    it('✅ sede autorizzata: l’anteprima si calcola', async () => {
      const { service } = createService();

      await expect(service.previewCsv('tenant-1', CSV_NAPOLI, soloNapoli())).resolves.toMatchObject({
        summary: { total: 1 },
      });
    });

    it('⛔ stessa tenant, sede fuori ambito: RIFIUTATA', async () => {
      const { service } = createService();

      await expect(service.previewCsv('tenant-1', CSV_MILANO, soloNapoli())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    /**
     * ⭐ Il criterio che rende la correzione utile: il rifiuto arriva **prima**
     * della query sui livelli. Filtrare il risultato dopo averlo letto non
     * chiuderebbe l'oracolo — la lettura è essa stessa ciò che va impedito.
     */
    it('⛔ e nessuna query sui livelli viene eseguita', async () => {
      const { service, prisma } = createService();

      await expect(service.previewCsv('tenant-1', CSV_MILANO, soloNapoli())).rejects.toBeInstanceOf(
        ForbiddenException,
      );

      expect(prisma.inventoryLevel.findMany).not.toHaveBeenCalled();
    });

    // Una sola riga fuori ambito in mezzo ad altre autorizzate ferma tutto:
    // l'anteprima è un risultato solo, non si consegna a metà.
    it('⛔ una riga fuori ambito fra due: l’anteprima intera è rifiutata', async () => {
      const { service } = createService();

      await expect(service.previewCsv('tenant-1', CSV_MISTO, soloNapoli())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('✅ il titolare vede qualunque sede', async () => {
      const { service } = createService();

      await expect(
        service.previewCsv('tenant-1', CSV_MILANO, testOwnerUser({ assignedLocationIds: [] })),
      ).resolves.toMatchObject({ summary: { total: 1 } });
    });

    it('✅ chi ha inventory.view_all_locations vede qualunque sede', async () => {
      const { service } = createService();
      const supervisore = testClerkUser({
        assignedLocationIds: ['loc-1'],
        permissions: [TenantPermission.InventoryViewAllLocations],
      });

      await expect(
        service.previewCsv('tenant-1', CSV_MILANO, supervisore),
      ).resolves.toMatchObject({ summary: { total: 1 } });
    });

    // ⚠️ Un nome che non corrisponde a nessuna sede non è un problema di
    // autorizzazione: resta un errore di riga, segnalato dall'anteprima come
    // sempre. Il comportamento non cambia.
    it('nome di sede inesistente: resta un errore di riga, non un 403', async () => {
      const { service } = createService();
      const csv = 'SKU,Location,Disponibile\nSKU-RED-M,Sede-Fantasma,10\n';

      const esito = await service.previewCsv('tenant-1', csv, soloNapoli());

      expect(esito.summary.errors).toBe(1);
    });
  });
});
