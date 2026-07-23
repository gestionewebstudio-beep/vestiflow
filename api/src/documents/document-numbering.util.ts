import type { DocumentType, Prisma } from '@prisma/client';

import { documentNumberingType } from './document-type.util';
import { formatDocumentReference } from './document-totals.util';

/**
 * Assegnazione dei numeri progressivi.
 *
 * Il prossimo numero è «il massimo esistente per quella serie/anno + 1», non
 * un contatore autonomo: eliminando i documenti in coda il progressivo scende
 * da solo e il numero liberato viene riusato, mentre i buchi in mezzo restano
 * tali (nessuno li riempie). Il contatore `DocumentSequence` non partecipa più
 * all'assegnazione — restava alto anche dopo le cancellazioni.
 *
 * Le tre fonti hanno tracciati diversi: i documenti di registro hanno una
 * colonna numerica, ordini fornitore e ordini cliente conservano solo il
 * riferimento testuale (es. «OF-2026-0042»), da cui il numero va estratto.
 */
export type DocumentNumberSource = 'document' | 'supplier_order' | 'sales_order';

export interface NextNumberInput {
  readonly tx: Prisma.TransactionClient;
  readonly tenantId: string;
  /** Tipo documento; internamente si usa quello che possiede il numeratore. */
  readonly type: DocumentType;
  readonly series: string;
  readonly year: number;
  readonly source: DocumentNumberSource;
  /** Prefisso del riferimento: serve solo alle fonti testuali. */
  readonly prefix?: string;
}

/** Numero più alto già assegnato nella serie/anno, 0 se la serie è vuota. */
export async function lastAssignedNumber(input: NextNumberInput): Promise<number> {
  const { tx, tenantId, series, year, source } = input;
  const type = documentNumberingType(input.type);

  if (source === 'document') {
    const result = await tx.document.aggregate({
      _max: { number: true },
      where: { tenantId, type, series, year },
    });
    return result._max.number ?? 0;
  }

  // Fonti testuali: si confrontano i riferimenti dell'anno con lo stesso
  // prefisso e si prende la coda numerica più alta.
  const prefix = (input.prefix ?? '').trim();
  if (!prefix) {
    return 0;
  }
  const startsWith = `${prefix}-${year}-`;
  const references =
    source === 'supplier_order'
      ? await tx.supplierOrder.findMany({
          where: { tenantId, reference: { startsWith } },
          select: { reference: true },
        })
      : await tx.salesOrder.findMany({
          where: { tenantId, orderNumber: { startsWith } },
          select: { orderNumber: true },
        });

  return references.reduce((max, row) => {
    const reference = 'reference' in row ? row.reference : row.orderNumber;
    const parsed = Number.parseInt(reference.slice(startsWith.length), 10);
    return Number.isInteger(parsed) && parsed > max ? parsed : max;
  }, 0);
}

/** Prossimo numero libero della serie/anno (massimo esistente + 1). */
export async function nextDocumentNumber(input: NextNumberInput): Promise<number> {
  return (await lastAssignedNumber(input)) + 1;
}

/**
 * Numero e riferimento da assegnare, dato l'eventuale numero scelto a mano
 * dall'operatore. Un numero imposto NON sposta il progressivo della serie: i
 * documenti successivi ripartono dal massimo esistente + 1.
 */
export async function resolveDocumentNumber(
  input: NextNumberInput & { readonly requestedNumber?: number | null },
): Promise<{ number: number; reference: string }> {
  const number =
    input.requestedNumber && input.requestedNumber > 0
      ? input.requestedNumber
      : await nextDocumentNumber(input);
  return {
    number,
    reference: formatDocumentReference((input.prefix ?? 'DOC').trim() || 'DOC', input.year, number),
  };
}

/**
 * Errore di numero già preso, con il primo libero da proporre. Il vincolo
 * unico del database resta l'unica verità: due operatori che salvano lo stesso
 * numero nello stesso istante non possono duplicarlo, uno dei due riceve
 * questo conflitto e sceglie se prendere il numero proposto.
 */
export interface DocumentNumberConflict {
  readonly code: 'document_number_taken';
  readonly number: number;
  readonly nextAvailable: number;
  readonly series: string;
  readonly year: number;
}

/**
 * Conflitto da restituire al client: il primo numero libero della serie e
 * quello che l'ha appena bruciato. Unico punto in cui si compone il payload,
 * così i flussi (registro, arrivo merce, trasferimento/rettifica) rispondono
 * tutti allo stesso modo.
 */
export async function buildDocumentNumberConflict(
  input: NextNumberInput,
): Promise<DocumentNumberConflict> {
  const nextAvailable = await nextDocumentNumber(input);
  return {
    code: 'document_number_taken',
    number: nextAvailable - 1,
    nextAvailable,
    series: input.series,
    year: input.year,
  };
}

/** True se l'errore Prisma è la violazione del vincolo unico sul numero. */
export function isDocumentNumberConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const candidate = error as { code?: unknown; meta?: { target?: unknown } };
  if (candidate.code !== 'P2002') {
    return false;
  }
  const target = candidate.meta?.target;
  const fields = Array.isArray(target) ? target.map(String) : [String(target ?? '')];
  return fields.some((field) => field.includes('number'));
}
