import { Prisma } from '@prisma/client';
import type { DocumentType } from '@prisma/client';

import { documentNumberingTypes } from './document-type.util';
import { serieCanonica } from './document-numbering.util';
import type { DocumentNumberSource } from './document-numbering.util';

/**
 * Come il documento in salvataggio rompe l'ordine rispetto a quello trovato.
 *
 * - `precede` — il documento trovato ha un numero **più basso** e una data
 *   **successiva**: sta prima nella numerazione e dopo nel tempo.
 * - `segue` — numero **più alto** e data **anteriore**.
 */
export type ChronologyDirection = 'precede' | 'segue';

/** Il documento già salvato che con quello in corso non sta in ordine. */
export interface ChronologyConflict {
  readonly id: string;
  readonly number: number;
  readonly documentDate: Date;
  readonly reference: string | null;
  readonly direction: ChronologyDirection;
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
  /** Numero che il documento in salvataggio sta per prendere. */
  readonly number: number;
  /** Data in testata del documento in salvataggio. */
  readonly documentDate: Date;
  /**
   * Il documento stesso, quando è una modifica: la sua riga vecchia non deve
   * fargli conflitto con sé stesso se il numero è cambiato.
   */
  readonly excludeId?: string | null;
}

/**
 * **Il documento in salvataggio sta in ordine?** (specifica numerazione §4).
 *
 * Il fatto controllato: dentro un contatore, a numero più alto deve
 * corrispondere data **uguale o successiva**. Si guarda la coppia (numero,
 * data) che l'operatore ha in testata e si cerca chi la smentisce.
 *
 * **Il controllo è sul documento in corso, non sulla serie** _(13/08/2026)_.
 * Prima interrogava la partizione intera cercando chiunque fosse fuori posto —
 * e siccome girava PRIMA di scrivere, nel momento che conta non vedeva nulla:
 * l'anomalia la creava il salvataggio stesso, e l'avviso compariva **al
 * salvataggio successivo**, nominando un documento che l'operatore aveva già
 * chiuso. Misurato: crei il n.1 datato domani, ne apri un altro oggi che prende
 * il n.2 — zero anomalie, nessun avviso, salvato; al giro dopo l'avviso
 * denuncia il n.2. Arrivava sempre in ritardo di un gesto.
 *
 * **Stessa data non è mai conflitto.** Dentro la giornata l'ordine dei numeri
 * non significa niente: creare, saltare, tornare indietro è tutto libero. È il
 * motivo dei confronti stretti (`>` e `<`), e non è una sfumatura — con `>=`
 * ogni serie che nella stessa giornata non fosse numerata in ordine di
 * creazione risulterebbe rotta.
 *
 * **Al massimo due**, uno per verso, ed è quello che serve dirgli: chi lo
 * precede col numero e lo segue con la data (il caso comune) e il simmetrico.
 * Fra i candidati si sceglie il **più lontano dall'ordine** — la data più
 * recente fra i numeri minori, la più antica fra i maggiori — perché è quello
 * che rende evidente il salto.
 */
export async function findChronologyConflicts(
  input: ChronologyInput,
): Promise<readonly ChronologyConflict[]> {
  const { tx, tenantId, series, source, number, documentDate, excludeId } = input;

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
  const escluso = excludeId ? Prisma.sql`AND id <> ${excludeId}::uuid` : Prisma.empty;

  const partizione = Prisma.sql`tenant_id = ${tenantId}::uuid ${tipi} ${manuali} ${escluso}
    AND ${serie} AND number IS NOT NULL`;

  const righe = await tx.$queryRaw<
    {
      id: string;
      number: number | bigint;
      data: Date;
      reference: string | null;
      direzione: ChronologyDirection;
    }[]
  >`
    -- Numero più BASSO del mio, data SUCCESSIVA alla mia: sta prima nella
    -- numerazione e dopo nel tempo. Fra tutti, quello con la data più recente.
    (SELECT id, number, ${colonnaData} AS data, ${colonnaRiferimento} AS reference,
            'precede' AS direzione
       FROM ${tabella}
      WHERE ${partizione} AND number < ${number} AND ${colonnaData} > ${documentDate}
      ORDER BY ${colonnaData} DESC
      LIMIT 1)
    UNION ALL
    -- Il simmetrico: numero più alto, data anteriore. Fra tutti, il più antico.
    (SELECT id, number, ${colonnaData} AS data, ${colonnaRiferimento} AS reference,
            'segue' AS direzione
       FROM ${tabella}
      WHERE ${partizione} AND number > ${number} AND ${colonnaData} < ${documentDate}
      ORDER BY ${colonnaData} ASC
      LIMIT 1)
  `;

  return righe.map((riga) => ({
    id: riga.id,
    number: Number(riga.number),
    documentDate: riga.data,
    reference: riga.reference,
    direction: riga.direzione,
  }));
}
