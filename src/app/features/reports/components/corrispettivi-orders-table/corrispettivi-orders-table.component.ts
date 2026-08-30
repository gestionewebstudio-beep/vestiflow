import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { formatDate } from '@core/utils/date.util';
import { formatMoney } from '@core/utils/money.util';
import type { BadgeTone } from '@shared/components/badge/badge.component';
import { DataTableCellDirective } from '@shared/components/data-table/data-table-cell.directive';
import { DataTableRowCardDirective } from '@shared/components/data-table/data-table-row-card.directive';
import { DataTableComponent } from '@shared/components/data-table/data-table.component';
import type { DataTableSelectionEvent } from '@shared/components/data-table/data-table.component';
import { nextSort } from '@shared/components/data-table/data-table.model';
import type {
  DataTableRowTone,
  DataTableSection,
  DataTableSort,
} from '@shared/components/data-table/data-table.model';
import type { ResolvedTableColumn } from '@shared/table-columns/table-column.model';

import {
  LOCATION_UNDETERMINED_LABEL,
  corrispettivoSourceLabel,
} from '../../models/corrispettivi-labels.util';
import {
  type CorrispettiviRefundKind,
  type CorrispettiviRegisterRow,
  type CorrispettiviTotaliGiornata,
} from '../../models/corrispettivi.model';

const FINANCIAL_LABELS: Record<string, string> = {
  pending: 'In attesa',
  authorized: 'In attesa',
  paid: 'Pagato',
  partially_refunded: 'Rimborso parziale',
  refunded: 'Rimborsato',
  voided: 'Annullato',
};

const FINANCIAL_TONES: Record<string, BadgeTone> = {
  pending: 'warning',
  authorized: 'warning',
  paid: 'success',
  partially_refunded: 'warning',
  refunded: 'neutral',
  voided: 'error',
};

/**
 * Cosa è stata la rettifica, detto con le parole dell'operatore.
 *
 * «Reso» e «Rimborso» sono cose diverse e vanno chiamate diversamente: nel
 * primo caso la merce è tornata, nel secondo sono tornati solo i soldi. Chi
 * legge il registro deve poterlo distinguere senza aprire l'ordine.
 */
const REFUND_KIND_LABELS: Record<CorrispettiviRefundKind, string> = {
  return_with_restock: 'Reso',
  refund_only: 'Rimborso',
  cancellation: 'Annullamento',
};

/**
 * ⭐ **Il Registro sul MOTORE COMUNE** — 30/08/2026.
 *
 * ⛔ Qui c'erano 483 righe di `<table>` scritto a mano: intestazioni
 * ordinabili, `@for` sulle righe, `colspan` calcolati, e la card mobile. Con
 * Clienti, Fornitori, Prodotti, Giacenze e Situazione era una delle **sei**
 * tabelle fuori dal motore, e la conseguenza si vedeva: nessuna casella di
 * selezione, quindi nessuna delle azioni contestuali che ogni altro elenco ha.
 *
 * Ora resta qui **solo ciò che è del REGISTRO**: quali celle non sono testo,
 * come si vestono, come si raggruppa per giornata, e la card compatta. Lo
 * scheletro — `thead`, `tbody`, selezione, ordinamento, ridimensionamento — lo
 * rende il motore, come per Documenti e Ordini cliente.
 *
 * ⭐ **La card compatta NON cambia di un pixel**, ed è la ragione per cui la
 * migrazione ha aspettato: il ripiego del motore trasforma ogni cella in una
 * riga «etichetta … valore», e con dieci colonne dà dieci righe tutte dello
 * stesso peso — il difetto che `regole-stile-ui` §6 vieta. La direttiva
 * `appRowCard` esisteva già apposta, e il Registro è il suo **primo
 * consumatore**, come la sua documentazione prevedeva.
 */
@Component({
  selector: 'app-corrispettivi-orders-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataTableComponent, DataTableCellDirective, DataTableRowCardDirective],
  templateUrl: './corrispettivi-orders-table.component.html',
  styleUrl: './corrispettivi-orders-table.component.scss',
})
export class CorrispettiviOrdersTableComponent {
  readonly rows = input.required<readonly CorrispettiviRegisterRow[]>();

  /** Se l'operatore può aprire un Corrispettivo manuale per modificarlo. */
  readonly canEditManual = input(false);

  /**
   * Le colonne visibili, **risolte**.
   *
   * ⚠️ Era `readonly string[]` di soli id, e il componente le filtrava a mano
   * con `isVisible()`. Il motore vuole le colonne intere — larghezza,
   * ancoraggio, ordine — e le sa disegnare da sé: la tabella smette di
   * riscriverle e la pagina smette di scartarle prima di passarle.
   */
  readonly columns = input<readonly ResolvedTableColumn[]>([]);

  readonly manualReceiptOpened = output<string>();

  /** I subtotali di giornata, dall'API. Non si ricalcolano da ciò che si vede. */
  readonly perGiornata = input<readonly CorrispettiviTotaliGiornata[]>([]);

  readonly raggruppaPerGiorno = input(false);

  readonly sort = input<readonly DataTableSort[]>([]);
  readonly sortChange = output<readonly DataTableSort[]>();

  /*
    ⭐ **La selezione ATTRAVERSA questo componente, non ci vive.**

    La tabella è dumb (`regole-architettura`, Smart/Dumb): riceve quali righe sono
    scelte e dice quando l'utente ne tocca una. Lo STATO sta nella pagina, che è
    l'unica a sapere cosa farne — e ad avere il servizio che lo restringe quando
    cambiano filtri o periodo.

    ⚠️ È lo stesso schema di `supplier-order-list`, che la selezione ce l'ha da
    prima: un secondo modo di farla avrebbe reso i due elenchi diversi proprio
    nel comportamento che questo lavoro esiste per unificare.
  */
  readonly selectedIds = input<ReadonlySet<string>>(new Set<string>());
  readonly selectionChange = output<DataTableSelectionEvent<CorrispettiviRegisterRow>>();
  readonly selectAllChange = output<boolean>();

  /*
    ⛔ **NON si costruisce da `rowLabel`**, ed è l'errore che ho fatto scrivendola:
    quella è l'etichetta di un'AZIONE — «Apri il corrispettivo manuale n. #1009» —
    e composta dava «Seleziona Apri il corrispettivo manuale n. #1009».

    ⭐ Una casella di selezione nomina **la riga**, non cosa succede premendola.
    Il difetto l'ha trovato un test che asserisce tutt'altro, leggendo l'attributo
    nel messaggio di errore: senza quello sarebbe finito a schermo — anzi, in uno
    screen reader, dove nessuno l'avrebbe visto.
  */
  protected readonly selectionLabel = (row: CorrispettiviRegisterRow): string =>
    `Seleziona la registrazione n. ${row.orderNumber}`;

  /**
   * ⛔ **A raggruppamento acceso non si ordina.** Le giornate sono una piegatura
   * dell'elenco già ordinato: un secondo criterio spezzerebbe i gruppi, e una
   * riga finirebbe sotto l'intestazione sbagliata.
   */
  protected readonly ordinabile = computed(() => !this.raggruppaPerGiorno());

  protected onSort(prossimo: readonly DataTableSort[]): void {
    if (!this.ordinabile()) {
      return;
    }
    this.sortChange.emit(prossimo);
  }

  /** Il motore emette l'id della colonna premuta; il ciclo lo decide il modello. */
  protected onSortColumn(columnId: string): void {
    this.onSort(nextSort(this.sort(), columnId));
  }

  /*
    ⛔ **QUI C'ERA IL TRONCAMENTO A 25 RIGHE, ed è stato tolto** — deciso dal
    proprietario il 30/08/2026:

    > «Non deve esserci nessun limite di visualizzazione. Se il cliente ha il
    > filtro di 30 giorni, deve sapere vedere il totale di quel periodo, anche
    > se si tratta di vedere mille ordini. **Questo vale ovunque.**»

    ⚠️ **Il motivo scritto qui era esatto ma non bastava.** Diceva — e restava
    vero — che i totali arrivano dall'API e coprono l'intero periodo, quindi
    troncare l'elenco non li spostava di un centesimo. Il difetto era un altro:
    **chi guarda non può saperlo.** Un registro che mostra una parte delle righe
    non è verificabile, e in un registro fiscale la verificabilità è la funzione,
    non un di più.

    ⭐ **Il problema che il troncamento risolveva resta**, ed è risolto meglio:
    il riepilogo e i comandi sono ANCORATI in fondo allo schermo sotto `lg`
    (`list-page.component.scss`). Non si scorre per vederli — sono sempre lì —
    e le righe si scorrono tutte, quante sono.

    ⚠️ **Con mille righe questo diventa mille card nel DOM**, ed è la ragione per
    cui la virtualizzazione del motore tabella smette di essere un'ottimizzazione
    e diventa un prerequisito (`docs/DA-FARE.md`).
  */

  // ── Le sezioni: il raggruppamento per giornata, nella forma del motore ────

  /**
   * ⭐ **Il raggruppamento è una SEZIONE del motore**, non un markup nostro.
   *
   * `DataTableSection` porta già intestazione e piede: l'intestazione è il
   * giorno per esteso, il piede il suo subtotale. Erano due `<tr>` speciali
   * scritti a mano con i `colspan` calcolati a parte — e i `colspan` erano il
   * pezzo più fragile, perché andavano rifatti a ogni colonna accesa o spenta.
   *
   * ⚠️ **Le giornate non riordinano**: sono una piegatura dell'elenco già
   * ordinato, quindi qui si taglia soltanto. Righe della stessa giornata sono
   * già contigue.
   *
   * ⚠️ **I subtotali restano quelli dell'API**: sono
   * addendi del totale del periodo, non somme di ciò che si vede.
   */
  protected readonly sections = computed<readonly DataTableSection<CorrispettiviRegisterRow>[]>(
    () => {
      const righe = this.rows();
      if (!this.raggruppaPerGiorno()) {
        return [{ id: 'tutte', rows: righe }];
      }

      const totaliPerGiorno = new Map(this.perGiornata().map((g) => [g.giorno, g]));
      const gruppi: DataTableSection<CorrispettiviRegisterRow>[] = [];

      for (const riga of righe) {
        const giorno = riga.occurredAt.slice(0, 10);
        const ultimo = gruppi.at(-1);
        if (ultimo && ultimo.id === giorno) {
          (ultimo.rows as CorrispettiviRegisterRow[]).push(riga);
          continue;
        }
        const totali = totaliPerGiorno.get(giorno);
        gruppi.push({
          id: giorno,
          header: formatDate(giorno),
          rows: [riga],
          ...(totali
            ? {
                footer: {
                  label: `Totale ${formatDate(giorno)}`,
                  // Su un registro la domanda del gruppo è «quanto ha fatto
                  // quella giornata»: la risposta è il Totale, non l'imponibile.
                  emphasis: 'total',
                  values: {
                    taxable: formatMoney(totali.taxable),
                    tax: formatMoney(totali.tax),
                    total: formatMoney(totali.total),
                  },
                },
              }
            : {}),
        });
      }
      return gruppi;
    },
  );

  // ── Il contratto del motore ───────────────────────────────────────────────

  /**
   * La colonna è accesa?
   *
   * ⚠️ **Serve alla sola CARD.** Le celle della tabella non la usano più: le
   * colonne spente non arrivano nemmeno, perché il motore disegna solo quelle
   * che riceve. La card invece non è fatta di colonne — è un disegno suo — e
   * deve sapere cosa il selettore Colonne ha spento, o mostrerebbe un dato che
   * l'operatore ha tolto.
   *
   * ⛔ Era `isVisible()` e leggeva un input di soli id, che la pagina calcolava
   * a parte: due fonti per la stessa verità. Ora legge le colonne che il motore
   * ha già ricevuto.
   */
  protected visibile(columnId: string): boolean {
    return this.columns().some((column) => column.id === columnId);
  }

  protected readonly rowId = (row: CorrispettiviRegisterRow): string => row.rowId;

  protected readonly rowLabel = (row: CorrispettiviRegisterRow): string =>
    `Apri il corrispettivo manuale n. ${row.orderNumber}`;

  /** Solo i Corrispettivi manuali si aprono, e solo con il permesso. */
  protected readonly apribile = (row: CorrispettiviRegisterRow): boolean =>
    Boolean(row.manualReceiptId) && this.canEditManual();

  /**
   * ⭐ **La rettifica si legge dal TONO della riga**, che ora è del motore.
   *
   * Era `.corrispettivi-table__row--refund` qui dentro: fondo tenue e importi
   * in rosso. Non è del Registro — ogni elenco con movimenti in due versi ne ha
   * bisogno — quindi è salito, e questa riga è ciò che resta.
   */
  protected readonly rowTone = (row: CorrispettiviRegisterRow): DataTableRowTone =>
    row.kind === 'refund' ? 'negative' : 'positive';

  /**
   * ⚠️ **Anche le vendite dichiarano il verso**, e non è pignoleria: sulla card
   * l'accento laterale verde dice «è entrata» prima che si legga la parola. Un
   * elenco che non distingue i versi restituisce `null` e non prende accento —
   * qui i versi ci sono entrambi, quindi si dichiarano entrambi.
   */

  protected onRowClick(row: CorrispettiviRegisterRow): void {
    if (row.manualReceiptId && this.canEditManual()) {
      this.manualReceiptOpened.emit(row.manualReceiptId);
    }
  }

  /**
   * ⭐ **Il testo di una cella sta QUI, una volta sola**: il motore lo usa per la
   * tabella, per il ripiego a card e per il titolo delle celle troncate. Un
   * template che rendesse un testo diverso sarebbe una seconda verità.
   */
  protected readonly cellText = (row: CorrispettiviRegisterRow, columnId: string): string => {
    switch (columnId) {
      case 'occurredAt':
        return formatDate(row.occurredAt);
      case 'kind':
        return row.kind === 'refund' ? this.refundLabel(row.refundKind) : 'Vendita';
      case 'orderNumber':
        return row.orderNumber;
      case 'customerName':
        return row.customerName || '—';
      case 'source':
        return corrispettivoSourceLabel(row.source);
      case 'location':
        return row.locationName ?? LOCATION_UNDETERMINED_LABEL;
      case 'financialStatus':
        return row.financialStatus ? this.financialLabel(row.financialStatus) : '—';
      case 'taxable':
        return formatMoney(row.taxable);
      case 'tax':
        return formatMoney(row.tax);
      case 'total':
        return formatMoney(row.total);
      default:
        return '';
    }
  };

  // ── Etichette e vesti, che restano del Registro ───────────────────────────

  protected readonly formatMoney = formatMoney;
  protected readonly formatDate = formatDate;
  protected readonly locationUndeterminedLabel = LOCATION_UNDETERMINED_LABEL;
  protected readonly sourceLabel = corrispettivoSourceLabel;

  protected financialLabel(status: string): string {
    return FINANCIAL_LABELS[status] ?? status;
  }

  protected financialTone(status: string): BadgeTone {
    return FINANCIAL_TONES[status] ?? 'neutral';
  }

  protected refundLabel(kind: CorrispettiviRefundKind | undefined): string {
    return kind ? REFUND_KIND_LABELS[kind] : 'Rettifica';
  }
}
