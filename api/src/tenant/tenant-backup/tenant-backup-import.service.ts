import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';

import { Prisma, type User } from '@prisma/client';
import { AuthProfileCacheService } from '../../auth/auth-profile-cache.service';
import { SupabaseService } from '../../auth/supabase.service';
import { PlatformAdminService } from '../../common/platform-admin/platform-admin.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  isStoricoShopify,
  TENANT_BACKUP_DEFERRED_FIELDS,
  TENANT_BACKUP_IMPORT_ORDER,
  type TenantBackupEntityFile,
} from './tenant-backup.constants';
import {
  allineaCacheIncoerenti,
  PERMESSO_RIPRISTINO,
  soloAssenti,
  verificaStoricoRipristinabile,
  VINCOLI_DA_DIFFERIRE,
} from './tenant-backup-storico.util';
import type {
  TenantBackupImportResult,
  TenantBackupManifest,
} from './tenant-backup-manifest.model';
import {
  assertHistoricalReferenceTenants,
  backupDelegate,
  backupModel,
  purgeTenantBackupData,
  validateBackupReferences,
  validateInventoryCoherence,
  type BackupData,
  type BackupRow,
} from './tenant-backup-entities.util';
import { readTenantBackupArchive } from './tenant-backup-archive.util';
import { backupAttachmentRefs } from './tenant-backup-storage.util';

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
    private readonly profileCache: AuthProfileCacheService,
  ) {}

  async importFromZipBuffer(
    tenantId: string,
    currentUserId: string,
    zipBuffer: Buffer,
  ): Promise<TenantBackupImportResult> {
    const { manifest, data, attachments } = await readTenantBackupArchive(zipBuffer, tenantId);
    this.assertNoPlatformAdminEmails(data.users ?? []);
    validateBackupReferences(data, tenantId, currentUserId);
    // ⭐ I NUMERI, non solo la struttura: un archivio con una giacenza che non
    //    torna si rifiuta qui — prima della purga, prima degli upload, prima
    //    della transazione. Il tenant resta esattamente com'era.
    validateInventoryCoherence(data);
    const currentDbUser = await this.prisma.user.findFirstOrThrow({
      where: { id: currentUserId, tenantId },
    });
    const refs = backupAttachmentRefs(data, tenantId, this.config);
    const paths = new Set(refs.map((ref) => ref.zipPath));
    if (paths.size !== attachments.size || [...paths].some((path) => !attachments.has(path))) {
      throw new BadRequestException('Allegati mancanti o non referenziati nel backup.');
    }
    const client = this.supabase.getStorageClient();
    if (paths.size && !client)
      throw new ServiceUnavailableException('Storage non disponibile: ripristino annullato.');
    const uploaded: { bucket: string; path: string }[] = [];
    const stagedPaths = new Map<string, string>();
    const restoreId = randomUUID();
    const entityCounts: TenantBackupImportResult['entityCounts'] = {};
    try {
      // Nuovi oggetti immutabili: i file in uso non vengono sovrascritti. Il DB
      // pubblica i nuovi riferimenti soltanto quando tutti gli upload sono riusciti.
      for (const ref of refs) {
        let path = stagedPaths.get(ref.zipPath);
        if (!path) {
          path =
            tenantId +
            '/restore/' +
            restoreId +
            '/' +
            randomUUID() +
            '-' +
            ref.storagePath.split('/').at(-1)!;
          const bytes = await attachments.get(ref.zipPath)!.buffer();
          // Anche una risposta persa può seguire un upload riuscito: il path
          // appartiene a questo tentativo e va ripulito comunque nel catch.
          uploaded.push({ bucket: ref.bucket, path });
          const { error } = await client!.storage.from(ref.bucket).upload(path, bytes, {
            upsert: false,
            contentType: this.guessContentType(ref.storagePath),
          });
          if (error)
            throw new ServiceUnavailableException('Upload allegato fallito: ripristino annullato.');
          stagedPaths.set(ref.zipPath, path);
        }
        ref.row[ref.pathField] = path;
        if (ref.urlField)
          ref.row[ref.urlField] = client!.storage
            .from(ref.bucket)
            .getPublicUrl(path).data.publicUrl;
      }
      await this.prisma.$transaction(
        async (tx) => {
          // ⭐ Le due dichiarazioni che rendono possibile il ripristino con lo
          //    storico in piedi, e vivono ENTRAMBE solo in questa transazione.
          //
          //    1. Le quattro FK verso l'anagrafica si differiscono al commit:
          //       fra la purga e il reinserimento le righe di storico puntano
          //       a prodotti e sedi che in quell'istante non ci sono.
          //    2. Il permesso di riga, acceso PER QUESTO TENANT, senza il quale
          //       un'identita' gia' sganciata non potrebbe essere reinserita su
          //       un database vuoto.
          await tx.$executeRawUnsafe(
            `SET CONSTRAINTS ${VINCOLI_DA_DIFFERIRE.map((nome) => `"${nome}"`).join(', ')} DEFERRED`,
          );
          // ⚠️ `set_config(…, true)` = LOCAL: sparisce al commit e al rollback,
          //    e una connessione riusata dal pool non se lo porta dietro.
          await tx.$executeRawUnsafe(`SELECT set_config($1, $2, true)`, PERMESSO_RIPRISTINO, tenantId);

          await this.resolveGlobalReferences(tx, data, manifest);
          await assertHistoricalReferenceTenants(tx, data, tenantId);
          // ⛔ PRIMA della purga: un'incongruenza dello storico deve fermare il
          //    ripristino con una frase che la nomina, non con una violazione
          //    di chiave esterna al commit.
          const storicoPresente = await verificaStoricoRipristinabile(tx, data, tenantId);
          await purgeTenantBackupData(tx, tenantId, currentUserId);
          await this.importTenantProfile(tx, tenantId, data.tenant);
          const deferred: { key: TenantBackupEntityFile; id: unknown; values: BackupRow }[] = [];
          for (const key of TENANT_BACKUP_IMPORT_ORDER) {
            // ⭐ Lo storico si reinserisce SOLO PER ASSENZA: su un tenant vivo
            //    le righe ci sono gia' e non si toccano — comprese le esclusioni
            //    decise DOPO il backup, che un reinserimento sovrascriverebbe.
            //    Su un database vuoto non c'e' niente, e si reinserisce tutto.
            const rows = isStoricoShopify(key)
              ? soloAssenti(data[key] ?? [], storicoPresente.get(key))
              : (data[key] ?? []);
            // ⚠️ Il conteggio dichiara le righe EFFETTIVAMENTE inserite: dire
            //    «12 identita'» dopo averne saltate 12 sarebbe un resoconto falso.
            entityCounts[key] = rows.length;
            if (key === 'users') {
              await this.importUsers(tx, tenantId, currentDbUser, rows);
              continue;
            }
            if (!rows.length) continue;
            const prepared = rows.map((row) => {
              const values: BackupRow = {};
              const copy = { ...row };
              for (const field of TENANT_BACKUP_DEFERRED_FIELDS[key] ?? []) {
                if (copy[field] !== null && copy[field] !== undefined) {
                  values[field] = copy[field];
                  copy[field] = null;
                }
              }
              if (Object.keys(values).length) {
                if (row['updatedAt'] !== undefined) values['updatedAt'] = row['updatedAt'];
                deferred.push({ key, id: row['id'], values });
              }
              return copy;
            });
            await this.createEntityRows(tx, key, prepared, tenantId);
          }
          for (const row of deferred) {
            await backupDelegate(tx, row.key).updateMany({
              where: { id: row.id },
              data: row.values,
            });
          }
          // ── 26.7 · le cache incoerenti, dopo il reinserimento ──────────────
          //
          // ⭐ **Ultimo passo, e non a caso**: le colonne-cache si giudicano
          //    contro lo storico che c'è ADESSO — quello del database, più le
          //    righe appena reinserite per assenza. Farlo prima significherebbe
          //    giudicarle contro uno storico incompleto.
          const allineate = await allineaCacheIncoerenti(tx, tenantId);
          if (allineate.prodotti > 0 || allineate.varianti > 0) {
            this.logger.log(
              `Ripristino: cache Shopify allineate allo storico — ` +
                `${allineate.prodotti} prodotti, ${allineate.varianti} varianti.`,
            );
          }
        },
        { timeout: 300_000, maxWait: 30_000, isolationLevel: 'Serializable' },
      );
      this.profileCache.invalidateTenant(tenantId);
      return {
        tenantId,
        importedAt: new Date().toISOString(),
        entityCounts: { ...entityCounts, tenant: 1 },
        attachmentFilesUploaded: uploaded.length,
      };
    } catch (error) {
      for (const file of uploaded) {
        const removed = await client!.storage
          .from(file.bucket)
          .remove([file.path])
          .catch(() => null);
        if (!removed || removed.error)
          this.logger.error(
            'Pulizia allegato di restore fallito non riuscita: oggetto non referenziato.',
          );
      }
      throw error;
    }
  }

  private async resolveGlobalReferences(
    tx: PrismaTx,
    data: BackupData,
    manifest: TenantBackupManifest,
  ): Promise<void> {
    const groups = [
      {
        rows: data.vatCodes ?? [],
        field: 'natureId',
        catalog: await tx.vatNature.findMany(),
        references: manifest.globalReferences?.vatNatures,
        key: 'key',
      },
      {
        rows: data.paymentOptions ?? [],
        field: 'methodCodeId',
        catalog: await tx.paymentMethodCode.findMany(),
        references: manifest.globalReferences?.paymentMethodCodes,
        key: 'code',
      },
    ];
    for (const group of groups)
      for (const row of group.rows) {
        const id = row[group.field];
        if (id === null || id === undefined) continue;
        const reference = group.references?.find((item) => item.id === id) as BackupRow | undefined;
        const target = group.catalog.find((item) =>
          reference
            ? (item as unknown as BackupRow)[group.key] === reference[group.key]
            : item.id === id,
        );
        if (!target || (manifest.formatVersion >= 4 && !reference))
          throw new BadRequestException('Riferimento al catalogo globale non valido nel backup.');
        row[group.field] = target.id;
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
    const model = backupModel(key);
    const hasTenant = model.fields.some((field) => field.name === 'tenantId');
    const data = rows.map((row) => {
      const copy: BackupRow = {
        ...normalizzaCostiCanonici(row),
        ...(hasTenant ? { tenantId } : {}),
      };
      for (const field of model.fields) {
        if (field.kind === 'scalar' && field.type === 'Json' && copy[field.name] === null)
          copy[field.name] = Prisma.DbNull;
      }
      return copy;
    });
    await backupDelegate(tx, key).createMany({
      data: key === 'products' ? withBackfilledArticleCodes(data) : data,
    });
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
