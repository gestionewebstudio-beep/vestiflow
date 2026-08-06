// Aritmetica della sessione di cassa: aggregazione dei pagamenti dei
// documenti agganciati e dei movimenti di cassetto. Funzioni pure — il
// servizio carica le righe, qui si calcola.

/** Riga pagamento di un documento agganciato alla sessione. */
export interface SessionPaymentRow {
  /** `store_sale` incassa, `store_return` rimborsa. */
  readonly documentType: string;
  /** Codice metodo della riga: `cash` / `card` / `other`. */
  readonly method: string;
  readonly amountMinor: number;
}

export interface SessionMovementRow {
  readonly type: 'deposit' | 'withdrawal';
  readonly amountMinor: number;
}

export interface CashSessionTotals {
  readonly salesCashMinor: number;
  readonly salesCardMinor: number;
  readonly salesOtherMinor: number;
  readonly refundsCashMinor: number;
  readonly refundsCardMinor: number;
  readonly refundsOtherMinor: number;
  readonly depositsMinor: number;
  readonly withdrawalsMinor: number;
  /** Contanti attesi nel cassetto: fondo + incassi − rimborsi + versamenti − prelievi. */
  readonly expectedCashMinor: number;
  /** Attesi elettronico/altro: incassi − rimborsi (niente fondo, niente cassetto). */
  readonly expectedCardMinor: number;
  readonly expectedOtherMinor: number;
}

/** Metodo sconosciuto → «altro»: mai perdere denaro per un codice nuovo. */
function bucket(method: string): 'cash' | 'card' | 'other' {
  return method === 'cash' || method === 'card' ? method : 'other';
}

export function computeCashSessionTotals(
  openingFloatMinor: number,
  payments: readonly SessionPaymentRow[],
  movements: readonly SessionMovementRow[],
): CashSessionTotals {
  const sales = { cash: 0, card: 0, other: 0 };
  const refunds = { cash: 0, card: 0, other: 0 };
  for (const row of payments) {
    const target = row.documentType === 'store_return' ? refunds : sales;
    target[bucket(row.method)] += row.amountMinor;
  }

  let depositsMinor = 0;
  let withdrawalsMinor = 0;
  for (const movement of movements) {
    if (movement.type === 'deposit') {
      depositsMinor += movement.amountMinor;
    } else {
      withdrawalsMinor += movement.amountMinor;
    }
  }

  return {
    salesCashMinor: sales.cash,
    salesCardMinor: sales.card,
    salesOtherMinor: sales.other,
    refundsCashMinor: refunds.cash,
    refundsCardMinor: refunds.card,
    refundsOtherMinor: refunds.other,
    depositsMinor,
    withdrawalsMinor,
    expectedCashMinor:
      openingFloatMinor + sales.cash - refunds.cash + depositsMinor - withdrawalsMinor,
    expectedCardMinor: sales.card - refunds.card,
    expectedOtherMinor: sales.other - refunds.other,
  };
}
