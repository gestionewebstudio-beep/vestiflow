import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import {
  TENANT_BACKUP_DEFERRED_FIELDS,
  TENANT_BACKUP_DELETE_ORDER,
  TENANT_BACKUP_DELETE_ORDER_COMPLETO,
  TENANT_BACKUP_ENTITY_FILES,
  TENANT_BACKUP_MODELS,
  type TenantBackupEntityFile,
} from './tenant-backup.constants';

export type BackupRow = Record<string, unknown>;
export type BackupData = Partial<Record<TenantBackupEntityFile, BackupRow[]>>;
type BackupDelegate = {
  findMany(args: { where?: BackupRow }): Promise<BackupRow[]>;
  createMany(args: { data: BackupRow[] }): Promise<unknown>;
  updateMany(args: { where: BackupRow; data: BackupRow }): Promise<unknown>;
  deleteMany(args: { where: BackupRow }): Promise<unknown>;
};

/** Il nome proviene solo dal registro compilato, mai dal pacchetto caricato. */
export function backupDelegate(
  tx: Prisma.TransactionClient,
  key: TenantBackupEntityFile,
): BackupDelegate {
  const model = TENANT_BACKUP_MODELS[key];
  const name = `${model[0]!.toLowerCase()}${model.slice(1)}`;
  return (tx as unknown as Record<string, BackupDelegate>)[name]!;
}

export function backupModel(key: TenantBackupEntityFile) {
  return Prisma.dmmf.datamodel.models.find((model) => model.name === TENANT_BACKUP_MODELS[key])!;
}

export function backupTenantWhere(key: TenantBackupEntityFile, tenantId: string): BackupRow {
  switch (key) {
    case 'tenant':
      return { id: tenantId };
    case 'userStores':
      return { user: { tenantId } };
    case 'supplierOrderLines':
    case 'salesOrderLines':
      return { order: { tenantId } };
    case 'salesOrderRefundTaxLines':
      return { refund: { tenantId } };
    case 'manualReceiptLines':
      return { receipt: { tenantId } };
    default:
      return { tenantId };
  }
}

export async function readTenantBackupData(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<BackupData> {
  const data: BackupData = {};
  for (const key of TENANT_BACKUP_ENTITY_FILES) {
    data[key] = await backupDelegate(tx, key).findMany({ where: backupTenantWhere(key, tenantId) });
  }
  return data;
}

/** Identità e FK si verificano prima del purge: imporre tenantId non basta. */
export function validateBackupReferences(
  data: BackupData,
  tenantId: string,
  preservedUserId?: string,
): void {
  const ids = new Map<string, Set<unknown>>();
  for (const key of TENANT_BACKUP_ENTITY_FILES) {
    const model = backupModel(key);
    const fields = new Set(
      model.fields.filter((field) => field.kind !== 'object').map((field) => field.name),
    );
    const modelIds = new Set<unknown>();
    ids.set(model.name, modelIds);
    for (const row of data[key] ?? []) {
      if (
        !row ||
        typeof row !== 'object' ||
        Array.isArray(row) ||
        Object.keys(row).some((field) => !fields.has(field))
      ) {
        throw new BadRequestException(`Riga non valida nel backup: ${key}.`);
      }
      if ('tenantId' in row && row['tenantId'] !== tenantId) {
        throw new BadRequestException(`Riga di un altro negozio nel backup: ${key}.`);
      }
      if (key === 'tenant' && row['id'] !== tenantId) {
        throw new BadRequestException('Identità del negozio non valida nel backup.');
      }
      if (row['id'] !== undefined) {
        if (modelIds.has(row['id']))
          throw new BadRequestException(`Identità duplicata nel backup: ${key}.`);
        modelIds.add(row['id']);
      }
    }
  }
  ids.set('Tenant', new Set([tenantId]));
  if (preservedUserId) ids.get('User')!.add(preservedUserId);
  for (const key of TENANT_BACKUP_ENTITY_FILES) {
    for (const relation of backupModel(key).fields.filter(
      (field) => field.kind === 'object' && field.relationFromFields?.length,
    )) {
      if (relation.type === 'VatNature' || relation.type === 'PaymentMethodCode') continue;
      const field = relation.relationFromFields![0]!;
      for (const row of data[key] ?? []) {
        const value = row[field];
        if (value !== null && value !== undefined && !ids.get(relation.type)?.has(value)) {
          throw new BadRequestException(
            `Riferimento assente o di un altro negozio: ${key}.${field}.`,
          );
        }
      }
    }
  }
  const sessions = new Map((data.cashSessions ?? []).map((row) => [row['id'], row]));
  const documents = new Map((data.documents ?? []).map((row) => [row['id'], row]));
  const lines = new Map((data.documentLines ?? []).map((row) => [row['id'], row]));
  const payments = new Map((data.storeSalePayments ?? []).map((row) => [row['id'], row]));
  for (const row of [...(data.documents ?? []), ...(data.cashSessionDeviceChanges ?? [])]) {
    const sessionId = row['cashSessionId'] ?? row['sessionId'];
    if (sessionId && sessions.get(sessionId)?.['locationId'] !== row['locationId']) {
      throw new BadRequestException('Sessione Cassa e sede non coerenti nel backup.');
    }
  }
  for (const row of data.documentLines ?? []) {
    const parent = documents.get(row['documentId']);
    if (
      parent?.['cashSessionId'] &&
      parent['type'] === 'store_return' &&
      lines.get(row['returnedFromLineId'])?.['documentId'] !== parent['sourceDocumentId']
    ) {
      throw new BadRequestException('Origine della riga di reso Cassa non coerente nel backup.');
    }
  }
  for (const row of data.storeSalePayments ?? []) {
    const parent = documents.get(row['documentId']);
    if (
      parent?.['cashSessionId'] &&
      parent['type'] === 'store_return' &&
      payments.get(row['refundedFromPaymentId'])?.['documentId'] !== parent['sourceDocumentId']
    ) {
      throw new BadRequestException('Origine del rimborso Cassa non coerente nel backup.');
    }
  }
  for (const row of data.creationIntents ?? []) {
    // Il registro mantiene anche gli esiti cancellati della Vendita al banco:
    // il replay deve continuare a rispondere "result vanished", non ricreare.
    if (!['store_sale', 'store_return'].includes(String(row['scope']))) {
      throw new BadRequestException('Ambito intento non supportato nel backup.');
    }
  }
  for (const row of data.attachments ?? []) {
    const type =
      row['entityType'] === 'document'
        ? 'Document'
        : row['entityType'] === 'sales_order'
          ? 'SalesOrder'
          : null;
    if (!type || !ids.get(type)?.has(row['entityId'])) {
      throw new BadRequestException('Riferimento allegato non valido nel backup.');
    }
  }
}

/**
 * Le righe di giacenza dell'archivio devono tornare: `available = onHand − committed`.
 *
 * ⛔ **Il ripristino è un percorso applicativo, e il pacchetto arriva dal
 *    cliente.** Fino al 09/09/2026 il cancello guardava la STRUTTURA — campi
 *    sconosciuti, righe di un altro negozio, identità duplicate — e non i
 *    NUMERI: una riga `{"onHand": 5}` senza `available` passava e nasceva con
 *    lo zero di schema, cioè con l'invariante rotta e in silenzio. Non si può
 *    dichiarare l'invariante protetto dai percorsi applicativi e poi accettare
 *    un archivio che lo viola.
 *
 * ⭐ **Si esegue PRIMA della purga e di ogni scrittura**, come tutta la
 *    validazione: un archivio incoerente lascia il tenant esattamente com'era.
 *
 * ⛔ **Non ricalcola, non azzera, non corregge.** Un archivio che non torna si
 *    rifiuta. «Sistemarlo» significherebbe decidere quale dei tre numeri è
 *    quello vero, e nessuno può saperlo dall'esterno: il Disponibile sbagliato
 *    e la Giacenza sbagliata hanno la stessa faccia.
 *
 * ⚠️ **Il messaggio nomina variante e sede**, e i numeri: chi lo legge deve
 *    poter aprire il file e guardare la riga giusta. Si nominano le prime tre —
 *    un elenco di mille righe non è un messaggio d'errore — e il totale c'è.
 *
 * ⚠️ **Nessuna regola di conversione fra i formati**: `inventoryLevels` esiste
 *    dal v3 con la stessa forma (`TENANT_BACKUP_V3_ENTITY_FILES`) e l'export
 *    scrive sempre tutti gli scalari, quindi il cancello non chiede niente che
 *    un archivio legittimo più vecchio non abbia già.
 */
export function validateInventoryCoherence(data: BackupData): void {
  const rotte: string[] = [];
  for (const row of data.inventoryLevels ?? []) {
    const dove = `variante ${String(row['variantId'] ?? '?')} @ sede ${String(row['locationId'] ?? '?')}`;
    const numeri = ['onHand', 'committed', 'available'].map((campo) => row[campo]);
    if (!numeri.every((value) => typeof value === 'number' && Number.isInteger(value))) {
      rotte.push(`${dove}: Giacenza, Impegnata o Disponibile assenti o non interi`);
      continue;
    }
    const [onHand, committed, available] = numeri as [number, number, number];
    if (available !== onHand - committed) {
      rotte.push(
        `${dove}: Disponibile ${available}, atteso ${onHand - committed} ` +
          `(Giacenza ${onHand} − Impegnata ${committed})`,
      );
    }
  }
  if (rotte.length > 0) {
    throw new BadRequestException(
      `Giacenze incoerenti nel backup (${rotte.length}): ${rotte.slice(0, 3).join('; ')}` +
        `${rotte.length > 3 ? '; …' : ''}. Il Disponibile deve valere Giacenza − Impegnata. ` +
        'Ripristino annullato: nessun dato è stato modificato.',
    );
  }
}

/** Questi riferimenti storici non hanno FK: l'assenza è lecita, il tenant altrui no. */
export async function assertHistoricalReferenceTenants(
  tx: Prisma.TransactionClient,
  data: BackupData,
  tenantId: string,
): Promise<void> {
  const groups: readonly [TenantBackupEntityFile, readonly string[]][] = [
    ['users', ['createdById', 'changedById', 'openedById', 'closedById', 'deletedById']],
    ['documents', ['sourceDocumentId', 'resultRef']],
    ['documentLines', ['sourceLineId']],
    ['productVariants', ['variantId']],
    ['parties', ['partyId']],
    ['salesOrderLines', ['salesOrderLineId']],
    ['stockReservations', ['reservationId']],
    ['locations', ['locationId', 'targetLocationId']],
  ];
  for (const [target, fields] of groups) {
    const ids = new Set<unknown>();
    for (const rows of Object.values(data))
      for (const row of rows)
        for (const field of fields) {
          if (row[field] !== null && row[field] !== undefined) ids.add(row[field]);
        }
    if (!ids.size) continue;
    const foreign = await backupDelegate(tx, target).findMany({
      where: {
        id: { in: [...ids] },
        NOT: backupTenantWhere(target, tenantId),
      },
    });
    if (foreign.length)
      throw new BadRequestException('Riferimento storico a un altro negozio nel backup.');
  }
}

/** Nessun CASCADE/SET NULL deve modificare righe di un altro tenant corrotte a monte. */
export async function assertNoIncomingTenantReferences(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<void> {
  const data = await readTenantBackupData(tx, tenantId);
  const idsByModel = new Map(
    TENANT_BACKUP_ENTITY_FILES.map((key) => [
      TENANT_BACKUP_MODELS[key] as string,
      (data[key] ?? []).map((row) => row['id']).filter((id) => id !== undefined),
    ]),
  );
  for (const key of TENANT_BACKUP_ENTITY_FILES) {
    for (const relation of backupModel(key).fields.filter(
      (field) => field.kind === 'object' && field.relationFromFields?.length,
    )) {
      if (relation.type === 'Tenant') continue;
      const ids = idsByModel.get(relation.type);
      if (!ids?.length) continue;
      const foreign = await backupDelegate(tx, key).findMany({
        where: {
          [relation.relationFromFields![0]!]: { in: ids },
          NOT: backupTenantWhere(key, tenantId),
        },
      });
      if (foreign.length)
        throw new ConflictException('Riferimenti tra negozi non coerenti: operazione annullata.');
    }
  }
}

/** Primitive condivisa da restore e cancellazione amministrativa, sempre nella transazione del chiamante. */
export async function purgeTenantBackupData(
  tx: Prisma.TransactionClient,
  tenantId: string,
  preserveUserId?: string,
  /**
   * ⛔ **`includiStorico` lo passa SOLO la cancellazione del tenant.** Per il
   *    ripristino lo storico non si tocca (§10.1 S2): passarlo li' vorrebbe
   *    dire cancellare la storia dei collegamenti a ogni ripristino, che e' il
   *    difetto che l'ordine ridotto esiste per impedire.
   *
   * ⚠️ Da solo non basta comunque: senza il permesso di riga acceso, i trigger
   *    rifiutano lo stesso. Sono due chiavi, e servono entrambe.
   */
  opzioni?: { readonly includiStorico?: boolean },
): Promise<void> {
  await assertNoIncomingTenantReferences(tx, tenantId);
  await tx.shopifyOAuthState.deleteMany({ where: { tenantId } });
  await tx.tikTokOAuthState.deleteMany({ where: { tenantId } });
  // Spezza esclusivamente i cicli delle righe che stanno per essere rimosse.
  // Nel restore ogni riferimento originale viene reinserito prima del commit.
  for (const [key, fields] of Object.entries(TENANT_BACKUP_DEFERRED_FIELDS)) {
    const entity = key as TenantBackupEntityFile;
    await backupDelegate(tx, entity).updateMany({
      where: backupTenantWhere(entity, tenantId),
      data: Object.fromEntries(fields.map((field) => [field, null])),
    });
  }
  const ordine = opzioni?.includiStorico
    ? TENANT_BACKUP_DELETE_ORDER_COMPLETO
    : TENANT_BACKUP_DELETE_ORDER;
  for (const key of ordine) {
    await backupDelegate(tx, key).deleteMany({
      where: {
        ...backupTenantWhere(key, tenantId),
        ...(key === 'users' && preserveUserId ? { id: { not: preserveUserId } } : {}),
      },
    });
  }
}
