import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * L'ordinamento dell'elenco ordini fornitore (`14` §H15).
 *
 * ⭐ **Stessa forma dell'elenco documenti, e non per simmetria**: il descrittore
 * è quello del motore (`DataTableSort[]`), il parametro HTTP è la sua
 * serializzazione, e **solo la whitelist è di questo endpoint** — quali colonne
 * questo database sappia ordinare non è informazione che possa stare altrove.
 *
 * ⚠️ **Qui «Fornitore» si ordina**, e sull'elenco documenti no: non è
 * un'incoerenza. Là la controparte è due campi (`customerName` sulle vendite,
 * `supplierName` sugli acquisti); qui l'ordine ha un fornitore solo, e il campo
 * è uno.
 *
 * ⭐ **«Stato» si ordina**, e l'ordine è quello dell'enum: `confirmed →
 * concluded → cancelled`, cioè il ciclo di vita dichiarato nello schema.
 * Postgres ordina un `ENUM` per dichiarazione, non per il testo del valore —
 * qui c'era scritto il contrario, ed era falso.
 *
 * ⚠️ Che l'ordine giusto sia il ciclo di vita o l'alfabetico dell'etichetta è
 * una scelta funzionale, dichiarata e rivedibile (`14` §H15).
 */
export type SupplierOrderSortField =
  'reference' | 'supplier' | 'lines' | 'expected' | 'total' | 'status';

export type SortDirection = 'asc' | 'desc';

/** Senza, la paginazione può mostrare due volte la stessa riga (`14` §H15). */
const TIE_BREAK: Prisma.SupplierOrderOrderByWithRelationInput = { id: 'asc' };

export const DEFAULT_SUPPLIER_ORDER_ORDER: Prisma.SupplierOrderOrderByWithRelationInput[] = [
  { createdAt: 'desc' },
  TIE_BREAK,
];

/**
 * ⚠️ **«Riferimento» ordina la stringa, e qui è giusto** — al contrario
 * dell'elenco documenti, dove il progressivo si ordina per `year` + `number`.
 * La differenza è nel dato: là convivono prefissi diversi (DDT, FT, NC) e
 * l'alfabetico raggrupperebbe per tipo; qui il prefisso è uno solo, e la
 * stringa completa ordina esattamente come il progressivo che rappresenta.
 */
const ORDER_BY: Record<
  SupplierOrderSortField,
  (direction: SortDirection) => Prisma.SupplierOrderOrderByWithRelationInput[]
> = {
  reference: (direction) => [{ reference: direction }],
  supplier: (direction) => [{ supplierName: direction }],
  lines: (direction) => [{ lines: { _count: direction } }],
  expected: (direction) => [{ expectedAt: direction }],
  total: (direction) => [{ totalMinor: direction }],
  status: (direction) => [{ status: direction }],
};

const SORTABLE_FIELDS = Object.keys(ORDER_BY) as SupplierOrderSortField[];

export function parseSupplierOrderSort(
  raw: string | undefined,
): Prisma.SupplierOrderOrderByWithRelationInput[] {
  if (!raw?.trim()) {
    return DEFAULT_SUPPLIER_ORDER_ORDER;
  }

  const orderBy: Prisma.SupplierOrderOrderByWithRelationInput[] = [];
  const viste = new Set<string>();

  for (const chiave of raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)) {
    const [campo, direzione = 'asc'] = chiave.split(':').map((parte) => parte.trim());

    if (!isSortableField(campo)) {
      throw new BadRequestException(
        `Ordinamento non supportato per «${campo}». Colonne ordinabili: ${SORTABLE_FIELDS.join(', ')}.`,
      );
    }
    if (direzione !== 'asc' && direzione !== 'desc') {
      throw new BadRequestException(
        `Direzione di ordinamento non valida: «${direzione}». Usare asc o desc.`,
      );
    }
    if (viste.has(campo)) {
      continue;
    }
    viste.add(campo);
    orderBy.push(...ORDER_BY[campo](direzione));
  }

  return orderBy.length > 0 ? [...orderBy, TIE_BREAK] : DEFAULT_SUPPLIER_ORDER_ORDER;
}

function isSortableField(campo: string | undefined): campo is SupplierOrderSortField {
  return campo != null && (SORTABLE_FIELDS as string[]).includes(campo);
}
