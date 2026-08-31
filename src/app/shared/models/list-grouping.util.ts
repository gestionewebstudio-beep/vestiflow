import { formatDate } from '@core/utils/date.util';
import type { DataTableSection } from '@shared/components/data-table/data-table.model';
import type { ResolvedTableColumn } from '@shared/table-columns/table-column.model';

/**
 * ⭐ **Raggruppare un elenco PER GIORNO**, con la forma del Registro Corrispettivi
 * — indicato dal proprietario il 31/08/2026: _«l'impostazione "raggruppa"
 * presente nei corrispettivi va inserita nei riepiloghi con le date»_.
 *
 * ```text
 * ▸ 17 agosto 2026
 *     Vendita     N. 3    …   25,00 €
 *     Vendita     N. 2    …  358,00 €
 *   Totale 17 agosto 2026     383,00 €
 * ```
 *
 * ## ⛔ Il piede di gruppo SOMMA, non ricalcola
 *
 * `regole-gestionale` è esplicita: «elenchi, report e selezioni AGGREGANO i valori
 * finali già determinati». Qui si sommano i valori delle righe del gruppo, e mai
 * si rifà una formula — è la stessa regola di `totaliDiElenco`, un livello più in
 * basso.
 *
 * ⚠️ **Il Registro Corrispettivi NON usa questa funzione**, e non è una svista: i
 * suoi totali per giornata arrivano **dall'API**, perché il suo risultato è più
 * grande di quello che ha a schermo. Sommare le righe rese darebbe il totale della
 * vista, non della giornata. Chi è in quella condizione costruisce le proprie
 * sezioni e non passa di qui.
 *
 * ## ⚠️ Le righe devono già essere ORDINATE per data
 *
 * Questa funzione raggruppa **consecutivi**, non ordina: due righe dello stesso
 * giorno separate da una terza fanno due gruppi. È voluto — ordinare qui
 * scavalcherebbe l'ordinamento che l'operatore ha scelto, e il raggruppamento
 * per data ha senso solo su un elenco ordinato per data.
 *
 * ⭐ Per questo chi accende il raggruppamento **spegne l'ordinamento libero**, come
 * fa già il Registro.
 */
export function raggruppaPerGiorno<T>(
  righe: readonly T[],
  opzioni: {
    /** La data della riga, in qualunque forma parsabile o già `AAAA-MM-GG`. */
    readonly giornoDi: (row: T) => string | null;
    /** Come si scrive l'intestazione del gruppo. */
    readonly etichetta: (giorno: string) => string;
    /** Le colonne VISIBILI: un piede non somma una colonna spenta. */
    readonly columns: readonly ResolvedTableColumn[];
    /**
     * Per ogni colonna sommabile, come si legge il numero e come si scrive il
     * risultato. Vuoto = gruppi con la sola intestazione, senza piede.
     */
    readonly campi?: Readonly<
      Record<
        string,
        { readonly valore: (row: T) => number; readonly formato: (n: number) => string }
      >
    >;
    /**
     * ⭐ Quale valore RISPONDE alla domanda del gruppo, e sale al terzo livello di
     * peso. Su un registro è il totale; su un magazzino potrebbe essere la
     * quantità. Omesso, nessun valore si distingue.
     */
    readonly emphasis?: string;
  },
): readonly DataTableSection<T>[] {
  const { giornoDi, etichetta, columns, campi = {}, emphasis } = opzioni;

  const gruppi: { id: string; header: string; rows: T[] }[] = [];
  for (const riga of righe) {
    const giorno = (giornoDi(riga) ?? '').slice(0, 10);
    const ultimo = gruppi.at(-1);
    if (ultimo && ultimo.id === giorno) {
      ultimo.rows.push(riga);
      continue;
    }
    gruppi.push({ id: giorno, header: etichetta(giorno), rows: [riga] });
  }

  const sommabili = columns.filter((column) => campi[column.id] !== undefined);
  if (sommabili.length === 0) {
    return gruppi;
  }

  return gruppi.map((gruppo) => ({
    ...gruppo,
    footer: {
      label: `Totale ${gruppo.header}`,
      ...(emphasis ? { emphasis } : {}),
      values: Object.fromEntries(
        sommabili.map((column) => {
          const campo = campi[column.id]!;
          return [
            column.id,
            campo.formato(gruppo.rows.reduce((somma, riga) => somma + campo.valore(riga), 0)),
          ];
        }),
      ),
    },
  }));
}

/**
 * ⭐ **Le sezioni di un elenco: piatte o raggruppate**, in una riga sola.
 *
 * Sei elenchi hanno la stessa forma — «una sezione quando Raggruppa è Nessuno,
 * una per giornata quando è Giorno» — e scriverla sei volte significa sei
 * occasioni di scriverla diversa. La differenza fra loro è solo *quale campo è la
 * data* e *quali colonne si sommano*: quelle restano della pagina.
 *
 * ```ts
 * protected readonly sezioni = computed(() =>
 *   sezioniDiElenco(this.rows(), this.raggruppaPerGiornata(), {
 *     idPiatto: 'ordini',
 *     giornoDi: (o) => o.orderDate,
 *     columns: this.tableColumns(),
 *     campi: { total: { valore: …, formato: … } },
 *     emphasis: 'total',
 *   }),
 * );
 * ```
 *
 * ⚠️ **L'etichetta ha un default** — la data per esteso, «Senza data» se manca —
 * perché è quella giusta per tutti e sei: un elenco che ne volesse un'altra la
 * passa, ma nessuno deve riscriverla per averla uguale.
 */
export function sezioniDiElenco<T>(
  righe: readonly T[],
  raggruppa: boolean,
  opzioni: {
    /** L'id della sezione unica quando non si raggruppa. */
    readonly idPiatto: string;
    readonly giornoDi: (row: T) => string | null;
    readonly etichetta?: (giorno: string) => string;
    readonly columns: readonly ResolvedTableColumn[];
    readonly campi?: Readonly<
      Record<
        string,
        { readonly valore: (row: T) => number; readonly formato: (n: number) => string }
      >
    >;
    readonly emphasis?: string;
  },
): readonly DataTableSection<T>[] {
  if (!raggruppa) {
    return [{ id: opzioni.idPiatto, rows: righe }];
  }
  return raggruppaPerGiorno(righe, {
    ...opzioni,
    etichetta: opzioni.etichetta ?? etichettaGiornata,
  });
}

/** ⚠️ Una riga senza data non sparisce: si raccoglie sotto un nome che lo dice. */
function etichettaGiornata(giorno: string): string {
  return giorno ? formatDate(giorno) : 'Senza data';
}
