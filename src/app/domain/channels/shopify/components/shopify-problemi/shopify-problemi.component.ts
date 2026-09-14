import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { of } from 'rxjs';

import { BackgroundBlobExportService } from '@core/services/background-blob-export.service';
import { formatDateTime } from '@core/utils/date.util';
import { ButtonComponent } from '@shared/components/button/button.component';
import { DataTableCellDirective } from '@shared/components/data-table/data-table-cell.directive';
import { DataTableRowCardDirective } from '@shared/components/data-table/data-table-row-card.directive';
import { DataTableComponent } from '@shared/components/data-table/data-table.component';
import type {
  DataTableSection,
  DataTableSort,
} from '@shared/components/data-table/data-table.model';
import { TableColumnPickerComponent } from '@shared/components/table-column-picker/table-column-picker.component';
import { TableFiltersButtonComponent } from '@shared/components/table-filters/table-filters-button.component';
import { TableFiltersPanelComponent } from '@shared/components/table-filters/table-filters-panel.component';
import { createColumnFilters } from '@shared/table-columns/column-filters';
import { ordinaPerColonne } from '@shared/table-columns/column-sort.util';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';

import {
  SHOPIFY_PROBLEMI_COLUMN_DEFS,
  SHOPIFY_PROBLEMI_COLUMN_PRESETS,
  SHOPIFY_PROBLEMI_VIEW,
} from '../../models/shopify-problemi-table-columns.config';
import {
  azioneEseguibile,
  etichettaCausaProblema,
  etichettaDove,
  formaAzione,
  tonoProblema,
  etichettaTipoProblema,
  gruppiPerCausa,
  percorsoProblema,
  problemiCsv,
} from '../../models/shopify-problemi.util';
import type { DoveSiFaAzione, FormaAzione } from '../../models/shopify-problemi.util';
import type {
  ShopifySetupProblemaAzione,
  ShopifySetupProblemaDto,
} from '../../models/shopify-setup.dto';

/**
 * ⭐ I PROBLEMI aperti della sincronizzazione Shopify (13/09/2026, `docs/27`
 *    §4-bis): raggruppati per CAUSA con conteggio, conseguenza e azione, e
 *    l'elenco sul motore comune — ricerca, filtri per tipo/causa/sede,
 *    ordinamento, esportazione, card sul telefono.
 *
 * ⛔ Qui c'era un `<ul>` di 84 righe «da risolvere a mano» senza dire come, in
 *    cui 75 righe erano lo stesso guasto. Chi legge deve vedere subito che cosa
 *    è fermo, perché, e che cosa può fare.
 *
 * Componente dumb: riceve i problemi ed emette le azioni; chi lo ospita esegue
 * i comandi esistenti (Allinea, Importa ordini, notifiche) o porta alla sezione
 * (permessi, Sedi). Ordine e articolo si aprono da qui con un collegamento.
 * ⛔ Nessuna correzione dei dati: nomina e indirizza.
 */
@Component({
  selector: 'app-shopify-problemi',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ButtonComponent,
    DataTableComponent,
    DataTableCellDirective,
    DataTableRowCardDirective,
    TableColumnPickerComponent,
    TableFiltersButtonComponent,
    TableFiltersPanelComponent,
  ],
  templateUrl: './shopify-problemi.component.html',
  styleUrl: './shopify-problemi.component.scss',
})
export class ShopifyProblemiComponent {
  private readonly preferenzeColonne = inject(TableColumnPreferenceService);
  private readonly esportazione = inject(BackgroundBlobExportService);

  readonly problemi = input.required<readonly ShopifySetupProblemaDto[]>();
  /** Un comando è in corso: le azioni aspettano. */
  readonly busy = input(false);

  /** Un'azione da eseguire o una sezione da raggiungere: la esegue chi ospita. */
  readonly azione = output<ShopifySetupProblemaAzione>();

  protected readonly vista = SHOPIFY_PROBLEMI_VIEW;
  protected readonly filtriAperti = signal(false);
  protected readonly ricerca = signal('');
  protected readonly ordine = signal<readonly DataTableSort[]>([]);
  // ⛔ Assegnate nel costruttore, dopo `registerView`.
  protected readonly colonne: ReturnType<TableColumnPreferenceService['visibleColumns']>;

  protected readonly gruppi = computed(() => gruppiPerCausa(this.problemi()));

  protected readonly rigaId = (p: ShopifySetupProblemaDto): string => `${p.tipo}·${p.riferimento}`;

  /** Il testo di ogni cella: filtri, ordinamento, ricerca e card leggono questo. */
  protected readonly testo = (p: ShopifySetupProblemaDto, colonna: string): string => {
    switch (colonna) {
      case 'tipo':
        return etichettaTipoProblema(p.tipo);
      case 'elemento':
        return p.nome;
      case 'dettaglio':
        return p.dettaglio ?? '';
      case 'location':
        return p.sede ?? '';
      case 'causa':
        return etichettaCausaProblema(p.causa);
      case 'conseguenza':
        return p.conseguenza;
      case 'azione':
        // La forma breve: è quella che si vede, si filtra e si ordina.
        return formaAzione(p.azione).breve;
      case 'rilevato':
        return p.rilevatoAt ? formatDateTime(p.rilevatoAt) : '';
      default:
        return '';
    }
  };

  private readonly filtratePerColonna = createColumnFilters<ShopifySetupProblemaDto>({
    viewId: () => SHOPIFY_PROBLEMI_VIEW,
    righe: () => this.problemi(),
    cellText: this.testo,
  });

  /** La ricerca libera si somma ai filtri di colonna: cerca in ogni cella. */
  protected readonly filtrate = computed(() => {
    const testo = this.ricerca().trim().toLowerCase();
    const righe = this.filtratePerColonna();
    if (!testo) {
      return righe;
    }
    const colonne = ['tipo', 'elemento', 'dettaglio', 'location', 'causa', 'conseguenza', 'azione'];
    return righe.filter((p) => colonne.some((c) => this.testo(p, c).toLowerCase().includes(testo)));
  });

  protected readonly sezioni = computed(
    (): readonly DataTableSection<ShopifySetupProblemaDto>[] => [
      {
        id: 'problemi',
        rows: ordinaPerColonne(this.filtrate(), this.ordine(), { cellText: this.testo }),
      },
    ],
  );

  constructor() {
    this.preferenzeColonne.registerView(
      SHOPIFY_PROBLEMI_VIEW,
      SHOPIFY_PROBLEMI_COLUMN_DEFS,
      SHOPIFY_PROBLEMI_COLUMN_PRESETS,
    );
    this.colonne = this.preferenzeColonne.visibleColumns(SHOPIFY_PROBLEMI_VIEW);
  }

  protected onRicerca(event: Event): void {
    this.ricerca.set((event.target as HTMLInputElement).value);
  }

  protected percorso(azione: ShopifySetupProblemaAzione | null): string | null {
    return percorsoProblema(azione);
  }

  protected eseguibile(azione: ShopifySetupProblemaAzione): boolean {
    return azioneEseguibile(azione);
  }

  /** Dove si fa l'azione, e la sua forma breve (`docs/29` §2.3). */
  protected formaDi(azione: ShopifySetupProblemaAzione): FormaAzione {
    return formaAzione(azione);
  }

  protected dove(dove: DoveSiFaAzione): string {
    return etichettaDove(dove);
  }

  protected tono(azione: ShopifySetupProblemaAzione): 'attenzione' | 'valutare' {
    return tonoProblema(azione);
  }

  /** Esporta ciò che si vede: filtri e ricerca compresi. */
  protected esporta(): void {
    const righe = this.sezioni()[0]?.rows ?? [];
    this.esportazione.start({
      exportId: 'shopify-problemi',
      request: of(new Blob([problemiCsv(righe)], { type: 'text/csv;charset=utf-8' })),
      filename: 'problemi-shopify.csv',
      successMessage: `Esportati ${righe.length} problemi.`,
    });
  }
}
