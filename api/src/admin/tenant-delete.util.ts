import type { Prisma } from '@prisma/client';

/** Rimuove tutti i dati del tenant in ordine sicuro rispetto alle FK RESTRICT. */
export async function deleteTenantData(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<void> {
  await tx.inventoryCountLine.deleteMany({ where: { tenantId } });
  await tx.inventoryCountSession.deleteMany({ where: { tenantId } });
  await tx.supplierOrder.deleteMany({ where: { tenantId } });
  await tx.salesOrder.deleteMany({ where: { tenantId } });
  await tx.stockMovement.deleteMany({ where: { tenantId } });
  await tx.inventoryLevel.deleteMany({ where: { tenantId } });
  await tx.productImage.deleteMany({ where: { tenantId } });
  await tx.productVariant.deleteMany({ where: { tenantId } });
  await tx.product.deleteMany({ where: { tenantId } });
  await tx.user.deleteMany({ where: { tenantId } });
  await tx.location.deleteMany({ where: { tenantId } });
  await tx.store.deleteMany({ where: { tenantId } });
  await tx.customer.deleteMany({ where: { tenantId } });
  await tx.supplier.deleteMany({ where: { tenantId } });
  await tx.party.deleteMany({ where: { tenantId } });
  await tx.paymentOption.deleteMany({ where: { tenantId } });
  await tx.shopifyCredential.deleteMany({ where: { tenantId } });
  await tx.shopifyOAuthState.deleteMany({ where: { tenantId } });
  await tx.shopifyConnection.deleteMany({ where: { tenantId } });
  await tx.tikTokCredential.deleteMany({ where: { tenantId } });
  await tx.tikTokOAuthState.deleteMany({ where: { tenantId } });
  await tx.tikTokConnection.deleteMany({ where: { tenantId } });
  await tx.tenant.delete({ where: { id: tenantId } });
}
