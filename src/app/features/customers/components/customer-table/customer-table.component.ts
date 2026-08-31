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
import type { ResolvedTableColumn } from '@shared/table-columns/table-column.model';

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
  readonly selectedIds = input<ReadonlySet<string>>(new Set<string>());

  readonly rowClick = output<Customer>();
  readonly selectionToggle = output<{ readonly customerId: string; readonly selected: boolean }>();
  readonly selectAllToggle = output<boolean>();

  /** Lista piatta: una sezione senza intestazione né piede. */
  protected readonly sections = computed<readonly DataTableSection<Customer>[]>(() => [
    { id: 'clienti', rows: this.customers() },
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
    totaliDiElenco(this.customers(), {
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
    ⭐ **Dodici colonne su tredici sono testo**, e stanno tutte qui: dare a ognuna
    un `ng-template` sarebbe stato ripetere dodici volte la stessa riga.
  */
  protected readonly cellText = (customer: Customer, columnId: string): string => {
    switch (columnId) {
      case 'code':
        return customer.code ?? '—';
      case 'name':
        return this.displayName(customer);
      case 'email':
        return customer.email ?? '—';
      case 'phone':
        return customer.phone ?? '—';
      case 'city':
        return customer.address?.city ?? '—';
      case 'province':
        return customer.address?.province ?? '—';
      case 'companyName':
        return customer.companyName ?? '—';
      case 'vatNumber':
        return customer.vatNumber ?? '—';
      case 'discount':
        return customer.customerDiscount ?? '—';
      case 'paymentTerms':
        return customer.paymentTerms ?? '—';
      case 'alsoSupplier':
        return this.alsoSupplierLabel(customer);
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

  private alsoSupplierLabel(customer: Customer): string {
    if (!customer.linkedSupplierId) {
      return '—';
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
