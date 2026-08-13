import { Prisma } from '@prisma/client';
import type { DocumentType } from '@prisma/client';

import { documentNumberingTypes } from './document-type.util';
import { serieCanonica } from './document-numbering.util';
import type { DocumentNumberSource } from './document-numbering.util';

/** Un documento fuori posto: numero più alto, data anteriore a uno più basso. */
export interface ChronologyAnomaly {
  readonly id: string;
  readonly number: number;
  readonly documentDate: Date;
  readonly reference: string | null;
}

export interface ChronologyInput {
  readonly tx: Prisma.TransactionClient;
  readonly tenantId: string;
  /** Tipo documento; internamente si usa quello che possiede il numeratore. */
  readonly type: DocumentType;
  /**
   * Serie del contatore. `null`, `''` e spazi sono tutti «senza serie»: la
   * normalizzazione è qui e non in chi chiama, perché la maschera manda la
   * stringa vuota e la partizione senza serie è la più usata di tutte.
   */
  readonly series: string | null;
  readonly source: DocumentNumberSource;
}

/**
 * **I documenti in anomalia cronologica dentro un contatore** (specifica
 * numerazione §4).
 *
 * Il fatto controllato: a numero più alto deve corrispondere data **uguale o
 * successiva**. Un documento è quindi fuori posto quando la sua data è
 * ANTERIORE alla più recente fra quelle dei numeri più bassi.
 *
 * **Stessa data non è mai anomalia.** Dentro la giornata l'ordine dei numeri non
 * significa niente: creare, saltare, tornare indietro è tutto libero. È il
 * motivo del `<` stretto, e non è una sfumatura — col `<=` ogni serie che nella
 * stessa giornata non fosse numerata in ordine di creazione risulterebbe rotta.
 *
 * **Si elencano tutti**, non solo il documento corrente: l'avviso deve dire
 * *cosa* c'è da sistemare, e un elenco di uno non lo dice.
 *
 * **Chi le crea.** Con la regola del §2 accesa la proposta automatica non genera
 * anomalie riempiendo i buchi. Ne restano tre sorgenti, tutte dell'operatore: il
 * numero forzato a mano, la data cambiata su un documento già salvato, e il caso
 * terminale — i numeri liberi sotto un documento datato avanti si esauriscono e
 * la proposta scavalca. In quest'ultimo l'avviso è **corretto che compaia**:
 * l'anomalia l'ha creata chi ha datato il documento al futuro, il sistema ha
 * solo proseguito a numerare per data.
 *
 * **Una query, funzione finestra.** Il massimo delle date precedenti si calcola
 * scorrendo la partizione una volta sola, in ordine di numero — non con un
 * confronto a coppie, che sarebbe quadratico su una serie lunga.
 */
export async function findChronologyAnomalies(
  input: ChronologyInput,
): Promise<readonly ChronologyAnomaly[]> {
  const { tx, tenantId, series, source } = input;

  const tabella =
    source === 'sales_order'
      ? Prisma.raw('sales_orders')
      : source === 'supplier_order'
        ? Prisma.raw('supplier_orders')
        : Prisma.raw('documents');

  // La colonna che porta la data del documento cambia con la tabella.
  const colonnaData =
    source === 'sales_order'
      ? Prisma.raw('placed_at')
      : source === 'supplier_order'
        ? Prisma.raw('order_date')
        : Prisma.raw('document_date');

  // Anche il riferimento leggibile: `reference` ovunque tranne gli ordini
  // cliente, che lo chiamano `order_number`. Il commento lo diceva già e la
  // query selezionava `reference` comunque — l'endpoint rispondeva 500 su
  // `customer_order`, e nessun test poteva accorgersene perché il doppione
  // della transazione non parla SQL (vedi GUARDIE-MANCANTI, voce 12).
  const colonnaRiferimento =
    source === 'sales_order' ? Prisma.raw('order_number') : Prisma.raw('reference');

  const serieScelta = serieCanonica(series);
  const serie =
    serieScelta === null ? Prisma.sql`series IS NULL` : Prisma.sql`series = ${serieScelta}`;
  const tipi =
    source === 'document'
      ? Prisma.sql`AND type = ANY(${[...documentNumberingTypes(input.type)]}::"DocumentType"[])`
      : Prisma.empty;
  const manuali = source === 'sales_order' ? Prisma.sql`AND source = 'manual'` : Prisma.empty;

  const righe = await tx.$queryRaw<
    { id: string; number: number | bigint; data: Date; reference: string | null }[]
  >`
    SELECT id, number, data, reference FROM (
      SELECT
        id,
        number,
        ${colonnaData} AS data,
        ${colonnaRiferimento} AS reference,
        -- La data più recente fra i numeri PRECEDENTI. La finestra esclude la
        -- riga corrente (1 PRECEDING), o ogni documento risulterebbe in regola
        -- con sé stesso.
        MAX(${colonnaData}) OVER (
          ORDER BY number
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ) AS data_massima_precedente
      FROM ${tabella}
      WHERE tenant_id = ${tenantId}::uuid ${tipi} ${manuali} AND ${serie}
        AND number IS NOT NULL
    ) t
    WHERE data < data_massima_precedente
    ORDER BY number
  `;

  return righe.map((riga) => ({
    id: riga.id,
    number: Number(riga.number),
    documentDate: riga.data,
    reference: riga.reference,
  }));
}
