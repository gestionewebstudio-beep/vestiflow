import {
  SalesOrderFiscalStatus as PrismaFiscal,
  SalesOrderFinancialStatus as PrismaFinancial,
} from '@prisma/client';

/**
 * Stati fiscali che l'applicazione accetta ancora in ingresso (16/08/2026).
 *
 * `delivered_to_accountant` ed `externally_registered` NON sono più qui: erano
 * il vecchio flusso «consegnato / registrato dal commercialista», ritirato per
 * decisione esplicita. VestiFlow non tiene traccia di cosa è già stato mandato:
 * l'operatore sceglie un periodo e stampa o esporta, quante volte vuole, e
 * l'export non cambia nessuno stato.
 *
 * `pending_registration` resta perché è il **default della colonna** e lo
 * portano tutte le vendite esistenti — ma non è più uno stato che l'operatore
 * sceglie o vede come passo di un flusso: significa soltanto «nessuna
 * classificazione fiscale».
 *
 * ⚠️ Gli altri due sono **classificazioni**, non passaggi di consegna, e per
 * questo sopravvivono. Misurato però il 16/08: oggi nessuno dei due **esclude**
 * davvero una vendita dal registro — `excluded_pos_register` lo scrive la sync
 * Shopify sugli ordini POS e nessuno lo rilegge come regola, `invoiced` non lo
 * scrive nessuno. Il doppio conteggio di una vendita fatturata è impedito
 * altrove: da `CorrispettivoEntry.excludedFromSummary` e dallo stato
 * `excluded_invoiced`, che stanno su un'altra tabella e non c'entrano con
 * questo enum.
 */
export const API_FISCAL_STATUS_VALUES = [
  'pending_registration',
  'excluded_pos_register',
  'invoiced',
] as const;

export function toPrismaFiscalStatus(status?: string): PrismaFiscal | undefined {
  switch (status) {
    case 'pending_registration':
      return PrismaFiscal.pending_registration;
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
    case PrismaFiscal.excluded_pos_register:
      return 'Escluso (cassa/POS)';
    case PrismaFiscal.invoiced:
      return 'Fatturato';
    // I due stati del vecchio flusso di consegna restano nel tipo Prisma finché
    // la colonna esiste: nessuna vendita li porta, e se ne comparisse una non
    // deve mostrare all'operatore un passaggio che non esiste più.
    default:
      return 'Nessuna classificazione';
  }
}

export function isRefundFinancialStatus(status: PrismaFinancial): boolean {
  return status === PrismaFinancial.refunded || status === PrismaFinancial.partially_refunded;
}
