import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * L'ordinamento dell'elenco ordini cliente (`14` §H15).
 *
 * ⭐ Terza whitelist della stessa forma: il descrittore è quello del motore, il
 * parametro HTTP la sua serializzazione, e **solo questa tabella** — quali
 * colonne il database sappia ordinare — è dell'endpoint.
 *
 * ⛔ Restano fuori **Origine, Stato, Pagamento, Evasione**: sono enum che a
 * schermo si leggono in italiano, e la decisione presa sui Movimenti è di
 * ordinare per etichetta (`14` §H13), che lato server non c'è. E **Tot. netto,
 * Location, Commento, Vendita online, Cod. cliente**: le prime due sarebbero
 * una relazione o un campo che il client compone, le altre non sono un ordine
 * che qualcuno chiede.
 *
 * ⚠️ L'elenco è **paginato**: senza questo giro, premere un'intestazione
 * avrebbe riordinato la sola pagina caricata.
 */
export type SalesOrderSortField = 'orderNumber' | 'placedAt' | 'customerName' | 'total';

export type SortDirection = 'asc' | 'desc';

const TIE_BREAK: Prisma.SalesOrderOrderByWithRelationInput = { id: 'asc' };

export const DEFAULT_SALES_ORDER_ORDER: Prisma.SalesOrderOrderByWithRelationInput[] = [
  { placedAt: 'desc' },
  TIE_BREAK,
];

const ORDER_BY: Record<
  SalesOrderSortField,
  (direction: SortDirection) => Prisma.SalesOrderOrderByWithRelationInput[]
> = {
  orderNumber: (direction) => [{ orderNumber: direction }],
  placedAt: (direction) => [{ placedAt: direction }],
  customerName: (direction) => [{ customerName: direction }],
  total: (direction) => [{ totalMinor: direction }],
};

const SORTABLE_FIELDS = Object.keys(ORDER_BY) as SalesOrderSortField[];

export function parseSalesOrderSort(
  raw: string | undefined,
): Prisma.SalesOrderOrderByWithRelationInput[] {
  if (!raw?.trim()) {
    return DEFAULT_SALES_ORDER_ORDER;
  }

  const orderBy: Prisma.SalesOrderOrderByWithRelationInput[] = [];
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

  return orderBy.length > 0 ? [...orderBy, TIE_BREAK] : DEFAULT_SALES_ORDER_ORDER;
}

function isSortableField(campo: string | undefined): campo is SalesOrderSortField {
  return campo != null && (SORTABLE_FIELDS as string[]).includes(campo);
}
