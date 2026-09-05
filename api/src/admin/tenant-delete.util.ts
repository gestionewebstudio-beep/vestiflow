import type { Prisma } from '@prisma/client';

import { purgeTenantBackupData } from '../tenant/tenant-backup/tenant-backup-entities.util';

/** Rimuove tutti i dati del tenant in ordine sicuro rispetto alle FK RESTRICT. */
export async function deleteTenantData(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<void> {
  await tx.supportSession.deleteMany({ where: { targetTenantId: tenantId } });
  await purgeTenantBackupData(tx, tenantId);
  await tx.tenant.delete({ where: { id: tenantId } });
}
