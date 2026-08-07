import type { FormArray, FormControl, FormGroup, NonNullableFormBuilder } from '@angular/forms';

import type { CurrencyCode, Money } from '@core/models/common.model';
import type { DocumentPaymentInstallment } from '@core/models/document.model';
import { moneyToDecimalString, parseMoneyInput } from '@core/utils/money.util';

/**
 * Rate di pagamento in maschera (Registrazione fattura fornitore e Fattura di
 * vendita): stesso form, stessa serializzazione. L'importo viaggia come testo
 * it-IT (virgola) e diventa unità minori solo alla submit.
 */
export type InstallmentFormGroup = FormGroup<{
  dueDate: FormControl<string>;
  amountText: FormControl<string>;
  settled: FormControl<boolean>;
  settledAt: FormControl<string>;
}>;

export type InstallmentFormArray = FormArray<InstallmentFormGroup>;

export interface InstallmentFormValue {
  readonly dueDate: string;
  readonly amountText: string;
  readonly settled: boolean;
  readonly settledAt: string;
}

/** Rata serializzata per l'API (date ISO, importo in unità minori). */
export interface SerializedInstallment {
  readonly dueDate: string;
  readonly amountMinor: number;
  readonly settled: boolean;
  readonly settledAt?: string;
}

export type SerializeInstallmentsResult =
  | { readonly ok: true; readonly installments: readonly SerializedInstallment[] }
  | { readonly ok: false; readonly message: string };

/**
 * Importo per gli input rata, virgola come separatore. Lo zero resta «0,00»:
 * una rata a importo zero salvata deve rientrare tale e quale — reidratarla
 * vuota renderebbe la riga «incompleta» e bloccherebbe il salvataggio
 * successivo. Il default «vuoto se non c'è residuo» lo decide chi aggiunge la
 * rata, non questa formattazione.
 */
export function installmentAmountText(money: Money): string {
  return moneyToDecimalString(money).replace('.', ',');
}

export function buildInstallmentGroup(
  fb: NonNullableFormBuilder,
  init?: Partial<InstallmentFormValue>,
): InstallmentFormGroup {
  return fb.group({
    dueDate: fb.control(init?.dueDate ?? ''),
    amountText: fb.control(init?.amountText ?? ''),
    settled: fb.control(init?.settled ?? false),
    settledAt: fb.control(init?.settledAt ?? ''),
  });
}

/** Ricostruisce il FormArray dalle rate del documento caricato. */
export function rehydrateInstallments(
  fb: NonNullableFormBuilder,
  array: InstallmentFormArray,
  installments: readonly DocumentPaymentInstallment[],
): void {
  array.clear();
  for (const installment of installments) {
    array.push(
      buildInstallmentGroup(fb, {
        dueDate: installment.dueDate.slice(0, 10),
        amountText: installmentAmountText(installment.amount),
        settled: installment.settled,
        settledAt: installment.settledAt ? installment.settledAt.slice(0, 10) : '',
      }),
    );
  }
}

/** Somma degli importi digitati (per il default «residuo» di una rata nuova). */
export function installmentsCoveredMinor(
  values: readonly InstallmentFormValue[],
  currency: CurrencyCode,
): number {
  return values.reduce(
    (sum, installment) =>
      sum + (parseMoneyInput(installment.amountText, currency)?.amountMinor ?? 0),
    0,
  );
}

/** Somma delle sole rate spuntate come saldate. */
export function installmentsSettledMinor(
  values: readonly InstallmentFormValue[],
  currency: CurrencyCode,
): number {
  return values.reduce(
    (sum, installment) =>
      sum +
      (installment.settled
        ? (parseMoneyInput(installment.amountText, currency)?.amountMinor ?? 0)
        : 0),
    0,
  );
}

/**
 * Serializza le rate per l'API. Le righe completamente vuote si saltano; una
 * riga con dati parziali (data senza importo o viceversa) blocca la submit con
 * un messaggio puntuale — non si inventa la metà mancante.
 */
export function serializeInstallments(
  values: readonly InstallmentFormValue[],
  currency: CurrencyCode,
): SerializeInstallmentsResult {
  const installments: SerializedInstallment[] = [];
  for (const [index, installment] of values.entries()) {
    const hasContent =
      installment.dueDate.trim() || installment.amountText.trim() || installment.settled;
    if (!hasContent) {
      continue;
    }
    const amount = parseMoneyInput(installment.amountText, currency);
    if (!installment.dueDate || amount === null || amount.amountMinor < 0) {
      return {
        ok: false,
        message: `Scadenza ${index + 1}: inserisci data scadenza e importo validi.`,
      };
    }
    installments.push({
      dueDate: new Date(installment.dueDate).toISOString(),
      amountMinor: amount.amountMinor,
      settled: installment.settled,
      settledAt: installment.settledAt ? new Date(installment.settledAt).toISOString() : undefined,
    });
  }
  return { ok: true, installments };
}
