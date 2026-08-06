import { ZipArchive } from 'archiver';
import type { Readable } from 'node:stream';
import { PassThrough } from 'node:stream';
import unzipper from 'unzipper';

import {
  TENANT_BACKUP_DATA_DIR,
  TENANT_BACKUP_ENTITY_FILES,
  TENANT_BACKUP_FORMAT_VERSION,
  TENANT_BACKUP_MANIFEST_FILE,
  type TenantBackupEntityFile,
} from '../../tenant/tenant-backup/tenant-backup.constants';
import type { TenantBackupManifest } from '../../tenant/tenant-backup/tenant-backup-manifest.model';
import { serializeBackupRows } from '../../tenant/tenant-backup/tenant-backup-serialize.util';

export function minimalTenantBackupManifest(
  overrides: Partial<TenantBackupManifest> = {},
): TenantBackupManifest {
  return {
    formatVersion: TENANT_BACKUP_FORMAT_VERSION,
    product: 'vestiflow',
    exportedAt: '2026-01-01T00:00:00.000Z',
    tenantId: 'tenant-1',
    tenantName: 'Test Tenant',
    entityCounts: {},
    attachmentFiles: 0,
    notes: ['Test backup'],
    ...overrides,
  };
}

export async function buildTenantBackupZip(options: {
  manifest?: Partial<TenantBackupManifest>;
  manifestRaw?: string;
  entities?: Partial<Record<TenantBackupEntityFile, unknown[]>>;
} = {}): Promise<Buffer> {
  const manifest = minimalTenantBackupManifest(options.manifest);
  const entities = options.entities ?? {};
  const manifestContent =
    options.manifestRaw ?? `${JSON.stringify({ ...manifest, ...options.manifest }, null, 2)}\n`;

  const archive = new ZipArchive({ zlib: { level: 1 } });
  const output = new PassThrough();

  const bufferPromise = new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    output.on('data', (chunk: Buffer) => chunks.push(chunk));
    output.on('end', () => resolve(Buffer.concat(chunks)));
    output.on('error', reject);
    archive.on('error', reject);
  });

  archive.pipe(output);
  archive.append(manifestContent, { name: TENANT_BACKUP_MANIFEST_FILE });

  for (const key of TENANT_BACKUP_ENTITY_FILES) {
    const rows = entities[key] ?? [];
    archive.append(serializeBackupRows(rows), {
      name: `${TENANT_BACKUP_DATA_DIR}/${key}.json`,
    });
  }

  await archive.finalize();
  return bufferPromise;
}

export async function readStreamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function readZipEntry(buffer: Buffer, entryPath: string): Promise<string> {
  const directory = await unzipper.Open.buffer(buffer);
  const entry = directory.files.find((file) => file.path === entryPath);
  if (!entry) {
    throw new Error(`Entry ZIP mancante: ${entryPath}`);
  }
  return (await entry.buffer()).toString('utf8');
}

export async function readZipManifest(buffer: Buffer): Promise<TenantBackupManifest> {
  const raw = await readZipEntry(buffer, TENANT_BACKUP_MANIFEST_FILE);
  return JSON.parse(raw) as TenantBackupManifest;
}
