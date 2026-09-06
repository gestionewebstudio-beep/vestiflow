import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * L'ordinamento dell'elenco ordini cliente (`14` §H15).
 *
 * ⭐ Terza whitelist della stessa forma: il descrittore è quello del motore, il
 * parametro HTTP la sua serializzazione, e **solo questa tabella** — quali
 * colonne il database sappia ordinare — è dell'endpoint.
 *
 * ⭐ **Origine, Pagamento ed Evasione si ordinano**, con l'ordine dell'enum —
 * che qui è una progressione, non un alfabeto:
 *
 * ```text
 * SalesOrderFinancialStatus     pending → authorized → paid → …rimborsi
 * SalesOrderFulfillmentStatus   unfulfilled → partially_fulfilled → fulfilled
 * SalesOrderSource              shopify_online → shopify_pos → manual → store
 * ```
 *
 * ⛔ **Resta fuori «Stato», e per una ragione diversa dalle altre**: non è un
 * campo del database. Lo **compone il client** da più dati dell'ordine
 * (`orderStateLabel`), quindi ordinarlo lato server vorrebbe dire riscrivere
 * quella logica qui — cioè due fonti di verità per la stessa risposta. È
 * «ordinabile, da completare», non «non ordinabile».
 *
 * ⚠️ L'elenco è **paginato**: senza questo giro, premere un'intestazione
 * avrebbe riordinato la sola pagina caricata.
 */
export type SalesOrderSortField =
  | 'orderNumber'
  | 'placedAt'
  | 'customerName'
  | 'total'
  | 'source'
  | 'financialStatus'
  | 'fulfillmentStatus';

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
  source: (direction) => [{ source: direction }],
  financialStatus: (direction) => [{ financialStatus: direction }],
  fulfillmentStatus: (direction) => [{ fulfillmentStatus: direction }],
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
