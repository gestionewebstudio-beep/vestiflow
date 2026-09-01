import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import {
  customerDisplayName,
  customerSourceLabel,
  type Customer,
} from '@core/models/customer.model';
import { formatDate } from '@core/utils/date.util';
import { colonnaVisibile, valoreCard } from '@shared/models/list-card-fields.util';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { DataTableCellDirective } from '@shared/components/data-table/data-table-cell.directive';
import { DataTableRowCardDirective } from '@shared/components/data-table/data-table-row-card.directive';
import { DataTableComponent } from '@shared/components/data-table/data-table.component';
import type {
  DataTableSection,
  DataTableTotals,
} from '@shared/components/data-table/data-table.model';
import { totaliDiElenco } from '@shared/models/list-totals.util';
import { createColumnFilters } from '@shared/table-columns/column-filters';
import type { ResolvedTableColumn, TableViewId } from '@shared/table-columns/table-column.model';

/**
 * Tabella clienti (dumb puro): mostra le righe ed espone il clic.
 *
 * ⭐ **Lo scheletro è del motore comune** dal 30/08/2026 — secondo elenco a
 * entrarci dopo i prodotti. Qui resta solo ciò che è DEI CLIENTI: come si legge
 * il testo di ogni colonna, e l'unica cella che non è testo.
 */
@Component({
  selector: 'app-customer-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent, DataTableComponent, DataTableCellDirective, DataTableRowCardDirective],
  templateUrl: './customer-table.component.html',
  styleUrl: './customer-table.component.scss',
})
export class CustomerTableComponent {
  readonly customers = input.required<readonly Customer[]>();

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
  readonly selectedIds = input<ReadonlySet<string>>(new Set<string>());

  readonly rowClick = output<Customer>();
  readonly selectionToggle = output<{ readonly customerId: string; readonly selected: boolean }>();
  readonly selectAllToggle = output<boolean>();

  /*
    ⚠️ **Si filtra QUI, una volta sola**: da queste righe discendono sezioni, riga
    totali e card. Filtrare nel motore lascerebbe i totali sulle righe intere.

    ⭐ **`dataDi` serve a «Creato il»**, che è una colonna `date`: il testo mostrato
    è `31/01/2026`, e confrontarlo come stringa metterebbe gennaio dopo dicembre.
  */
  private readonly righe = createColumnFilters({
    viewId: this.viewId,
    righe: this.customers,
    cellText: (customer, columnId) => this.cellText(customer, columnId),
    dataDi: (customer, columnId) => (columnId === 'createdAt' ? customer.createdAt : null),
  });

  /** Lista piatta: una sezione senza intestazione né piede. */
  protected readonly sections = computed<readonly DataTableSection<Customer>[]>(() => [
    { id: 'clienti', rows: this.righe() },
  ]);

  /*
    ⚠️ **Nessuna colonna dei clienti si somma**, e la riga totali resta comunque:
    dice «N voci», che su un'anagrafica filtrata è il dato che si cerca per primo.

    ⛔ **«Sconto» sembra sommabile e non lo è**: è una percentuale, e sommare
    percentuali di clienti diversi non produce un numero che significhi qualcosa.

    ⭐ **Il conteggio segue la selezione**, come su ogni altro elenco: spuntate tre
    righe, dice «3 voci». È l'unica cosa che questa riga può fare qui, ed è quella
    che serve.
  */
  protected readonly totals = computed<DataTableTotals>(() =>
    totaliDiElenco(this.righe(), {
      rowId: this.rowId,
      selectedIds: this.selectedIds(),
      columns: this.columns(),
      campi: {},
    }),
  );

  protected readonly selectionLabel = (customer: Customer): string =>
    `Seleziona ${this.displayName(customer)}`;

  /*
    ⛔ **Frecce, non metodi passati per nome**: il motore chiama la callback come
    valore, e un metodo di classe arriverebbe senza `this`.
  */
  /*
    ⚠️ **Le colonne spente non si controllano a mano.** La card legge quelle che
    il motore ha già ricevuto: una fonte sola invece di due che possono divergere.
  */
  /** ⚠️ In cima a una card un trattino è un segno nudo: si omette. */
  protected readonly valoreCard = valoreCard;

  protected visibile(columnId: string): boolean {
    return colonnaVisibile(this.columns(), columnId);
  }

  protected readonly rowId = (customer: Customer): string => customer.id;

  protected readonly rowLabelFor = (customer: Customer): string => this.rowLabel(customer);

  /*
    ⭐ **Tutte le colonne sono testo tranne l'origine**, e stanno tutte qui: dare
    a ognuna un `ng-template` sarebbe ripetere venti volte la stessa riga.

    ⚠️ **Ogni colonna dichiarata nel catalogo DEVE avere il suo ramo**, o cade
    nel `default` e resta una colonna vuota che si accende e non mostra niente:
    è il difetto che `check:colonne-rese` esiste per prendere, e che nessun
    test trova da solo.

    ⚠️ **L'origine ha un ramo anche se la disegna un template**: il testo serve
    al filtro di colonna e alla ricerca, che leggono da qui.
  */
  protected readonly cellText = (customer: Customer, columnId: string): string => {
    switch (columnId) {
      // ── Identità ────────────────────────────────────────────────────────
      case 'code':
        return customer.code?.trim() || '—';
      case 'name':
        return this.displayName(customer);
      case 'companyName':
        return customer.companyName?.trim() || '—';
      case 'vatNumber':
        return customer.vatNumber?.trim() || '—';
      case 'taxCode':
        return customer.taxCode?.trim() || '—';
      case 'sdiCode':
        return customer.sdiCode?.trim() || '—';

      // ── Dove ────────────────────────────────────────────────────────────
      case 'addressLine1':
        return customer.address?.line1?.trim() || '—';
      case 'postalCode':
        return customer.address?.postalCode?.trim() || '—';
      case 'city':
        return customer.address?.city?.trim() || '—';
      case 'province':
        return customer.address?.province?.trim() || '—';
      case 'countryCode':
        return customer.address?.country?.trim() || '—';

      // ── Contatti ────────────────────────────────────────────────────────
      case 'email':
        return customer.email?.trim() || '—';
      case 'pec':
        return customer.pec?.trim() || '—';
      case 'phone':
        return customer.phone?.trim() || '—';
      case 'mobilePhone':
        return customer.mobilePhone?.trim() || '—';
      case 'contactName':
        return customer.contactName?.trim() || '—';
      case 'website':
        return customer.website?.trim() || '—';

      // ── Condizioni commerciali ──────────────────────────────────────────
      case 'customerDiscount':
        return customer.customerDiscount?.trim() || '—';
      case 'paymentMethod':
        return customer.paymentMethod?.trim() || '—';
      case 'paymentTerms':
        return customer.paymentTerms?.trim() || '—';
      case 'iban':
        return customer.iban?.trim() || '—';
      case 'transportResponsible':
        return customer.transportResponsible?.trim() || '—';

      // ── Stato, ruoli e note ─────────────────────────────────────────────
      case 'roleStatus':
        return customer.isActive === false ? 'Disattivato' : 'Attivo';
      case 'alsoSupplier':
        return this.alsoSupplierLabel(customer);
      case 'customerNotes':
        return customer.notes?.trim() || '—';
      case 'commercialNotes':
        return customer.commercialNotes?.trim() || '—';

      case 'source':
        return this.sourceLabel(customer);
      case 'createdAt':
        return this.createdAtLabel(customer);
      default:
        return '';
    }
  };

  protected displayName(customer: Customer): string {
    return customerDisplayName(customer);
  }

  protected sourceLabel(customer: Customer): string {
    return customerSourceLabel(customer.source);
  }

  protected sourceTone(customer: Customer): 'info' | 'neutral' {
    return customer.source === 'shopify' ? 'info' : 'neutral';
  }

  /*
    ⚠️ **Tre risposte, non due.** «No» e «sì ma disattivato» sono cose diverse:
    la seconda dice che il ruolo fornitore c'è ed è stato ritirato, e
    appiattirle nasconderebbe uno storico che esiste. È la stessa lettura della
    colonna gemella sui fornitori — e ora anche la stessa parola: qui c'era «—»,
    che in un elenco significa «dato mancante» e non «no».
  */
  private alsoSupplierLabel(customer: Customer): string {
    if (!customer.linkedSupplierId) {
      return 'No';
    }
    return customer.linkedSupplierActive ? 'Sì' : 'Disattivato';
  }

  private createdAtLabel(customer: Customer): string {
    return formatDate(customer.createdAt);
  }

  private rowLabel(customer: Customer): string {
    return `Apri cliente ${this.displayName(customer)}`;
  }
}
