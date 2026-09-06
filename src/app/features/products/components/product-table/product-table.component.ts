import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import type { SortOrder } from '@core/models/api.model';
import type { ProductStatus } from '@core/models/product.model';
import { formatMoney } from '@core/utils/money.util';
import type { Product } from '@core/models/product.model';
import { ShopifySyncStatus } from '@core/models/shopify.model';
import { colonnaVisibile, valoreCard } from '@shared/models/list-card-fields.util';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import type { BadgeTone } from '@shared/components/badge/badge.component';
import { DataTableCellDirective } from '@shared/components/data-table/data-table-cell.directive';
import { DataTableRowCardDirective } from '@shared/components/data-table/data-table-row-card.directive';
import { DataTableComponent } from '@shared/components/data-table/data-table.component';
import type {
  DataTableSection,
  DataTableSort,
  DataTableTotals,
} from '@shared/components/data-table/data-table.model';
import { totaliDiElenco } from '@shared/models/list-totals.util';
import { createColumnFilters } from '@shared/table-columns/column-filters';
import type { ResolvedTableColumn, TableViewId } from '@shared/table-columns/table-column.model';

import {
  catalogOriginShortLabel,
  catalogOriginTone,
} from '@domain/products/models/catalog-origin.util';
import { productDisplayCategoryShort } from '../../models/product-display.util';
import { TRASH_LABEL, TRASH_TONE, isInTrash } from '@domain/products/models/product-lifecycle.util';
import { productStatusLabel, productStatusTone } from '@domain/products/models/product-status.util';
import type { ProductSortField } from '@domain/products/models/product-list-query.model';

/**
 * ⭐ **Le colonne che questo elenco sa ordinare**, e sono quelle che l'API sa
 * ordinare — non una in più.
 *
 * ⚠️ **L'ordinamento è del SERVER**: `sortChange` risale fino alla query, e il
 * motore rende solo l'affordance.
 *
 * ⛔ **Qui c'era «l'elenco prodotti PAGINA»**, e non è più vero dal 30/08/2026:
 * la pagina chiede `tutto: true` e non ha paginatore. La distinzione non è
 * accademica — è la premessa che rende corretto filtrare le righe caricate
 * (`14` §0.2). Su un elenco davvero paginato quel filtro restringerebbe una
 * pagina e chiamerebbe il risultato «l'elenco».
 */
const PRODUCT_SORTABLE_COLUMNS: ReadonlySet<string> = new Set([
  'name',
  'brand',
  'category',
  'season',
  'status',
]);

/**
 * Tabella prodotti (dumb puro): mostra le righe, espone il clic e le richieste
 * di ordinamento.
 *
 * ⭐ **Lo scheletro è del motore comune** dal 30/08/2026. Qui restano le sole
 * cose che sono DI QUESTA schermata: quali celle non sono testo, e i due comandi
 * di riga.
 *
 * ⛔ **Prima erano 243 righe di markup** che rifacevano intestazioni ordinabili,
 * casella di selezione, ripiego mobile e un `@if (showColumn(...))` per ogni
 * cella — tutte cose che il motore fa per sette elenchi. La differenza non è la
 * lunghezza: è che una correzione al motore adesso arriva anche qui.
 */
@Component({
  selector: 'app-product-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent, DataTableComponent, DataTableCellDirective, DataTableRowCardDirective],
  templateUrl: './product-table.component.html',
  styleUrl: './product-table.component.scss',
})
export class ProductTableComponent {
  readonly products = input.required<readonly Product[]>();

  /**
   * ⭐ **Sotto `lg` il tocco SELEZIONA invece di aprire**, quando la modalità
   * «Seleziona» del telaio è accesa.
   *
   * ⚠️ Input di passaggio: la tabella non decide, inoltra al motore. La modalità
   * la possiede la pagina (`createSelectionMode`), che è anche l'unica a poter
   * azzerare la selezione quando si spegne.
   */
  readonly rowClickSelects = input(false);
  readonly columns = input.required<readonly ResolvedTableColumn[]>();

  /** La vista, e con essa i filtri di colonna (`14` §0.2). */
  readonly viewId = input<TableViewId>();
  readonly sortField = input<ProductSortField>();
  readonly sortOrder = input<SortOrder>();
  readonly selectedProductIds = input<ReadonlySet<string>>(new Set<string>());

  readonly rowClick = output<Product>();
  readonly sortChange = output<ProductSortField>();
  readonly selectionToggle = output<{ readonly productId: string; readonly selected: boolean }>();
  readonly selectAllToggle = output<boolean>();

  /*
    ⛔ **`select` NON è una colonna di dati**, e passarla al motore ne renderebbe
    una vuota: la colonna di selezione la disegna il motore da sé
    (`selectionMode`), fuori dal modello — «non è una colonna del MODELLO: non
    compare nel selettore colonne, non si ridimensiona e non si ordina».

    ⚠️ **Nel modello di questo elenco c'è ancora**, ed è un residuo del tempo in
    cui la tabella era scritta a mano. Resta nel selettore Colonne e continua ad
    accendere e spegnere quello che accendeva prima — vedi `selezionabile` —
    così la migrazione non cambia di una riga quello che l'operatore vede.

    ⏸ **Se debba restare una voce del selettore è una decisione aperta**: gli
    altri sei elenchi sul motore non ce l'hanno, e tre preset di questo
    (Contabile, Fornitore, Analisi) non la includono — quindi con quei preset
    non c'è casella di selezione affatto.

    ⭐ `actions` invece è **sparita dal modello**: i suoi due comandi sono passati
    alla barra in basso (30/08/2026), quindi non c'è più niente da accendere.
  */
  protected readonly engineColumns = computed<readonly ResolvedTableColumn[]>(() =>
    this.columns()
      .filter((column) => column.id !== 'select')
      .map((column) => ({
        ...column,
        sortable: PRODUCT_SORTABLE_COLUMNS.has(column.id),
      })),
  );

  protected readonly selezionabile = computed(() => colonnaVisibile(this.columns(), 'select'));

  /*
    ⭐ **I filtri di colonna** (`14` §0.2).

    ⚠️ **Il prezzo si confronta in unità MINORI**, non sul testo: «1.250,00 €»
    come stringa sta dopo «9,00 €». E un prodotto senza prezzo dà `null`, che
    per contratto lascia passare la riga invece di escluderla in silenzio.
  */
  private readonly righe = createColumnFilters({
    viewId: this.viewId,
    righe: this.products,
    cellText: (product, columnId) => this.cellText(product, columnId),
    numeroDi: (product, columnId) => {
      switch (columnId) {
        case 'variants':
          return this.variantCount(product);
        case 'sellingPrice':
          return product.sellingPrice?.amountMinor ?? null;
        default:
          return null;
      }
    },
  });

  /** Lista piatta: una sezione senza intestazione né piede. */
  protected readonly sections = computed<readonly DataTableSection<Product>[]>(() => [
    { id: 'prodotti', rows: this.righe() },
  ]);

  /*
    ⭐ **La riga totali di questo elenco è quasi tutta conteggio**, ed è un fatto
    del catalogo prodotti, non un limite: delle sue colonne l'unica che si somma
    è **Varianti**. Le altre sono nomi, categorie e stati — cose che non hanno un
    totale.

    ⚠️ **Resta comunque**: la regola dice che la riga non sparisce mai, e «50
    voci» è il dato che l'operatore cerca per primo quando filtra.
  */
  protected readonly totals = computed<DataTableTotals>(() =>
    totaliDiElenco(this.righe(), {
      rowId: this.rowId,
      selectedIds: this.selectedProductIds(),
      columns: this.engineColumns(),
      campi: {
        variants: {
          valore: (product) => this.variantCount(product),
          formato: (n) => String(n),
        },
        /*
          ⛔ **QUI SI SOMMAVA IL PREZZO, e non voleva dire niente.**

          Segnalato dal proprietario il 31/08/2026: _«non c'entra nulla il totale
          economico con i prodotti»_. La riga totali mostrava «PREZZO 238,21 €» —
          la somma dei listini di cinquanta articoli, che non è il valore del
          magazzino, non è un fatturato e non è il prezzo di niente.

          ⚠️ **La giustificazione che avevo scritto era debole e l'ho lasciata a
          futura memoria**: «vale come cifra di controllo su una selezione». Una
          cifra di controllo che nessuno controlla è un numero in più su una riga
          che si legge tutto il giorno.

          ⭐ **Un catalogo somma i CONTEGGI, non i prezzi.** Quante voci, quante
          varianti: sono domande vere. Il valore a magazzino sarebbe
          prezzo × giacenza — un'altra grandezza, e la giacenza in questo elenco
          non c'è (vedi `docs/DA-FARE.md`).

          ⚠️ **La forma della riga totali resta**, ed è quella condivisa: il
          proprietario l'ha confermata — «potrebbe anche andare bene la riga del
          totale così, è renderla condivisa con maschere simili». A cambiare è
          cosa ci finisce dentro.
        */
      },
    }),
  );

  /*
    ⛔ **Frecce, non metodi passati per nome.** Il motore chiama la callback come
    valore (`rowId()(row)`): un metodo di classe arriverebbe senza `this` e la
    prima riga renderizzata lancerebbe. È la lezione già pagata dall'elenco
    documenti, dove nessun test se n'era accorto perché rendeva zero righe.
  */
  /*
    ⚠️ **Le colonne spente non si controllano a mano.** La card legge quelle che
    il motore ha già ricevuto: una fonte sola invece di due che possono divergere.
  */
  /** ⚠️ In cima a una card un trattino è un segno nudo: si omette. */
  protected readonly valoreCard = valoreCard;

  protected visibile(columnId: string): boolean {
    return colonnaVisibile(this.engineColumns(), columnId);
  }

  protected readonly rowId = (product: Product): string => product.id;

  protected readonly rowLabelFor = (product: Product): string => this.rowLabel(product);

  protected readonly selectionLabel = (product: Product): string => `Seleziona ${product.name}`;

  /*
    ⭐ **Il testo delle celle semplici sta qui, non nel template.** Sei colonne
    sono solo testo: dare a ognuna un `ng-template` sarebbe ripetere sei volte la
    stessa riga.

    ⚠️ Il trattino lungo per il vuoto è la convenzione già in uso in questa
    tabella e non va sostituito con una stringa vuota: in una colonna densa
    «niente» e «non caricato» si distinguono solo così.
  */
  protected readonly cellText = (product: Product, columnId: string): string => {
    switch (columnId) {
      case 'articleCode':
        return product.articleCode || '—';
      case 'name':
        return product.name;
      case 'brand':
        return product.brand ?? '—';
      case 'category':
        return productDisplayCategoryShort(product);
      case 'season':
        return product.season ?? '—';
      case 'variants':
        return String(this.variantCount(product));
      case 'sellingPrice':
        return this.priceLabel(product);
      default:
        return '';
    }
  };

  /*
    ⚠️ **L'ordinamento arriva in due pezzi e il motore ne vuole uno.** Questa
    tabella riceve ancora `sortField` e `sortOrder` separati: si compongono qui,
    invece di cambiare l'API della pagina in un lavoro che è di tabella.
  */
  protected readonly sort = computed<readonly DataTableSort[]>(() => {
    const campo = this.sortField();
    if (!campo) {
      return [];
    }
    return [{ columnId: campo, direction: this.sortOrder() === 'desc' ? 'desc' : 'asc' }];
  });

  /*
    ⛔ **Il terzo clic non deve diventare un clic morto.** Il motore ha tre stati
    (crescente → decrescente → nessun ordine) e la pagina ne ha due, perché
    `onSortChange` alterna da sé. Al terzo clic il motore manda un elenco VUOTO:
    letto come «niente da fare», la colonna resterebbe decrescente e la pressione
    non produrrebbe nulla.

    La colonna è quella che era primaria un attimo prima: rimandandola, la pagina
    la alterna e il ciclo torna crescente — cioè il comportamento di sempre.
  */
  protected onSortChange(chiavi: readonly DataTableSort[]): void {
    const premuta = chiavi[0]?.columnId ?? this.sort()[0]?.columnId;
    if (premuta) {
      this.sortChange.emit(premuta as ProductSortField);
    }
  }

  /**
   * ⚠️ **Un prodotto senza prezzo non vale zero**: il trattino dice «non
   * impostato», e `0,00 €` direbbe «è gratis». La distinzione conta su un
   * catalogo dove gli articoli si completano nel tempo — e questo elenco ha un
   * chip «Articoli da completare» proprio per quelli.
   */
  protected priceLabel(product: Product): string {
    return product.sellingPrice ? formatMoney(product.sellingPrice) : '—';
  }

  /** Numero di combinazioni di varianti derivato dalle opzioni del prodotto. */
  protected variantCount(product: Product): number {
    if (product.options.length === 0) {
      return 0;
    }
    return product.options.reduce((total, option) => total * option.values.length, 1);
  }

  protected statusLabel(status: ProductStatus): string {
    return productStatusLabel(status);
  }

  // «Nel cestino»: la decisione sta in product-lifecycle.util, qui si mostra.
  protected readonly trashLabel = TRASH_LABEL;
  protected readonly trashTone = TRASH_TONE;
  protected inTrash(product: Product): boolean {
    return isInTrash(product);
  }

  protected statusTone(status: ProductStatus): BadgeTone {
    return productStatusTone(status);
  }

  private rowLabel(product: Product): string {
    return `${product.name}, apri dettaglio`;
  }

  protected shopifyLabel(product: Product): string {
    switch (product.shopify?.status) {
      case ShopifySyncStatus.Synced:
        return 'Sincronizzato';
      case ShopifySyncStatus.Syncing:
        return 'Sync in corso';
      case ShopifySyncStatus.OutOfSync:
        return 'Non aggiornato';
      case ShopifySyncStatus.Error:
        return 'Errore sync';
      default:
        return 'Non collegato';
    }
  }

  protected shopifyTone(product: Product): BadgeTone {
    switch (product.shopify?.status) {
      case ShopifySyncStatus.Synced:
        return 'success';
      case ShopifySyncStatus.Syncing:
        return 'info';
      case ShopifySyncStatus.OutOfSync:
        return 'warning';
      case ShopifySyncStatus.Error:
        return 'error';
      default:
        return 'neutral';
    }
  }

  protected sourceLabel(product: Product): string {
    return catalogOriginShortLabel(product.catalogOrigin);
  }

  protected sourceTone(product: Product): BadgeTone {
    return catalogOriginTone(product.catalogOrigin);
  }
}
