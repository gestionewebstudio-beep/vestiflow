import { SalesOrderFinancialStatus as PrismaFinancial } from '@prisma/client';

/**
 * ⚠️ Questo file conteneva la mappatura di `SalesOrderFiscalStatus`, rimosso il
 * 16/08/2026 con tutto il modello: il Registro Corrispettivi classifica per
 * **origine** (`source`), che è un fatto della vendita, non per uno stato
 * fiscale parallelo che qualcuno doveva ricordarsi di aggiornare.
 */
export function isRefundFinancialStatus(status: PrismaFinancial): boolean {
  return status === PrismaFinancial.refunded || status === PrismaFinancial.partially_refunded;
}
