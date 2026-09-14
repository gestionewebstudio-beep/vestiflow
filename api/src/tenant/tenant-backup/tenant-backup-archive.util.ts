import { BadRequestException, ConflictException } from '@nestjs/common';
import unzipper from 'unzipper';

import {
  TENANT_BACKUP_ENTITY_FILES,
  TENANT_BACKUP_FORMAT_VERSION,
  TENANT_BACKUP_MIN_FORMAT_VERSION,
  tenantBackupFileAttesi,
} from './tenant-backup.constants';
import type { BackupData } from './tenant-backup-entities.util';
import type { TenantBackupManifest } from './tenant-backup-manifest.model';
import { parseBackupRows } from './tenant-backup-serialize.util';

/** Nessuna estrazione sul filesystem: nomi duplicati, traversal e archivi parziali si rifiutano. */
export async function readTenantBackupArchive(buffer: Buffer, tenantId: string) {
  let directory: Awaited<ReturnType<typeof unzipper.Open.buffer>>;
  try {
    directory = await unzipper.Open.buffer(buffer);
  } catch {
    throw new BadRequestException('Archivio ZIP non valido.');
  }
  const entries = new Map<string, (typeof directory.files)[number]>();
  let size = 0;
  for (const entry of directory.files) {
    const path = entry.path;
    if (entry.type === 'Directory') continue;
    size += entry.uncompressedSize;
    if (
      entries.size >= 100_000 ||
      size > 1024 * 1024 * 1024 ||
      entries.has(path) ||
      path.includes('\\') ||
      path.includes(':') ||
      path.split('/').some((part) => !part || part === '.' || part === '..')
    ) {
      throw new BadRequestException(
        'Archivio ZIP con percorsi, dimensioni o file duplicati non validi.',
      );
    }
    entries.set(path, entry);
  }
  let manifest: TenantBackupManifest;
  try {
    const entry = entries.get('manifest.json');
    if (!entry) throw new Error('manifest');
    const raw: unknown = JSON.parse((await entry.buffer()).toString('utf8'));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('manifest');
    manifest = raw as TenantBackupManifest;
  } catch {
    throw new BadRequestException('Manifest backup non valido.');
  }
  if (
    !Number.isInteger(manifest.formatVersion) ||
    manifest.product !== 'vestiflow' ||
    !manifest.entityCounts ||
    typeof manifest.entityCounts !== 'object' ||
    !Number.isInteger(manifest.attachmentFiles) ||
    manifest.attachmentFiles < 0
  ) {
    throw new BadRequestException('Manifest backup non valido.');
  }
  if (manifest.formatVersion < TENANT_BACKUP_MIN_FORMAT_VERSION) {
    throw new BadRequestException(
      'Questo backup è stato prodotto da una versione precedente di VestiFlow e richiede la conversione del formato.',
    );
  }
  if (manifest.formatVersion > TENANT_BACKUP_FORMAT_VERSION) {
    throw new BadRequestException(
      `Versione backup non supportata (${manifest.formatVersion}). Aggiorna VestiFlow.`,
    );
  }
  if (manifest.tenantId !== tenantId)
    throw new ConflictException('Il backup appartiene a un altro negozio.');
  if (manifest.globalReferences !== undefined) {
    const refs = manifest.globalReferences;
    for (const [rows, key] of [
      [refs?.vatNatures, 'key'],
      [refs?.paymentMethodCodes, 'code'],
    ] as const) {
      if (
        !Array.isArray(rows) ||
        rows.some(
          (row) =>
            !row ||
            typeof row !== 'object' ||
            typeof row.id !== 'string' ||
            typeof (row as Record<string, unknown>)[key] !== 'string',
        ) ||
        new Set(rows.map((row) => row.id)).size !== rows.length
      ) {
        throw new BadRequestException('Riferimenti ai cataloghi non validi nel manifest.');
      }
    }
  }
  // ⭐ UNA sola fonte per i due cancelli: il file richiesto e il conteggio
  //    richiesto. Erano due condizioni scritte a mano, e un archivio v4
  //    inciampava in entrambe non appena il formato cresceva (08/09/2026).
  const attesi = new Set(tenantBackupFileAttesi(manifest.formatVersion));
  const data: BackupData = {};
  for (const key of TENANT_BACKUP_ENTITY_FILES) {
    const entry = entries.get(`data/${key}.json`);
    if (!entry && attesi.has(key)) throw new BadRequestException(`File backup mancante: ${key}.`);
    try {
      data[key] = entry ? parseBackupRows((await entry.buffer()).toString('utf8')) : [];
    } catch {
      throw new BadRequestException(`File backup non valido: ${key}.`);
    }
    const expected = manifest.entityCounts[key];
    if (
      // ⛔ Il conteggio si pretende solo per i file che QUELLA versione doveva
      //    contenere: un v4 non ha `entityCounts.shopifyShops`, e pretenderlo
      //    rifiutava un archivio perfettamente valido.
      (manifest.formatVersion >= 4 && attesi.has(key) && expected === undefined) ||
      (expected !== undefined && expected !== data[key]!.length)
    ) {
      throw new BadRequestException(`Conteggio backup non coerente: ${key}.`);
    }
  }
  if (data.tenant?.length !== 1)
    throw new BadRequestException('Anagrafica tenant mancante o duplicata nel backup.');
  const allowed = new Set([
    'manifest.json',
    ...TENANT_BACKUP_ENTITY_FILES.map((key) => `data/${key}.json`),
  ]);
  const attachments = new Map<string, (typeof directory.files)[number]>();
  for (const [path, entry] of entries) {
    if (allowed.has(path)) continue;
    if (!path.startsWith('attachments/'))
      throw new BadRequestException('File non previsto nel backup.');
    attachments.set(path, entry);
  }
  if (attachments.size !== manifest.attachmentFiles)
    throw new BadRequestException('Allegati mancanti o conteggio non valido nel backup.');
  return { manifest, data, attachments };
}
