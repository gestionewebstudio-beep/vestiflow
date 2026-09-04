import type { DataTableSort } from '@shared/components/data-table/data-table.model';
import { numeroItaliano, sonoTuttiNumeri } from '@shared/utils/numero-italiano.util';
import { senzaValore } from '@shared/utils/segnaposto.util';
import { sortByKeys, type SortKey } from '@shared/utils/sort-values.util';

/**
 * ⭐ **ORDINARE UN ELENCO PER LE SUE COLONNE, IN MEMORIA** — chiesto dal
 * proprietario il 01/09/2026: «sulle colonne credo che non sia stato applicato
 * l'ordinamento», e «nemmeno in giacenze, situazione e inventario è possibile
 * l'ordinamento interno delle colonne».
 *
 * ⛔ **Non duplica niente, ed è la sua condizione**: «ovviamente non duplicare,
 * già esiste». Il confronto è quello di `sortByKeys` — collatore italiano,
 * denaro, date, assenze a un estremo — e questa funzione gli dice soltanto
 * **che cosa leggere** per ogni colonna.
 *
 * ## È il gemello di `applicaFiltriDiColonna`
 *
 * ```text
 * filtrare   cellText · numeroDi · dataDi   →  quali righe restano
 * ordinare   cellText · numeroDi · dataDi   →  in che ordine stanno
 * ```
 *
 * ⭐ **Le stesse tre funzioni**, che ogni tabella già fornisce al motore. Chi
 * accende l'ordinamento non deve scrivere una mappa colonna→valore: la mappa
 * esiste già, ed è quella con cui la tabella si disegna.
 *
 * ⚠️ **Si ordina su ciò che si LEGGE, tranne dove non si può.** Un importo
 * formattato «1.234,50 €» confrontato come testo metterebbe «−5» dopo «10», e
 * «11/08/2026» come testo metterebbe settembre prima di agosto: per quelle due
 * famiglie servono i valori grezzi, ed è esattamente ciò che gli estrattori
 * danno. Dove mancano, la colonna si ordina come testo — che è sbagliato solo
 * per numeri e date, cioè proprio i casi in cui l'estrattore esiste.
 */
export function ordinaPerColonne<T>(
  righe: readonly T[],
  chiavi: readonly DataTableSort[],
  opzioni: {
    readonly cellText: (row: T, columnId: string) => string;
    /** Il numero di una colonna numerica. Senza, si ordina come testo. */
    readonly numeroDi?: (row: T, columnId: string) => number | null;
    /** La data ISO di una colonna data. Senza, si ordina come testo. */
    readonly dataDi?: (row: T, columnId: string) => string | null;
    /** La valuta con cui leggere gli importi formattati. */
    readonly valuta?: string;
  },
): readonly T[] {
  if (chiavi.length === 0 || righe.length === 0) {
    return righe;
  }

  const daOrdinare: readonly SortKey<T>[] = chiavi.map((chiave) => {
    /*
      ⚠️ **Il tipo si decide UNA volta per colonna**, non riga per riga: un
      comparatore che cambiasse idea a metà — questa coppia come numeri, quella
      come testo — non produce un ordine, produce un risultato che dipende da
      come l'algoritmo ha scelto le coppie.

      ⚠️ **E si cerca la prima riga che RISPONDE**, non semplicemente la prima:
      su un elenco la cui prima riga ha la data vuota, guardare solo quella
      direbbe «questa colonna è testo» e le date si ordinerebbero come stringhe.
    */
    const numero = primoNonNullo(righe, (riga) => opzioni.numeroDi?.(riga, chiave.columnId));
    const data = primoNonNullo(righe, (riga) => opzioni.dataDi?.(riga, chiave.columnId));

    if (numero !== null) {
      return {
        read: (riga: T) => opzioni.numeroDi?.(riga, chiave.columnId) ?? Number.NEGATIVE_INFINITY,
        kind: 'number' as const,
        direction: chiave.direction,
      };
    }
    if (data !== null) {
      return {
        read: (riga: T) => opzioni.dataDi?.(riga, chiave.columnId) ?? '',
        kind: 'date' as const,
        direction: chiave.direction,
      };
    }

    /*
      ⭐ **Senza estrattore, un numero SCRITTO si ordina lo stesso** — chiesto dal
      proprietario il 01/09/2026: «considerare anche il segno negativo
      nell'ordinamento dei filtri e anche nell'ordinamento delle colonne».

      ⛔ **Il ripiego testuale su una colonna di importi è quasi casuale**:
      `localeCompare` mette «10,98 €» prima di «3,66 €» e «−25,00 €» dopo
      «10,00 €». Su una colonna di resi è il segno a sparire, cioè proprio
      l'informazione per cui la si guarda.

      ⚠️ **Solo se TUTTE le righe lette sono numeri**: con un «—» in mezzo il
      confronto dovrebbe decidere dove metterlo, e mescolerebbe due grammatiche.

      ⚠️ **Resta un ripiego, non un'alternativa**: dove l'estrattore c'è vince
      lui, perché legge il valore prima della formattazione — e quella può
      arrotondare.
    */
    const testi = campioni(righe, (riga) => opzioni.cellText(riga, chiave.columnId));
    if (sonoTuttiNumeri(testi)) {
      return {
        /*
          ⚠️ **L'assenza vale `-Infinity`, non `0`**, come sul percorso con
          estrattore qui sopra e come dichiara il motore di confronto che
          entrambi usano: «l'assenza deve stare a un estremo»
          (`sort-values.util`). Con `0` una riga col segnaposto finirebbe **fra i
          negativi e i positivi** — cioè in mezzo agli importi veri, dove sembra
          un dato invece che una mancanza.
        */
        read: (riga: T) =>
          numeroItaliano(opzioni.cellText(riga, chiave.columnId)) ?? Number.NEGATIVE_INFINITY,
        kind: 'number' as const,
        direction: chiave.direction,
      };
    }

    return {
      read: (riga: T) => opzioni.cellText(riga, chiave.columnId),
      kind: 'text' as const,
      direction: chiave.direction,
    };
  });

  return sortByKeys([...righe], daOrdinare, opzioni.valuta ?? 'EUR');
}

/**
 * Il primo valore non nullo che una colonna sa dare.
 *
 * ⚠️ **Si ferma presto**: bastano le prime righe per sapere di che tipo è la
 * colonna, e scorrere un elenco intero a ogni cambio di ordinamento sarebbe
 * lavoro fatto per niente.
 */
function primoNonNullo<T, V>(
  righe: readonly T[],
  leggi: (riga: T) => V | null | undefined,
): V | null {
  const quante = Math.min(righe.length, 20);
  for (let i = 0; i < quante; i += 1) {
    const valore = leggi(righe[i] as T);
    if (valore !== null && valore !== undefined) {
      return valore;
    }
  }
  return null;
}

/**
 * I testi delle prime righe, per capire di che tipo è la colonna.
 *
 * ⚠️ **Le celle vuote non entrano nel campione**: un «—» o una stringa vuota non
 * dicono niente sul tipo, e contarle come «non numero» spegnerebbe l'ordinamento
 * numerico su una colonna con una sola riga non compilata.
 */
function campioni<T>(righe: readonly T[], leggi: (riga: T) => string): readonly string[] {
  const quante = Math.min(righe.length, 20);
  const testi: string[] = [];
  for (let i = 0; i < quante; i += 1) {
    const testo = leggi(righe[i] as T).trim();
    /*
      ⚠️ **I segnaposto non decidono la grammatica della colonna**: un `—` è
      l'assenza di un valore, non un valore di un'altra specie. Riconosceva il
      solo trattino lungo; ora la domanda è quella comune di `segnaposto.util`,
      la stessa che usa l'elenco dei valori del filtro.
    */
    if (!senzaValore(testo)) {
      testi.push(testo);
    }
  }
  return testi;
}
