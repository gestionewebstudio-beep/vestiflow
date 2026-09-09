import type { Prisma } from '@prisma/client';

import { purgeTenantBackupData } from '../tenant/tenant-backup/tenant-backup-entities.util';

/**
 * Il permesso di riga che ammette la cancellazione dello storico dei
 * collegamenti — e SOLO di quello del tenant indicato (docs/DA-FARE §10.2).
 *
 * ⛔ **Non e' un interruttore generale.** Il valore da impostare e'
 *    l'identificativo del tenant, e i trigger lo confrontano con
 *    `OLD.tenant_id`: a permesso acceso le righe di ogni ALTRO tenant restano
 *    protette. Non esiste un «accendi tutto».
 *
 * ⚠️ **`set_config(…, true)` = LOCAL**: sparisce al commit come al rollback, e
 *    una connessione riusata dal pool non se lo porta dietro.
 */
export const PERMESSO_CANCELLAZIONE_TENANT = 'vestiflow.cancellazione_tenant';

/**
 * Rimuove tutti i dati del tenant in ordine sicuro rispetto alle FK RESTRICT.
 *
 * ⭐ **Include lo STORICO dei collegamenti Shopify**, ed e' l'unica operazione
 *    che lo fa: il ripristino da backup non lo tocca mai (§10.1 S2). Le due
 *    chiavi che lo rendono possibile — il permesso di riga e l'ordine completo
 *    — stanno entrambe qui, e nessuna delle due basta da sola.
 *
 * ⚠️ **Deve girare nella transazione del chiamante**, che e' la stessa in cui
 *    si scrive la riuscita nel registro: e' l'invariante «tenant sparito ⇔ riga
 *    di riuscita presente» (§10.2).
 */
export async function deleteTenantData(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<void> {
  await tx.$executeRawUnsafe(
    `SELECT set_config($1, $2, true)`,
    PERMESSO_CANCELLAZIONE_TENANT,
    tenantId,
  );
  await tx.supportSession.deleteMany({ where: { targetTenantId: tenantId } });
  await purgeTenantBackupData(tx, tenantId, undefined, { includiStorico: true });
  await tx.tenant.delete({ where: { id: tenantId } });
}
