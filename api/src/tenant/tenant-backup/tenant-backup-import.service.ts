import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import unzipper from 'unzipper';

import type { User } from '@prisma/client';
import { SupabaseService } from '../../auth/supabase.service';
import { PlatformAdminService } from '../../common/platform-admin/platform-admin.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  TENANT_BACKUP_ATTACHMENTS_DIR,
  TENANT_BACKUP_DATA_DIR,
  TENANT_BACKUP_DELETE_ORDER,
  TENANT_BACKUP_ENTITY_FILES,
  TENANT_BACKUP_FORMAT_VERSION,
  TENANT_BACKUP_IMPORT_ORDER,
  TENANT_BACKUP_MANIFEST_FILE,
  type TenantBackupEntityFile,
} from './tenant-backup.constants';
import type {
  TenantBackupImportResult,
  TenantBackupManifest,
} from './tenant-backup-manifest.model';
import { parseBackupRows } from './tenant-backup-serialize.util';

type PrismaTx = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

/**
 * Costi CANONICI: quelli che dal 22/08/2026 sono `NOT NULL DEFAULT 0`.
 *
 * ⚠️ L'elenco è per NOME di campo ed è deliberatamente stretto. I costi
 * opzionali della riga documento — `enteredUnitCost`, `unitCostNet`,
 * `unitCostGross`, `unitVatAmount` — non sono qui: restano nullable, perché su
 * una struttura condivisa da documenti che il costo non lo gestiscono affatto
 * l'assenza della proprietà ha un significato tecnico proprio.
 */
const COSTI_CANONICI = [
  'purchasePriceMinor',
  'lastPurchasePriceMinor',
  'unitCostMinor',
  'totalCostMinor',
] as const;

/**
 * Un backup **prodotto prima** della migration dei costi canonici porta `null`
 * dove oggi la colonna è `NOT NULL`: reinserirlo così com'è farebbe fallire il
 * ripristino con violazione di vincolo, e il cliente perderebbe l'unica strada
 * per rimettere in piedi i propri dati.
 *
 * ⛔ Non è una conversione di comodo: è la stessa regola di dominio applicata al
 * passato — un costo non valorizzato **vale zero** (`regole-gestionale`).
 *
 * Una chiave assente resta assente: la colonna ha il proprio `DEFAULT 0` e non
 * c'è ragione di inventarla nella riga.
 */
export function normalizzaCostiCanonici(row: Record<string, unknown>): Record<string, unknown> {
  let normalizzata: Record<string, unknown> | null = null;
  for (const campo of COSTI_CANONICI) {
    if (campo in row && row[campo] === null) {
      normalizzata ??= { ...row };
      normalizzata[campo] = 0;
    }
  }
  return normalizzata ?? row;
}

@Injectable()
export class TenantBackupImportService {
  private readonly logger = new Logger(TenantBackupImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
    private readonly platformAdmin: PlatformAdminService,
  ) {}

  async importFromZipBuffer(
    tenantId: string,
    currentUserId: string,
    zipBuffer: Buffer,
  ): Promise<TenantBackupImportResult> {
    const tempDir = join(tmpdir(), `vestiflow-tenant-import-${randomUUID()}`);
    await mkdir(tempDir, { recursive: true });

    try {
      await this.extractZip(zipBuffer, tempDir);
      const manifest = await this.readManifest(tempDir);
      this.assertManifestCompatible(manifest, tenantId);

      const entityData = await this.readEntityFiles(tempDir);
      const entityCounts: Partial<Record<TenantBackupEntityFile, number>> = {};

      const currentDbUser = await this.prisma.user.findFirstOrThrow({
        where: { id: currentUserId, tenantId },
      });

      await this.prisma.$transaction(
        async (tx) => {
          await this.purgeTenantData(tx, tenantId, currentUserId);
          await this.importTenantProfile(tx, tenantId, entityData.tenant);
          await this.importUsers(tx, tenantId, currentDbUser, entityData.users ?? []);

          for (const key of TENANT_BACKUP_IMPORT_ORDER) {
            if (key === 'users') {
              continue;
            }
            const rows = entityData[key] ?? [];
            entityCounts[key] = rows.length;
            if (rows.length === 0) {
              continue;
            }
            await this.createEntityRows(tx, key, rows, tenantId);
          }
        },
        { timeout: 300_000, maxWait: 30_000 },
      );

      const attachmentFilesUploaded = await this.restoreAttachments(tempDir, tenantId);

      return {
        tenantId,
        importedAt: new Date().toISOString(),
        entityCounts,
        attachmentFilesUploaded,
      };
    } finally {
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async extractZip(buffer: Buffer, targetDir: string): Promise<void> {
    const directory = await unzipper.Open.buffer(buffer);
    await directory.extract({ path: targetDir });
  }

  private async readManifest(tempDir: string): Promise<TenantBackupManifest> {
    const raw = await readFile(join(tempDir, TENANT_BACKUP_MANIFEST_FILE), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      throw new BadRequestException('Manifest backup non valido.');
    }
    return parsed as TenantBackupManifest;
  }

  private assertManifestCompatible(manifest: TenantBackupManifest, tenantId: string): void {
    if (manifest.formatVersion < TENANT_BACKUP_FORMAT_VERSION) {
      // ⭐ **Un archivio piu' VECCHIO dell'app non e' «aggiorna VestiFlow».**
      // Il messaggio unico diceva il contrario del vero nel caso piu'
      // frequente: l'app e' nuova, e' l'archivio a essere vecchio, e
      // aggiornare non serve a niente. Chi sta ripristinando ha gia' un
      // problema; mandarlo nella direzione sbagliata gli costa il tempo che
      // non ha.
      throw new BadRequestException(
        `Questo backup e' stato prodotto da una versione precedente di VestiFlow ` +
          `(formato ${manifest.formatVersion}, oggi ${TENANT_BACKUP_FORMAT_VERSION}) e non puo' ` +
          `essere ripristinato: nel frattempo sono cambiati dati che il pacchetto non porta ` +
          `nella forma attuale.`,
      );
    }
    if (manifest.formatVersion > TENANT_BACKUP_FORMAT_VERSION) {
      throw new BadRequestException(
        `Versione backup non supportata (${manifest.formatVersion}). Aggiorna VestiFlow.`,
      );
    }
    if (manifest.tenantId !== tenantId) {
      throw new ConflictException(
        'Il backup appartiene a un altro negozio. Importa solo pacchetti del tenant corrente.',
      );
    }
  }

  private async readEntityFiles(
    tempDir: string,
  ): Promise<Partial<Record<TenantBackupEntityFile, Record<string, unknown>[]>>> {
    const result: Partial<Record<TenantBackupEntityFile, Record<string, unknown>[]>> = {};

    for (const key of TENANT_BACKUP_ENTITY_FILES) {
      const filePath = join(tempDir, TENANT_BACKUP_DATA_DIR, `${key}.json`);
      try {
        const raw = await readFile(filePath, 'utf8');
        result[key] = parseBackupRows<Record<string, unknown>>(raw);
      } catch {
        result[key] = [];
      }
    }

    return result;
  }

  private async purgeTenantData(
    tx: PrismaTx,
    tenantId: string,
    preserveUserId: string,
  ): Promise<void> {
    await tx.shopifyOAuthState.deleteMany({ where: { tenantId } });
    await tx.tikTokOAuthState.deleteMany({ where: { tenantId } });

    for (const key of TENANT_BACKUP_DELETE_ORDER) {
      if (key === 'users') {
        await tx.user.deleteMany({ where: { tenantId, id: { not: preserveUserId } } });
        continue;
      }
      await this.deleteEntityRows(tx, key, tenantId);
    }
  }

  private async deleteEntityRows(
    tx: PrismaTx,
    key: TenantBackupEntityFile,
    tenantId: string,
  ): Promise<void> {
    switch (key) {
      case 'userStores':
        await tx.userStore.deleteMany({ where: { user: { tenantId } } });
        return;
      case 'inventoryCountLines':
        await tx.inventoryCountLine.deleteMany({ where: { session: { tenantId } } });
        return;
      case 'supplierOrderLines':
        await tx.supplierOrderLine.deleteMany({ where: { order: { tenantId } } });
        return;
      case 'salesOrderLines':
        await tx.salesOrderLine.deleteMany({ where: { order: { tenantId } } });
        return;
      case 'documentLines':
        await tx.documentLine.deleteMany({ where: { document: { tenantId } } });
        return;
      case 'companyProfile':
        await tx.companyProfile.deleteMany({ where: { tenantId } });
        return;
      case 'tenantFeatureSettings':
        await tx.tenantFeatureSettings.deleteMany({ where: { tenantId } });
        return;
      case 'shopifyConnections':
        await tx.shopifyConnection.deleteMany({ where: { tenantId } });
        return;
      case 'shopifyCredentials':
        await tx.shopifyCredential.deleteMany({ where: { tenantId } });
        return;
      case 'tiktokConnections':
        await tx.tikTokConnection.deleteMany({ where: { tenantId } });
        return;
      case 'tiktokCredentials':
        await tx.tikTokCredential.deleteMany({ where: { tenantId } });
        return;
      default:
        await this.deleteByTenantId(tx, key, tenantId);
    }
  }

  private async deleteByTenantId(
    tx: PrismaTx,
    key: TenantBackupEntityFile,
    tenantId: string,
  ): Promise<void> {
    switch (key) {
      case 'stores':
        await tx.store.deleteMany({ where: { tenantId } });
        return;
      case 'locations':
        await tx.location.deleteMany({ where: { tenantId } });
        return;
      case 'documentTypeSettings':
        await tx.documentTypeSetting.deleteMany({ where: { tenantId } });
        return;
      case 'vatCodes':
        await tx.vatCode.deleteMany({ where: { tenantId } });
        return;
      case 'documentSequences':
        await tx.documentSequence.deleteMany({ where: { tenantId } });
        return;
      case 'paymentOptions':
        await tx.paymentOption.deleteMany({ where: { tenantId } });
        return;
      case 'parties':
        await tx.party.deleteMany({ where: { tenantId } });
        return;
      case 'suppliers':
        await tx.supplier.deleteMany({ where: { tenantId } });
        return;
      case 'customers':
        await tx.customer.deleteMany({ where: { tenantId } });
        return;
      case 'products':
        await tx.product.deleteMany({ where: { tenantId } });
        return;
      case 'productVariants':
        await tx.productVariant.deleteMany({ where: { tenantId } });
        return;
      case 'productImages':
        await tx.productImage.deleteMany({ where: { tenantId } });
        return;
      case 'supplierVariantLinks':
        await tx.supplierVariantLink.deleteMany({ where: { tenantId } });
        return;
      case 'inventoryLevels':
        await tx.inventoryLevel.deleteMany({ where: { tenantId } });
        return;
      case 'inventoryLots':
        await tx.inventoryLot.deleteMany({ where: { tenantId } });
        return;
      case 'inventorySerials':
        await tx.inventorySerial.deleteMany({ where: { tenantId } });
        return;
      case 'stockMovements':
        await tx.stockMovement.deleteMany({ where: { tenantId } });
        return;
      case 'inventoryCountSessions':
        await tx.inventoryCountSession.deleteMany({ where: { tenantId } });
        return;
      case 'supplierOrders':
        await tx.supplierOrder.deleteMany({ where: { tenantId } });
        return;
      case 'salesOrders':
        await tx.salesOrder.deleteMany({ where: { tenantId } });
        return;
      case 'stockReservations':
        await tx.stockReservation.deleteMany({ where: { tenantId } });
        return;
      case 'stockReservationEvents':
        await tx.stockReservationEvent.deleteMany({ where: { tenantId } });
        return;
      case 'onlineOrderEvents':
        await tx.onlineOrderEvent.deleteMany({ where: { tenantId } });
        return;
      case 'documents':
        await tx.document.deleteMany({ where: { tenantId } });
        return;
      case 'documentRevisions':
        await tx.documentRevision.deleteMany({ where: { tenantId } });
        return;
      case 'documentAttachments':
        await tx.documentAttachment.deleteMany({ where: { tenantId } });
        return;
      case 'supplierAttachments':
        await tx.supplierAttachment.deleteMany({ where: { tenantId } });
        return;
      case 'userTableViewPreferences':
        await tx.userTableViewPreference.deleteMany({ where: { tenantId } });
        return;
      default:
        return;
    }
  }

  private async importTenantProfile(
    tx: PrismaTx,
    tenantId: string,
    rows: Record<string, unknown>[] | undefined,
  ): Promise<void> {
    const row = rows?.[0];
    if (!row) {
      return;
    }
    // Anagrafica e preferenze sì; NON i termini di contratto
    // (`licensedLocationCount`, i flag di sblocco sedi): quelli li decide
    // l'admin di piattaforma, e un file caricato dal cliente non li tocca.
    const allowed = [
      'name',
      'channelProfile',
      'legalName',
      'vatNumber',
      'fiscalCode',
      'phone',
      'pec',
      'sdiCode',
      'iban',
      'addressLine1',
      'addressLine2',
      'city',
      'province',
      'postalCode',
      'countryCode',
      'updatedAt',
    ] as const;
    const data: Record<string, unknown> = {};
    for (const key of allowed) {
      if (row[key] !== undefined) {
        data[key] = row[key];
      }
    }
    await tx.tenant.update({
      where: { id: tenantId },
      data: data as never,
    });
  }

  private async importUsers(
    tx: PrismaTx,
    tenantId: string,
    currentUser: User,
    rows: Record<string, unknown>[],
  ): Promise<void> {
    // Il file arriva dal cliente e può essere modificato prima di essere
    // ricaricato: nessun campo passa senza essere stato nominato qui (§sicurezza).
    this.assertNoPlatformAdminEmails(rows);

    const backupSelf = rows.find(
      (row) =>
        typeof row['authUserId'] === 'string' &&
        currentUser.authUserId &&
        row['authUserId'] === currentUser.authUserId,
    );
    const others = rows.filter(
      (row) =>
        typeof row['authUserId'] !== 'string' ||
        !currentUser.authUserId ||
        row['authUserId'] !== currentUser.authUserId,
    );

    if (others.length > 0) {
      await tx.user.createMany({
        data: others.map((row) => ({
          ...this.pickUserColumns(row),
          ...(typeof row['id'] === 'string' ? { id: row['id'] } : {}),
          ...(typeof row['authUserId'] === 'string' ? { authUserId: row['authUserId'] } : {}),
          ...(typeof row['email'] === 'string' ? { email: row['email'] } : {}),
          tenantId,
        })) as never[],
      });
    }

    if (backupSelf) {
      // Identità di chi importa: MAI dal file. `email` decide l'admin di
      // piattaforma (jwt-auth.guard) e `authUserId` lega il profilo a Supabase:
      // riscriverli dal backup permetterebbe a un titolare di elevarsi.
      await tx.user.update({
        where: { id: currentUser.id },
        data: {
          ...this.pickUserColumns(backupSelf),
          tenantId,
          id: currentUser.id,
          email: currentUser.email,
          authUserId: currentUser.authUserId,
        } as never,
      });
    }
  }

  /**
   * Campi di `User` ripristinabili da backup. L'elenco è esplicito per
   * costruzione: `id`, `tenantId`, `email` e `authUserId` non compaiono perché
   * sono identità, non dati di negozio, e vengono decisi dal chiamante.
   */
  private pickUserColumns(row: Record<string, unknown>): Record<string, unknown> {
    const allowed = [
      'displayName',
      'role',
      'avatarUrl',
      'avatarStoragePath',
      'isActive',
      'hasAllLocationsAccess',
      'defaultLocationId',
      'permissions',
      'mustChangePassword',
      'createdAt',
      'updatedAt',
    ] as const;
    const picked: Record<string, unknown> = {};
    for (const key of allowed) {
      if (row[key] !== undefined) {
        picked[key] = row[key];
      }
    }
    return picked;
  }

  /**
   * Un'email della lista PLATFORM_ADMIN_EMAILS in un backup di tenant è sempre
   * un tentativo di scalata: l'admin di piattaforma si riconosce dall'email del
   * profilo, e nessun cliente ha motivo di avere quella riga nei propri dati.
   */
  private assertNoPlatformAdminEmails(rows: Record<string, unknown>[]): void {
    const offending = rows.some(
      (row) => typeof row['email'] === 'string' && this.platformAdmin.isPlatformAdmin(row['email']),
    );
    if (offending) {
      this.logger.error(
        'Import backup rifiutato: il file contiene un utente con email di amministratore piattaforma.',
      );
      throw new BadRequestException(
        'Il backup contiene un utente non valido per questo negozio. Import annullato.',
      );
    }
  }

  private async createEntityRows(
    tx: PrismaTx,
    key: TenantBackupEntityFile,
    rows: Record<string, unknown>[],
    tenantId: string,
  ): Promise<void> {
    // Il file lo fornisce il cliente: se `tenantId` passasse così com'è, un
    // backup ritoccato scriverebbe righe dentro il negozio di un ALTRO cliente
    // (l'id altrui è visibile negli URL degli allegati). Si impone sempre.
    const data = rows.map((row) => ({ ...normalizzaCostiCanonici(row), tenantId })) as never[];
    switch (key) {
      case 'stores':
        await tx.store.createMany({ data });
        return;
      case 'locations':
        await tx.location.createMany({ data });
        return;
      case 'userStores':
        await tx.userStore.createMany({ data });
        return;
      case 'documentTypeSettings':
        await tx.documentTypeSetting.createMany({ data });
        return;
      case 'vatCodes':
        await tx.vatCode.createMany({ data });
        return;
      case 'companyProfile':
        await tx.companyProfile.createMany({ data });
        return;
      case 'tenantFeatureSettings':
        await tx.tenantFeatureSettings.createMany({ data });
        return;
      case 'documentSequences':
        await tx.documentSequence.createMany({ data });
        return;
      case 'paymentOptions':
        await tx.paymentOption.createMany({ data });
        return;
      case 'parties':
        await tx.party.createMany({ data });
        return;
      case 'suppliers':
        await tx.supplier.createMany({ data });
        return;
      case 'customers':
        await tx.customer.createMany({ data });
        return;
      case 'products':
        await tx.product.createMany({ data: withBackfilledArticleCodes(data) });
        return;
      case 'productVariants':
        await tx.productVariant.createMany({ data });
        return;
      case 'productImages':
        await tx.productImage.createMany({ data });
        return;
      case 'supplierVariantLinks':
        await tx.supplierVariantLink.createMany({ data });
        return;
      case 'inventoryLevels':
        await tx.inventoryLevel.createMany({ data });
        return;
      case 'inventoryLots':
        await tx.inventoryLot.createMany({ data });
        return;
      case 'inventorySerials':
        await tx.inventorySerial.createMany({ data });
        return;
      case 'stockMovements':
        await tx.stockMovement.createMany({ data });
        return;
      case 'inventoryCountSessions':
        await tx.inventoryCountSession.createMany({ data });
        return;
      case 'inventoryCountLines':
        await tx.inventoryCountLine.createMany({ data });
        return;
      case 'supplierOrders':
        await tx.supplierOrder.createMany({ data });
        return;
      case 'supplierOrderLines':
        await tx.supplierOrderLine.createMany({ data });
        return;
      case 'salesOrders':
        await tx.salesOrder.createMany({ data });
        return;
      case 'salesOrderLines':
        await tx.salesOrderLine.createMany({ data });
        return;
      case 'stockReservations':
        await tx.stockReservation.createMany({ data });
        return;
      case 'stockReservationEvents':
        await tx.stockReservationEvent.createMany({ data });
        return;
      case 'onlineOrderEvents':
        await tx.onlineOrderEvent.createMany({ data });
        return;
      case 'documents':
        await tx.document.createMany({ data });
        return;
      case 'documentLines':
        await tx.documentLine.createMany({ data });
        return;
      case 'documentRevisions':
        await tx.documentRevision.createMany({ data });
        return;
      case 'documentAttachments':
        await tx.documentAttachment.createMany({ data });
        return;
      case 'supplierAttachments':
        await tx.supplierAttachment.createMany({ data });
        return;
      case 'shopifyConnections':
        await tx.shopifyConnection.createMany({ data });
        return;
      case 'shopifyCredentials':
        await tx.shopifyCredential.createMany({ data });
        return;
      case 'tiktokConnections':
        await tx.tikTokConnection.createMany({ data });
        return;
      case 'tiktokCredentials':
        await tx.tikTokCredential.createMany({ data });
        return;
      case 'userTableViewPreferences':
        await tx.userTableViewPreference.createMany({ data });
        return;
      default:
        return;
    }
  }

  private async restoreAttachments(tempDir: string, tenantId: string): Promise<number> {
    const client = this.supabase.getStorageClient();
    if (!client) {
      return 0;
    }

    const attachmentsRoot = join(tempDir, TENANT_BACKUP_ATTACHMENTS_DIR);
    let uploaded = 0;

    const buckets = [
      this.config.get<string>('SUPABASE_PRODUCT_MEDIA_BUCKET') ?? 'product-media',
      this.config.get<string>('SUPABASE_DOCUMENT_ATTACHMENTS_BUCKET') ?? 'document-attachments',
      this.config.get<string>('SUPABASE_SUPPLIER_ATTACHMENTS_BUCKET') ?? 'supplier-attachments',
      this.config.get<string>('SUPABASE_USER_AVATARS_BUCKET') ?? 'user-avatars',
    ];

    for (const bucket of buckets) {
      const bucketDir = join(attachmentsRoot, bucket);
      try {
        uploaded += await this.uploadAttachmentTree(client, bucket, bucketDir, bucketDir, tenantId);
      } catch (error) {
        this.logger.warn(
          `Restore storage ${bucket}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    return uploaded;
  }

  private async uploadAttachmentTree(
    client: NonNullable<ReturnType<SupabaseService['getStorageClient']>>,
    bucket: string,
    bucketRootDir: string,
    currentDir: string,
    tenantId: string,
  ): Promise<number> {
    const { readdir, stat, readFile } = await import('node:fs/promises');
    let count = 0;

    let entries: string[];
    try {
      entries = await readdir(currentDir);
    } catch {
      return 0;
    }

    for (const entry of entries) {
      const fullPath = join(currentDir, entry);
      const info = await stat(fullPath);
      if (info.isDirectory()) {
        count += await this.uploadAttachmentTree(client, bucket, bucketRootDir, fullPath, tenantId);
        continue;
      }

      const objectPath = fullPath
        .slice(bucketRootDir.length + 1)
        .split(/[/\\]/)
        .join('/');

      // Ogni oggetto dello Storage vive sotto la cartella del proprio tenant
      // (vedi product-media/document-attachments/user-avatars). Con `upsert`
      // attivo, un percorso che punta altrove SOVRASCRIVE i file di un altro
      // cliente: si rifiuta, non si "corregge".
      if (objectPath !== `${tenantId}` && !objectPath.startsWith(`${tenantId}/`)) {
        this.logger.error(
          `Backup rifiutato per ${bucket}: percorso fuori dal negozio corrente (${objectPath}).`,
        );
        throw new BadRequestException(
          'Il backup contiene allegati che non appartengono a questo negozio. Import annullato.',
        );
      }

      const buffer = await readFile(fullPath);
      const { error } = await client.storage.from(bucket).upload(objectPath, buffer, {
        upsert: true,
        contentType: this.guessContentType(objectPath),
      });
      if (error) {
        this.logger.warn(`Upload ${bucket}/${objectPath}: ${error.message}`);
        continue;
      }
      count += 1;
    }

    return count;
  }

  private guessContentType(path: string): string {
    const lower = path.toLowerCase();
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.pdf')) return 'application/pdf';
    if (lower.endsWith('.xml')) return 'application/xml';
    return 'application/octet-stream';
  }
}

/**
 * Compatibilità backup pre-migrazione "Codice articolo": i pacchetti creati
 * prima dell'introduzione del campo non hanno `articleCode` (oggi NOT NULL).
 * Stessa regola della migrazione: progressivo per data di creazione, senza
 * toccare i codici presenti nel backup. Il purge del tenant è già avvenuto,
 * quindi i soli codici da evitare sono quelli dichiarati nel backup stesso.
 */
function withBackfilledArticleCodes(rows: Record<string, unknown>[]): never[] {
  const usedCodes = new Set<string>();
  for (const row of rows) {
    const code = typeof row['articleCode'] === 'string' ? row['articleCode'].trim() : '';
    if (code) {
      usedCodes.add(code.toLowerCase());
    }
  }

  const missing = rows
    .filter((row) => !(typeof row['articleCode'] === 'string' && row['articleCode'].trim()))
    .sort((a, b) => String(a['createdAt'] ?? '').localeCompare(String(b['createdAt'] ?? '')));

  let sequence = 0;
  for (const row of missing) {
    let candidate: string;
    do {
      sequence += 1;
      candidate = String(sequence).padStart(5, '0');
    } while (usedCodes.has(candidate));
    usedCodes.add(candidate);
    row['articleCode'] = candidate;
  }

  return rows as never[];
}
