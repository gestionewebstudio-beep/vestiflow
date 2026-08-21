import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { ViewportService } from '@core/services/viewport.service';
import { formatDate } from '@core/utils/date.util';
import { formatMoney } from '@core/utils/money.util';
import type { BadgeTone } from '@shared/components/badge/badge.component';

import {
  type CorrispettiviRefundKind,
  type CorrispettiviRegisterRow,
  type CorrispettiviTotaliGiornata,
} from '../../models/corrispettivi.model';
import {
  ariaSortOf,
  nextSort,
  sortDirectionOf,
  type DataTableSort,
} from '@shared/components/data-table/data-table.model';
import {
  LOCATION_UNDETERMINED_LABEL,
  corrispettivoSourceLabel,
} from '../../models/corrispettivi-labels.util';

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
 * Come si chiama l'origine di una riga del registro.
 *
 * ⚠️ `shopify_pos` diceva «Negozio», che è il negozio di **Shopify**, non
 * quello di VestiFlow — e `store`, che è davvero la cassa di VestiFlow,
 * mancava del tutto perché la Vendita al banco nel registro non ci entrava.
 */

/** La sede che manca non è una sede: si dice, non si lascia in bianco. */

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

@Component({
  selector: 'app-corrispettivi-orders-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Nessuna pill: tipo e pagamento si leggono dal colore del testo. Il tono
  // resta il vocabolario condiviso (`BadgeTone`), è il riquadro che se ne va.
  imports: [NgTemplateOutlet],
  templateUrl: './corrispettivi-orders-table.component.html',
  styleUrl: './corrispettivi-orders-table.component.scss',
})
export class CorrispettiviOrdersTableComponent {
  readonly rows = input.required<readonly CorrispettiviRegisterRow[]>();
  /**
   * L'operatore può correggere una registrazione manuale? Governa il solo
   * pulsante: il permesso vero sta sull'API, e nasconderlo qui è ergonomia.
   */
  readonly canEditManual = input(false);

  /**
   * Le colonne accese, dal selettore Colonne della pagina.
   *
   * Il componente resta **dumb**: non conosce le preferenze né il servizio che
   * le tiene — riceve un elenco e lo rispetta. Vuoto significa «tutte», così la
   * stampa, che un selettore non ce l'ha, non deve saperne niente.
   */
  readonly visibleColumns = input<readonly string[]>([]);

  /** Apertura di una registrazione manuale in modifica. */
  readonly manualReceiptOpened = output<string>();

  /**
   * I subtotali per giornata, **quando il raggruppamento è acceso**.
   *
   * ⚠️ Arrivano dall'API e non si ricalcolano qui: sono addendi del totale del
   * periodo, prodotti dallo stesso accumulatore. Sommare le righe a schermo per
   * ottenerli sarebbe la seconda matematica che la specifica vieta — e
   * basterebbe un arrotondamento diverso perché il piede della giornata non
   * facesse più il totale in fondo alla pagina.
   */
  readonly perGiornata = input<readonly CorrispettiviTotaliGiornata[]>([]);

  /** Vista raggruppata per giornata economica. */
  readonly raggruppaPerGiorno = input(false);

  /**
   * Le chiavi di ordinamento correnti. Lo stato sta nella PAGINA (`14` §H4):
   * qui si rende e si emette il prossimo, non si decide.
   */
  readonly sort = input<readonly DataTableSort[]>([]);

  readonly sortChange = output<readonly DataTableSort[]>();

  /**
   * ⛔ **L'intestazione si preme solo con «Raggruppa: Nessuno»** (`10` §20,
   * deciso il 20/08/2026). Col raggruppamento acceso il Registro tiene il suo
   * ordine canonico per giornata: il raggruppamento **è già** una forma di
   * ordinamento strutturato, e sovrapporgliene un altro romperebbe subtotali e
   * piedi di giornata per una capacità che nessuno ha chiesto.
   *
   * ⚠️ **I filtri restano attivi in entrambi i casi**: si applicano prima del
   * raggruppamento, e quello che si vede sono le righe filtrate — comunque
   * raggruppate per giorno.
   */
  protected readonly ordinabile = computed(() => !this.raggruppaPerGiorno());

  /** Il verso corrente di una colonna, per la freccia e per `aria-sort`. */
  protected verso(columnId: string): 'asc' | 'desc' | null {
    return sortDirectionOf(this.sort(), columnId);
  }

  protected ariaSort(columnId: string): string {
    return ariaSortOf(this.sort(), columnId);
  }

  /** Il prossimo stato lo calcola la primitiva comune: il ciclo è quello. */
  protected onSort(columnId: string): void {
    if (!this.ordinabile()) {
      return;
    }
    this.sortChange.emit(nextSort(this.sort(), columnId));
  }

  private readonly viewport = inject(ViewportService);

  /**
   * Quante righe si mostrano su schermo compatto prima di fermarsi.
   *
   * ⚠️ **È un limite di VISUALIZZAZIONE, non di dati.** I totali — riepilogo
   * del periodo, subtotali di giornata, conteggio righe — arrivano tutti
   * dall'API e non si ricalcolano da ciò che è a schermo: troncare l'elenco
   * non può spostarli di un centesimo. È la ragione per cui questo taglio è
   * ammissibile in un registro fiscale, dove nascondere un dato dal conteggio
   * sarebbe il difetto peggiore possibile.
   *
   * Il motivo del taglio è che il riepilogo sta in FONDO: con un mese di
   * vendite su un telefono, arrivarci significa scorrere centinaia di card.
   */
  private static readonly RIGHE_INIZIALI_COMPATTO = 25;

  private readonly _tutteLeRighe = signal(false);

  /**
   * L'elenco è troncato? Solo su schermo compatto, solo finché non lo si apre,
   * e solo se le righe superano davvero la soglia.
   */
  protected readonly troncato = computed(
    () =>
      this.viewport.compact() &&
      !this._tutteLeRighe() &&
      this.rows().length > CorrispettiviOrdersTableComponent.RIGHE_INIZIALI_COMPATTO,
  );

  /** Quante righe restano fuori: il pulsante le dichiara invece di alludervi. */
  protected readonly righeNascoste = computed(() =>
    this.troncato()
      ? this.rows().length - CorrispettiviOrdersTableComponent.RIGHE_INIZIALI_COMPATTO
      : 0,
  );

  /**
   * Le righe effettivamente disegnate. Su desktop è sempre l'elenco intero: lì
   * la tabella è densa e scorrere trecento righe costa un gesto, non un
   * minuto.
   */
  protected readonly righeVisibili = computed(() =>
    this.troncato()
      ? this.rows().slice(0, CorrispettiviOrdersTableComponent.RIGHE_INIZIALI_COMPATTO)
      : this.rows(),
  );

  protected mostraTutte(): void {
    this._tutteLeRighe.set(true);
  }

  /**
   * Le righe divise per giornata, **senza riordinarle**.
   *
   * È una piegatura dell'elenco già ordinato: le righe arrivano in ordine
   * canonico e quelle di una stessa giornata sono già contigue, quindi qui si
   * taglia soltanto. Riordinare sarebbe un secondo criterio che potrebbe
   * divergere dal primo — una riga sotto l'intestazione sbagliata.
   */
  protected readonly giornate = computed(() => {
    const totaliPerGiorno = new Map(this.perGiornata().map((g) => [g.giorno, g]));
    const gruppi: {
      giorno: string;
      righe: CorrispettiviRegisterRow[];
      totali?: CorrispettiviTotaliGiornata;
    }[] = [];

    // Le righe già troncate: raggruppato o no, a schermo ne compaiono le
    // stesse. I subtotali di giornata restano quelli dell'API — sono addendi
    // del totale del periodo, non somme di ciò che si vede.
    for (const riga of this.righeVisibili()) {
      const giorno = riga.occurredAt.slice(0, 10);
      const ultimo = gruppi.at(-1);
      if (ultimo && ultimo.giorno === giorno) {
        ultimo.righe.push(riga);
      } else {
        gruppi.push({ giorno, righe: [riga], totali: totaliPerGiorno.get(giorno) });
      }
    }
    return gruppi;
  });

  /** Tutte le colonne accese: il `colspan` dell'intestazione di giornata. */
  protected readonly colonneTotali = computed(
    () =>
      [
        'occurredAt',
        'kind',
        'orderNumber',
        'customerName',
        'source',
        'location',
        'financialStatus',
        'taxable',
        'tax',
        'total',
      ].filter((id) => this.isVisible(id)).length,
  );

  /** Quante colonne stanno a sinistra di «Imponibile»: serve al `colspan`. */
  protected readonly colonneDescrittive = computed(
    () =>
      [
        'occurredAt',
        'kind',
        'orderNumber',
        'customerName',
        'source',
        'location',
        'financialStatus',
      ].filter((id) => this.isVisible(id)).length,
  );

  protected giornoEsteso(giorno: string): string {
    return formatDate(giorno);
  }

  protected readonly formatMoney = formatMoney;
  protected readonly formatDate = formatDate;
  protected readonly locationUndeterminedLabel = LOCATION_UNDETERMINED_LABEL;

  /** Elenco vuoto = nessuna preferenza: si mostrano tutte. */
  protected isVisible(columnId: string): boolean {
    const visible = this.visibleColumns();
    return visible.length === 0 || visible.includes(columnId);
  }

  /**
   * Questa riga si apre? Solo le registrazioni manuali hanno una maschera dove
   * andare, e solo a chi può correggerle. Governa insieme mano, `tabindex` ed
   * etichetta: un solo predicato, così non può esistere una riga che si apre
   * col mouse ma non da tastiera.
   */
  protected isOpenable(row: CorrispettiviRegisterRow): boolean {
    return Boolean(row.manualReceiptId) && this.canEditManual();
  }

  protected openRow(row: CorrispettiviRegisterRow): void {
    if (row.manualReceiptId && this.canEditManual()) {
      this.manualReceiptOpened.emit(row.manualReceiptId);
    }
  }

  /** Spazio apre come Invio, ma prima trattiene lo scorrimento della pagina. */
  protected onRowSpace(row: CorrispettiviRegisterRow, event: Event): void {
    if (!this.isOpenable(row)) return;
    event.preventDefault();
    this.openRow(row);
  }

  protected sourceLabel(source: string): string {
    return corrispettivoSourceLabel(source);
  }

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
