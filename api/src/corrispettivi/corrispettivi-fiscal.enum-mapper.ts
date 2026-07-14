import {
  SalesOrderFiscalStatus as PrismaFiscal,
  SalesOrderFinancialStatus as PrismaFinancial,
} from '@prisma/client';

export const API_FISCAL_STATUS_VALUES = [
  'pending_registration',
  'delivered_to_accountant',
  'externally_registered',
  'excluded_pos_register',
  'invoiced',
] as const;

export function toPrismaFiscalStatus(status?: string): PrismaFiscal | undefined {
  switch (status) {
    case 'pending_registration':
      return PrismaFiscal.pending_registration;
    case 'delivered_to_accountant':
      return PrismaFiscal.delivered_to_accountant;
    case 'externally_registered':
      return PrismaFiscal.externally_registered;
    case 'excluded_pos_register':
      return PrismaFiscal.excluded_pos_register;
    case 'invoiced':
      return PrismaFiscal.invoiced;
    default:
      return undefined;
  }
}

export function fiscalStatusDisplayLabel(status: PrismaFiscal): string {
  switch (status) {
    case PrismaFiscal.delivered_to_accountant:
      return 'Consegnato al commercialista';
    case PrismaFiscal.externally_registered:
      return 'Registrato esternamente';
    case PrismaFiscal.excluded_pos_register:
      return 'Escluso (cassa/POS)';
    case PrismaFiscal.invoiced:
      return 'Fatturato';
    case PrismaFiscal.pending_registration:
    default:
      return 'Da registrare';
  }
}

export function isRefundFinancialStatus(status: PrismaFinancial): boolean {
  return (
    status === PrismaFinancial.refunded || status === PrismaFinancial.partially_refunded
  );
}
