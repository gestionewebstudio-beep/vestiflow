import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';

import { ConfigService } from '@nestjs/config';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuthProfileCacheService } from '../../auth/auth-profile-cache.service';
import { SupabaseService } from '../../auth/supabase.service';
import { PlatformAdminService } from '../../common/platform-admin/platform-admin.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { TenantBackupExportService } from '../../tenant/tenant-backup/tenant-backup-export.service';
import { TenantBackupImportService } from '../../tenant/tenant-backup/tenant-backup-import.service';
import { readTenantBackupData } from '../../tenant/tenant-backup/tenant-backup-entities.util';
import {
  readStreamToBuffer,
  readZipEntry,
  rewriteTenantBackupZip,
} from '../fixtures/tenant-backup.fixture';
import { creaDatasetCassa } from './cassa.fixture';
import { IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';

/** Il client Supabase e i servizi sono reali. Solo lo Storage remoto è sostituito da HTTP locale. */
describe('backup — atomicità PostgreSQL e allegati attraverso SDK Storage/HTTP isolato', () => {
  let prisma: PrismaClient;
  let server: Server;
  let exporter: TenantBackupExportService;
  let importer: TenantBackupImportService;
  let archive: Buffer;
  let state: string;
  const objects = new Map<string, Buffer>();
  let failUploadAt = 0;
  let uploads = 0;
  let failAfterStorageWrite = false;
  const attachmentPath = `${IDS.tenantA}/document/${IDS.docA1}/prova.pdf`;
  const imagePath = `${IDS.tenantA}/products/prova.webp`;
  const originalKeys = [
    `document-attachments/${attachmentPath}`,
    `product-media/${imagePath}`,
  ].sort();

  beforeAll(async () => {
    prisma = creaClientIntegrazione();
    server = createServer((request, response) => {
      void (async () => {
        const path = decodeURIComponent(new URL(request.url!, 'http://localhost').pathname).replace(
          /^\/storage\/v1\/object\/(authenticated\/)?/,
          '',
        );
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        const body = Buffer.concat(chunks);
        response.setHeader('content-type', 'application/json');
        if (request.method === 'GET') {
          const bytes = objects.get(path);
          if (!bytes) {
            response.statusCode = 404;
            response.end('{"message":"Not found"}');
            return;
          }
          response.setHeader('content-type', 'application/octet-stream');
          response.end(bytes);
          return;
        }
        if (request.method === 'POST') {
          uploads += 1;
          if (uploads === failUploadAt) {
            if (failAfterStorageWrite) objects.set(path, body);
            response.statusCode = 503;
            response.end('{"message":"Fault injected"}');
            return;
          }
          if (objects.has(path)) {
            response.statusCode = 409;
            response.end('{"message":"Already exists"}');
            return;
          }
          objects.set(path, body);
          response.end(JSON.stringify({ Key: path }));
          return;
        }
        if (request.method === 'DELETE') {
          const parsed = JSON.parse(body.toString('utf8')) as { prefixes: string[] };
          for (const prefix of parsed.prefixes) objects.delete(`${path}/${prefix}`);
          response.end('[]');
          return;
        }
        response.statusCode = 405;
        response.end('{}');
      })().catch(() => {
        response.statusCode = 500;
        response.end('{}');
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Endpoint TEST mancante');
    const config = new ConfigService({
      SUPABASE_URL: `http://127.0.0.1:${address.port}`,
      SUPABASE_SERVICE_ROLE_KEY: randomUUID(), // Credenziale effimera senza accesso ad alcun servizio esterno.
      PLATFORM_ADMIN_EMAILS: '',
    });
    const storage = new SupabaseService(config);
    exporter = new TenantBackupExportService(prisma as PrismaService, storage, config);
    importer = new TenantBackupImportService(
      prisma as PrismaService,
      storage,
      config,
      new PlatformAdminService(config),
      new AuthProfileCacheService(),
    );
  });

  beforeEach(async () => {
    failUploadAt = 0;
    uploads = 0;
    failAfterStorageWrite = false;
    objects.clear();
    const fixture = await creaDatasetCassa(prisma);
    const variant = await prisma.productVariant.findUniqueOrThrow({
      where: { id: fixture.variantId },
    });
    await prisma.attachment.create({
      data: {
        tenantId: IDS.tenantA,
        entityType: 'document',
        entityId: IDS.docA1,
        fileName: 'prova.pdf',
        mimeType: 'application/pdf',
        storagePath: attachmentPath,
        sizeBytes: 9,
        createdByName: 'TEST',
      },
    });
    await prisma.productImage.create({
      data: {
        tenantId: IDS.tenantA,
        productId: variant.productId,
        url: `http://storage.test/${imagePath}`,
        storagePath: imagePath,
      },
    });
    objects.set(
      originalKeys.find((key) => key.startsWith('document-'))!,
      Buffer.from('PDF TEST'),
    );
    objects.set(
      originalKeys.find((key) => key.startsWith('product-'))!,
      Buffer.from('WEBP TEST'),
    );
    archive = await readStreamToBuffer((await exporter.createExportStream(IDS.tenantA)).stream);
    state = await snapshot();
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    if (prisma) {
      await svuota(prisma);
      await prisma.$disconnect();
    }
  });

  async function snapshot() {
    return prisma.$transaction(async (tx) => {
      const data = await readTenantBackupData(tx, IDS.tenantA);
      for (const rows of Object.values(data))
        rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
      return JSON.stringify(data);
    });
  }

  it('esporta i byte reali e pubblica nuovi riferimenti solo dopo tutti gli upload', async () => {
    expect(await readZipEntry(archive, `attachments/document-attachments/${attachmentPath}`)).toBe(
      'PDF TEST',
    );
    const result = await importer.importFromZipBuffer(IDS.tenantA, IDS.utenteA1, archive);
    expect(result.attachmentFilesUploaded).toBe(2);
    const attachment = await prisma.attachment.findFirstOrThrow({
      where: { tenantId: IDS.tenantA },
    });
    expect(attachment.storagePath).toContain(`${IDS.tenantA}/restore/`);
    expect(objects.get(`document-attachments/${attachment.storagePath}`)?.toString()).toBe(
      'PDF TEST',
    );
    const image = await prisma.productImage.findFirstOrThrow({ where: { tenantId: IDS.tenantA } });
    expect(image.url).toContain(image.storagePath!);
    for (const key of originalKeys) expect(objects.has(key)).toBe(true);
    const again = await readStreamToBuffer((await exporter.createExportStream(IDS.tenantA)).stream);
    expect(
      await readZipEntry(again, `attachments/document-attachments/${attachment.storagePath}`),
    ).toBe('PDF TEST');
  });

  it.each([false, true])(
    'upload fallito (scrittura già riuscita: %s) mantiene DB e vecchi file',
    async (written) => {
      failUploadAt = 2;
      failAfterStorageWrite = written;
      await expect(
        importer.importFromZipBuffer(IDS.tenantA, IDS.utenteA1, archive),
      ).rejects.toThrow(/Upload allegato fallito/);
      expect(await snapshot()).toBe(state);
      expect([...objects.keys()].sort()).toEqual(originalKeys);
    },
  );

  it('un errore DB dopo gli upload annulla la sostituzione e rimuove soltanto i nuovi oggetti', async () => {
    const altered = await rewriteTenantBackupZip(archive, (files) => {
      const rows = JSON.parse(files.get('data/productVariants.json')!.toString()) as Record<
        string,
        unknown
      >[];
      rows[0]!['sellingPriceMinor'] = 'not-a-decimal';
      files.set('data/productVariants.json', Buffer.from(JSON.stringify(rows)));
    });
    await expect(
      importer.importFromZipBuffer(IDS.tenantA, IDS.utenteA1, altered),
    ).rejects.toThrow();
    expect(uploads).toBe(2);
    expect(await snapshot()).toBe(state);
    expect([...objects.keys()].sort()).toEqual(originalKeys);
  });

  it('rifiuta percorsi di un altro tenant prima di qualsiasi upload', async () => {
    const altered = await rewriteTenantBackupZip(archive, (files) => {
      const rows = JSON.parse(files.get('data/attachments.json')!.toString()) as Record<
        string,
        unknown
      >[];
      rows[0]!['storagePath'] = `${IDS.tenantB}/document/prova.pdf`;
      files.set('data/attachments.json', Buffer.from(JSON.stringify(rows)));
    });
    await expect(importer.importFromZipBuffer(IDS.tenantA, IDS.utenteA1, altered)).rejects.toThrow(
      /percorso allegato/,
    );
    expect(uploads).toBe(0);
    expect(await snapshot()).toBe(state);
  });

  it('rifiuta export incompleti e archivi senza i byte richiesti', async () => {
    objects.delete(originalKeys[0]!);
    await expect(exporter.createExportStream(IDS.tenantA)).rejects.toThrow(
      /allegato non è disponibile/,
    );
    const altered = await rewriteTenantBackupZip(archive, (files) => {
      files.delete(`attachments/document-attachments/${attachmentPath}`);
    });
    await expect(importer.importFromZipBuffer(IDS.tenantA, IDS.utenteA1, altered)).rejects.toThrow(
      /Allegati mancanti/,
    );
    expect(uploads).toBe(0);
    expect(await snapshot()).toBe(state);
  });
});
