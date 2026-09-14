import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';

import { ViewportService } from '@core/services/viewport.service';

import { TableFiltersButtonComponent } from '@shared/components/table-filters/table-filters-button.component';
import { TableFiltersPanelComponent } from '@shared/components/table-filters/table-filters-panel.component';
import { TableSelectionToggleComponent } from '@shared/components/table-selection-toggle/table-selection-toggle.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { BackButtonComponent } from '@shared/components/back-button/back-button.component';
import { TableColumnPickerComponent } from '@shared/components/table-column-picker/table-column-picker.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';
import type { TableViewId } from '@shared/table-columns/table-column.model';

/**
 * ⭐ **Il telaio di una pagina elenco** (`14` §0, Fase G).
 *
 * ## Perché esiste — la misura, non un principio
 *
 * Censite le undici pagine elenco il 29/08/2026, **dopo** aver applicato i
 * contratti di geometria:
 *
 * ```text
 * ZONE                     SEGNALI DI STATO
 * testata    11 / 11       loading()            11 / 11
 * stati      11 / 11       error()              11 / 11
 * dati       11 / 11       isEmpty()            10 / 11
 * toolbar    10 / 11       app-table-skeleton   11 / 11
 * ```
 *
 * I quattro rami `@if (loading()) … @else if (error()) … @else if (isEmpty())
 * … @else` erano scritti **undici volte**, identici, con gli stessi componenti
 * nello stesso ordine e gli stessi nomi di segnale.
 *
 * ⭐ **Questo shell non impone una convenzione: ne formalizza una che esiste
 * già** — ed è la ragione per cui può prenderle tutte.
 *
 * ## Cosa NON fa, mai
 *
 * - ⛔ niente dominio, niente query, niente `if tipo documento` (`14` §59);
 * - ⛔ non decide colonne, filtri, metriche o permessi;
 * - ⛔ non conosce il renderer che ospita.
 *
 * ⭐ **Lo slot `[data]` accetta qualunque renderer** — `app-data-table`,
 * `corrispettivi-orders-table`, `product-table`. È la ragione per cui il
 * Registro Corrispettivi, che ha raggruppamenti e subtotali propri e non potrà
 * mai usare il motore tabella comune, può invece usare questo telaio.
 *
 * ## Cosa dà gratis
 *
 * La **catena di altezze** (`regole-stile-ui` §6): la pagina si adatta alla
 * finestra, testata e totali non si comprimono, cede solo l'area dati.
 *
 * ⛔ **Una pagina nuova non può più dimenticarsene**, perché non la scrive: la
 * eredita. È la differenza fra una guardia che *trova* l'errore e una struttura
 * che non lo *lascia esprimere*.
 *
 * ## ⚠️ Una conseguenza da conoscere
 *
 * Il contenuto proiettato in `[data]` viene **istanziato una volta**, non solo
 * quando il ramo dati è attivo: `@if` decide cosa si vede, non cosa esiste. Un
 * renderer proiettato qui deve quindi tollerare input vuoti durante il
 * caricamento — cosa che tutti i renderer dumb di VestiFlow già fanno, perché
 * ricevono `readonly rows = input<T[]>([])`.
 */
@Component({
  selector: 'app-list-page',
  host: {
    '[class.list-page--docked]': 'dockedFoot()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './list-page.component.html',
  styleUrl: './list-page.component.scss',
  imports: [
    TableSkeletonComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    TableColumnPickerComponent,
    TableFiltersButtonComponent,
    TableFiltersPanelComponent,
    TableSelectionToggleComponent,
    BackButtonComponent,
  ],
})
export class ListPageComponent {
  /**
   * ⭐ La stessa soglia che decide quale vista di riga è viva nel DOM
   * (`ViewportService`): sotto di essa non esistono intestazioni di colonna, e
   * i filtri diventano voci di un pannello (`regole-stile-ui` §5).
   *
   * ⛔ Non una media query scritta qui: la soglia è **una**, e sta nel token.
   */
  protected readonly compatto = inject(ViewportService).compact;

  /**
   * Aperto/chiuso del pannello compatto. Vive qui: nessuna pagina lo scrive.
   * Lo condividono il pulsante e il pannello (`app-table-filters-*`), che
   * stanno in due punti diversi della barra.
   */
  protected readonly pannelloAperto = signal(false);

  // ── Testata ───────────────────────────────────────────────────────────
  readonly pageTitle = input.required<string>();

  /**
   * Il tasto **Indietro**.
   *
   * ⭐ Segue una regola che le pagine già rispettavano senza che fosse scritta:
   * c'è quando le briciole di pane hanno un genitore. Misurato il 29/08/2026 —
   * sette pagine su undici ce l'hanno, e le quattro senza sono quelle di primo
   * livello (Prodotti, Clienti, Fornitori, Magazzino).
   */
  readonly showBack = input(false);
  /**
   * Dove torna l'Indietro quando non c'è una cronologia da cui risalire.
   *
   * ⚠️ Due pagine ne hanno bisogno — Ordini cliente e Ordini fornitore — perché
   *    si raggiungono dall'hub Documenti e non dalla barra laterale.
   */
  readonly backFallback = input<string>();
  /**
   * Il conteggio accanto al titolo — «18 ordini», «5 documenti».
   *
   * ⚠️ È una **stringa già composta**: singolare e plurale sono di dominio, e il
   *    telaio non deve saperne niente. Lo usano quattro pagine su undici.
   */
  readonly count = input<string>();

  /**
   * ⭐ **Descrizione per i soli lettori di schermo**, resa come `.sr-only`.
   *
   * ⚠️ **Non è il sottotitolo tolto il 29/08/2026**, e la distinzione conta:
   * quella decisione riguardava una riga VISIBILE che prendeva spazio in una
   * vista che serve a consultare. Qui non si occupa un pixel — si dice a chi la
   * pagina non la vede che cosa sta guardando.
   *
   * Il Registro Corrispettivi c'era già arrivato da solo, e senza questo campo
   * la migrazione al telaio gli avrebbe tolto l'unica descrizione che aveva.
   */
  readonly pageDescription = input<string>();

  // ── Stati — lo shell li POSSIEDE ──────────────────────────────────────
  readonly loading = input.required<boolean>();
  /** Il **messaggio** dell'errore, non l'`AppError`: lo shell non conosce il dominio. */
  readonly error = input<string | null>(null);
  readonly isEmpty = input(false);

  // ── Scheletro ─────────────────────────────────────────────────────────
  readonly skeletonColumns = input.required<number>();
  /** Otto righe: è il valore che nove pagine su undici usavano già. */
  readonly skeletonRows = input(8);

  /**
   * Lo stato vuoto standard.
   *
   * ⭐ **O si passa il titolo, o si proietta `[empty]`**, e la scelta è
   * dichiarativa: niente flag che possa contraddire il fatto proiettato.
   */
  readonly emptyTitle = input<string>();
  readonly emptyDescription = input<string>();
  readonly emptyIcon = input<string>('pi-inbox');
  /*
    ⛔ **Lo stato vuoto non ha una CTA** — decisione del proprietario del
    29/08/2026: «nel riquadro resta vuoto, e i tasti sono quelli già predisposti,
    Indietro e Nuovo in alto».

    Tre pagine su dieci ne avevano una, e duplicava un pulsante che sta già nella
    testata: chi apre un elenco vuoto ha «Nuovo» a due centimetri di distanza.
  */

  // ── Zona controlli — POSSEDUTA, non proiettata ────────────────────────
  /**
   * ⛔ **Era uno slot `[tools]` libero, e sarebbe stato inutile.**
   *
   * Misurate il 29/08/2026, le undici pagine avevano **quattro forme diverse**
   * di barra strumenti: chi in una card, chi coi filtri nudi, chi con
   * l'etichetta «Ricerca», chi dentro un componente proprio. Uno slot libero le
   * avrebbe lasciate diverse **per costruzione** — che è esattamente il difetto
   * che questo telaio esiste per chiudere.
   *
   * ⭐ **La pagina passa VALORI, non markup.** Dove c'è una ricerca dichiara il
   * suo segnaposto; dove c'è il selettore colonne dichiara la vista.
   *
   * ⚠️ Resta proiettato il solo **Periodo** (`[period]`), in posizione fissa: è
   * un controllo di dominio con preset e intervallo personalizzato, e il telaio
   * non deve conoscerlo. La sua POSIZIONE però non è negoziabile.
   */
  readonly searchPlaceholder = input<string>();
  readonly searchValue = input<string>('');
  readonly searchAriaLabel = input<string>();
  readonly columnsViewId = input<TableViewId>();
  /*
    ⛔ **Qui c'era `columnsReorderable`**, che il Registro Corrispettivi
    spegneva «perché le sue colonne hanno un ordine di lettura». Da oggi ce
    l'hanno TUTTE: l'ordine è quello dichiarato nel catalogo, e non esiste più
    un riordino da consentire o vietare.
  */

  /**
   * ⭐ **Se la riga strumenti si rende.** Accesa di default: ogni elenco ha
   * almeno un filtro o la ricerca.
   *
   * ⚠️ Si spegne solo dove NON c'è nessuna delle quattro cose che quella riga
   * ospita — ricerca, periodo, filtri, colonne. È il caso della maschera
   * «Cerca», che è una ricerca a invio con un risultato, non un elenco
   * filtrabile: una fascia vuota con dentro un «Filtri» che non filtra niente
   * sarebbe peggio di non averla.
   */
  readonly showTools = input(true);
  /**
   * Quanti filtri sono attivi adesso: diventa «Filtri (2)» sul pulsante.
   *
   * ⚠️ **Sono i filtri di DOMINIO**, quelli ancora proiettati in `[filters]`. I
   * filtri di colonna li conta il pulsante condiviso da sé — e i
   * due si sommano finché la migrazione non è finita.
   */
  readonly activeFilterCount = input(0);

  /**
   * ⭐ **Il piede diventa un DOCK sotto `lg`**: totali e comandi restano sempre
   * visibili, e a scorrere è la sola zona dati.
   *
   * ⛔ **Non è il comportamento predefinito**, e la ragione è misurata: dodici
   * pagine su tredici oggi mettono nel piede il solo **paginatore**, e un
   * paginatore ancorato in fondo allo schermo non è qualcosa che qualcuno abbia
   * chiesto. Chi vuole il dock lo dichiara.
   *
   * ⭐ **La struttura non richiede compensazioni**: il telaio resta una colonna
   * flessibile, la zona dati cede (`flex: 1; min-block-size: 0`) e il piede no
   * (`flex: 0 0 auto`). Quindi il piede **occupa spazio davvero** — l'ultima
   * riga scorre fino in fondo invece di finirgli sotto — e non serve né un
   * `padding-block-end` da tenere allineato a mano né un `ResizeObserver`.
   *
   * ⚠️ Sopra `lg` non cambia niente: il piede torna due zone del telaio come
   * prima.
   */
  /**
   * ⭐ **Il piede resta in fondo allo schermo sotto `lg`** — acceso per tutti dal
   * 31/08/2026, su indicazione del proprietario: «dovrebbe essere fissa a tutti
   * per avere sempre totali e funzioni a portata di mano».
   *
   * ⛔ **Nasceva spento**, e la ragione era questa: «dodici pagine su tredici oggi
   * mettono nel piede solo il paginatore, e un paginatore ancorato non è qualcosa
   * che qualcuno abbia chiesto».
   *
   * ⭐ **Quella premessa non vale più.** Il paginatore non esiste più su nessun
   * elenco (30/08), e al suo posto il piede porta ora la **riga totali** e la
   * **barra comandi** — cioè esattamente le due cose che devono restare a portata
   * di mano mentre si scorre.
   *
   * ⚠️ **Resta un `input`**, non una costante: una schermata che nel piede non
   * mette niente non ha motivo di riservargli spazio, e va potuta spegnere.
   */
  readonly dockedFoot = input(true);

  /**
   * ⭐ **L'elenco si può selezionare?** Acceso, il telaio rende il pulsante
   * «Seleziona» sotto `lg` — dove le righe sono card e la colonna di caselle
   * non c'è.
   *
   * ⚠️ **Nasce spento.** Un elenco che non ha azioni di selezione mostrerebbe un
   * comando che non porta da nessuna parte.
   */
  readonly selectionToggleable = input(false);

  /**
   * ⭐ **La modalità, two-way.** Lo stato resta della pagina — è lei a possedere
   * la selezione vera — e il telaio si limita a commutarlo.
   *
   * ⛔ **Chi lo riceve deve AZZERARE la selezione quando si spegne**, ed è la
   * ragione per cui esiste `createSelectionMode`: a modalità spenta il tocco
   * torna ad aprire la riga e non resta nessun gesto per deselezionare.
   */
  readonly selectionMode = model(false);

  /**
   * ⭐ **«Azzera filtri» del pannello compatto.** Esplicito, mai un effetto
   * collaterale della chiusura.
   *
   * ⛔ Chiudere il pannello NON azzera: chi apre i filtri, li imposta e preme
   * «Vedi risultati» perderebbe esattamente quello che ha appena scelto.
   */
  readonly filtersCleared = output<void>();

  readonly searchChange = output<string>();

  protected onSearch(evento: Event): void {
    this.searchChange.emit((evento.target as HTMLInputElement).value);
  }

  readonly retry = output<void>();
}
