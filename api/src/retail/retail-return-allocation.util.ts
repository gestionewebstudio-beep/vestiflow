import { UnprocessableEntityException } from '@nestjs/common';

import { proportionalMinor } from '../common/money.util';

export interface ReturnedLineAmounts {
  readonly quantity: number;
  readonly lineTotalMinor: number;
  readonly lineVatTotalMinor: number;
  readonly lineGrossTotalMinor: number;
}

export const NO_RETURNED_AMOUNTS: ReturnedLineAmounts = {
  quantity: 0,
  lineTotalMinor: 0,
  lineVatTotalMinor: 0,
  lineGrossTotalMinor: 0,
};

/** Differenza fra il diritto cumulativo e gli importi effettivamente già restituiti. */
export function allocateRetailReturn(
  original: ReturnedLineAmounts,
  previous: ReturnedLineAmounts,
  quantity: number,
): Omit<ReturnedLineAmounts, 'quantity'> {
  const cumulativeQuantity = previous.quantity + quantity;
  const coherent = (line: ReturnedLineAmounts) =>
    [line.quantity, line.lineTotalMinor, line.lineVatTotalMinor, line.lineGrossTotalMinor].every(
      (value) => Number.isSafeInteger(value) && value >= 0,
    ) && line.lineTotalMinor + line.lineVatTotalMinor === line.lineGrossTotalMinor;
  if (
    !coherent(original) ||
    !coherent(previous) ||
    original.quantity <= 0 ||
    !Number.isSafeInteger(quantity) ||
    quantity <= 0 ||
    cumulativeQuantity > original.quantity
  ) {
    throw new UnprocessableEntityException(
      'Quantità o importi storici del reso incoerenti: verifica la vendita e i resi già registrati.',
    );
  }
  const gross = proportionalMinor(
    original.lineGrossTotalMinor,
    cumulativeQuantity,
    original.quantity,
  );
  // L'imponibile segue il lordo cumulativo già ripartito. Così anche quote di pochi
  // centesimi conservano IVA non negativa, senza arrotondare tre componenti indipendenti.
  const net =
    original.lineGrossTotalMinor === 0
      ? 0
      : proportionalMinor(original.lineTotalMinor, gross, original.lineGrossTotalMinor);
  const lineGrossTotalMinor = gross - previous.lineGrossTotalMinor;
  const lineTotalMinor = net - previous.lineTotalMinor;
  const lineVatTotalMinor = lineGrossTotalMinor - lineTotalMinor;
  if (lineGrossTotalMinor < 0 || lineTotalMinor < 0 || lineVatTotalMinor < 0) {
    throw new UnprocessableEntityException(
      'La ripartizione non è compatibile con gli importi già restituiti: verifica lo storico.',
    );
  }
  return { lineTotalMinor, lineVatTotalMinor, lineGrossTotalMinor };
}
