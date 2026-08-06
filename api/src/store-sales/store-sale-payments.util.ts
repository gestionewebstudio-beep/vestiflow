import { BadRequestException } from '@nestjs/common';

import type {
  StoreSalePaymentInputDto,
  StoreSalePaymentMethod,
} from './dto/create-store-sale.dto';

/** Riga pagamento pronta per la persistenza (ordinata, ripulita, validata). */
export interface ResolvedStoreSalePayment {
  readonly position: number;
  readonly method: StoreSalePaymentMethod;
  readonly methodNote: string | null;
  readonly amountMinor: number;
  readonly tenderedMinor: number | null;
}

export interface ResolvedStoreSalePayments {
  readonly rows: readonly ResolvedStoreSalePayment[];
  /** Riepilogo per filtri e liste: il codice metodo, oppure `mixed`. */
  readonly documentMethod: string;
  /** Nota mostrata accanto al metodo: testo di «Altro» o sintesi del misto. */
  readonly documentMethodNote: string | null;
}

const METHOD_LABELS: Record<StoreSalePaymentMethod, string> = {
  cash: 'Contanti',
  card: 'Carta',
  other: 'Altro',
};

/** Solo per note riepilogo (mai calcoli): 1990 → «19,90 €». */
function formatEuro(amountMinor: number): string {
  const sign = amountMinor < 0 ? '-' : '';
  const abs = Math.abs(amountMinor);
  const units = Math.floor(abs / 100);
  const cents = String(abs % 100).padStart(2, '0');
  return `${sign}${units},${cents} €`;
}

function rowLabel(row: ResolvedStoreSalePayment): string {
  const base =
    row.method === 'other' && row.methodNote
      ? `${METHOD_LABELS.other} (${row.methodNote})`
      : METHOD_LABELS[row.method];
  return `${base} ${formatEuro(row.amountMinor)}`;
}

/**
 * Risolve i pagamenti della vendita dal DTO: multi-tender (`payments`) o
 * legacy a metodo unico (`paymentMethod`, che copre l'intero totale). La somma
 * delle quote deve essere pari al totale documento; i «ricevuti» in contanti
 * non possono stare sotto la quota da incassare (il resto è la differenza).
 * Vendita a totale zero (omaggio pieno): nessuna riga pagamento, resta solo il
 * metodo di riepilogo sul documento.
 */
export function resolveStoreSalePayments(
  dto: {
    readonly payments?: readonly StoreSalePaymentInputDto[];
    readonly paymentMethod?: StoreSalePaymentMethod;
    readonly paymentMethodNote?: string;
  },
  totalMinor: number,
): ResolvedStoreSalePayments {
  const inputs: readonly StoreSalePaymentInputDto[] = dto.payments?.length
    ? dto.payments
    : dto.paymentMethod
      ? [
          {
            method: dto.paymentMethod,
            methodNote: dto.paymentMethodNote,
            amountMinor: totalMinor,
          },
        ]
      : [];
  if (inputs.length === 0) {
    throw new BadRequestException('Indicare il pagamento della vendita.');
  }

  const rows: ResolvedStoreSalePayment[] = inputs.map((input, index) => {
    const methodNote =
      input.method === 'other' ? input.methodNote?.trim() || null : null;
    const tenderedMinor = input.method === 'cash' ? (input.tenderedMinor ?? null) : null;
    if (tenderedMinor != null && tenderedMinor < input.amountMinor) {
      throw new BadRequestException(
        `Contanti ricevuti (${formatEuro(tenderedMinor)}) inferiori alla quota da incassare (${formatEuro(input.amountMinor)}).`,
      );
    }
    return {
      position: index + 1,
      method: input.method,
      methodNote,
      amountMinor: input.amountMinor,
      tenderedMinor,
    };
  });

  const documentMethod = rows.length === 1 ? rows[0]!.method : 'mixed';

  // Totale zero (omaggio pieno): niente incasso da ripartire, resta solo il
  // metodo di riepilogo. Il legacy passa di qui con amountMinor = 0.
  if (totalMinor === 0) {
    return {
      rows: [],
      documentMethod,
      documentMethodNote: rows.length === 1 ? rows[0]!.methodNote : null,
    };
  }

  const paidMinor = rows.reduce((sum, row) => sum + row.amountMinor, 0);
  if (paidMinor !== totalMinor) {
    throw new BadRequestException(
      `La somma dei pagamenti (${formatEuro(paidMinor)}) non corrisponde al totale della vendita (${formatEuro(totalMinor)}).`,
    );
  }

  return {
    rows,
    documentMethod,
    documentMethodNote:
      rows.length === 1
        ? rows[0]!.methodNote
        : rows.map((row) => rowLabel(row)).join(' + '),
  };
}
