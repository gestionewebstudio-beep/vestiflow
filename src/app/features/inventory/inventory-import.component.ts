import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';

import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import { BackButtonComponent } from '@shared/components/back-button/back-button.component';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { DataTableCellDirective } from '@shared/components/data-table/data-table-cell.directive';
import { DataTableRowCardDirective } from '@shared/components/data-table/data-table-row-card.directive';
import { DataTableComponent } from '@shared/components/data-table/data-table.component';
import type {
  DataTableSection,
  DataTableSort,
  DataTableTotals,
} from '@shared/components/data-table/data-table.model';
import { InlineBannerComponent } from '@shared/components/inline-banner/inline-banner.component';
import { TableColumnPickerComponent } from '@shared/components/table-column-picker/table-column-picker.component';
import { TableFiltersButtonComponent } from '@shared/components/table-filters/table-filters-button.component';
import { TableFiltersPanelComponent } from '@shared/components/table-filters/table-filters-panel.component';
import { totaliDiElenco } from '@shared/models/list-totals.util';
import { createColumnFilters } from '@shared/table-columns/column-filters';
import { ordinaPerColonne } from '@shared/table-columns/column-sort.util';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';

import type {
  InventoryImportPreview,
  InventoryImportPreviewItem,
  InventoryImportResult,
  InventoryImportResultItem,
} from '@domain/inventory/models/inventory-import.model';
import { InventoryService } from '@domain/inventory/services/inventory.service';

import {
  INVENTORY_IMPORT_PREVIEW_COLUMN_DEFS,
  INVENTORY_IMPORT_PREVIEW_COLUMN_PRESETS,
  INVENTORY_IMPORT_PREVIEW_VIEW,
  INVENTORY_IMPORT_RESULT_COLUMN_DEFS,
  INVENTORY_IMPORT_RESULT_COLUMN_PRESETS,
  INVENTORY_IMPORT_RESULT_VIEW,
} from './models/inventory-import-table-columns.config';

type ImportPhase = 'upload' | 'preview' | 'done';

/** Un delta si legge col segno: «+3» e «−2», non «3» e «-2». */
const conSegno = (n: number): string => (n > 0 ? `+${n}` : String(n));

@Component({
  selector: 'app-inventory-import',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BackButtonComponent,
    ButtonComponent,
    BadgeComponent,
    InlineBannerComponent,
    DataTableComponent,
    DataTableCellDirective,
    DataTableRowCardDirective,
    TableColumnPickerComponent,
    TableFiltersButtonComponent,
    TableFiltersPanelComponent,
  ],
  templateUrl: './inventory-import.component.html',
  styleUrl: './inventory-import.component.scss',
})
export class InventoryImportComponent {
  private readonly inventoryService = inject(InventoryService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly preferenzeColonne = inject(TableColumnPreferenceService);

  // ⭐ **Le due tabelle sono sul MOTORE comune** (`docs/26` A2), nella stessa
  //    forma dell'import prodotti: colonne dal catalogo, filtri e ordinamento
  //    condivisi, riga totali sulle quantità, card progettata sotto `lg`.
  protected readonly vistaAnteprima = INVENTORY_IMPORT_PREVIEW_VIEW;
  protected readonly vistaEsito = INVENTORY_IMPORT_RESULT_VIEW;
  // ⛔ Si ASSEGNANO nel costruttore, dopo `registerView`: un inizializzatore di
  //    campo gira prima, e `visibleColumns` su una vista non registrata lancia.
  protected readonly colonneAnteprima: ReturnType<TableColumnPreferenceService['visibleColumns']>;
  protected readonly colonneEsito: ReturnType<TableColumnPreferenceService['visibleColumns']>;
  protected readonly ordineAnteprima = signal<readonly DataTableSort[]>([]);
  protected readonly ordineEsito = signal<readonly DataTableSort[]>([]);

  // ⚠️ Colonne e Filtri stanno QUI e non nel telaio: è una tappa dell'import,
  //    non un elenco. Pulsante e pannello sono i pezzi condivisi del telaio
  //    (`docs/26` D1): un `open` per tabella, sono due viste.
  protected readonly filtriAnteprimaAperti = signal(false);
  protected readonly filtriEsitoAperti = signal(false);

  protected readonly rigaAnteprimaId = (item: InventoryImportPreviewItem): string => item.key;
  protected readonly rigaEsitoId = (row: InventoryImportResultItem): string => row.key;

  /** Il testo di ogni cella dell'anteprima: è ciò che filtri, ordinamento e card leggono. */
  protected readonly testoAnteprima = (
    item: InventoryImportPreviewItem,
    colonna: string,
  ): string => {
    switch (colonna) {
      case 'variantTitle':
        return item.variantTitle;
      case 'sku':
        return item.sku;
      case 'location':
        return item.locationName;
      case 'currentAvailable':
        return item.currentAvailable === null ? '—' : String(item.currentAvailable);
      case 'newAvailable':
        return item.newAvailable === null ? '—' : String(item.newAvailable);
      case 'delta':
        return item.delta === null ? '—' : conSegno(item.delta);
      case 'status':
        return this.statusLabel(item);
      case 'message':
        return item.message ?? '—';
      default:
        return '';
    }
  };

  protected readonly testoEsito = (row: InventoryImportResultItem, colonna: string): string => {
    switch (colonna) {
      case 'sku':
        return row.sku;
      case 'location':
        return row.locationName;
      case 'status':
        return this.resultStatusLabel(row.status);
      case 'message':
        return row.message ?? '—';
      default:
        return '';
    }
  };

  // ⚠️ `numeroDi` non è facoltativo sulle tre quantità: senza, il filtro a
  //    intervallo non filtra e l'ordinamento confronta «10» prima di «2».
  //    Una riga con errore ha `null`: non è zero, e non si ordina come tale.
  private readonly numeroAnteprima = (item: InventoryImportPreviewItem, colonna: string) => {
    switch (colonna) {
      case 'currentAvailable':
        return item.currentAvailable;
      case 'newAvailable':
        return item.newAvailable;
      case 'delta':
        return item.delta;
      default:
        return null;
    }
  };

  private readonly anteprimaFiltrata = createColumnFilters<InventoryImportPreviewItem>({
    viewId: () => INVENTORY_IMPORT_PREVIEW_VIEW,
    righe: () => this.preview()?.rows ?? [],
    cellText: this.testoAnteprima,
    numeroDi: this.numeroAnteprima,
  });
  private readonly esitoFiltrato = createColumnFilters<InventoryImportResultItem>({
    viewId: () => INVENTORY_IMPORT_RESULT_VIEW,
    righe: () => this.result()?.rows ?? [],
    cellText: this.testoEsito,
  });

  private readonly anteprimaOrdinata = computed(() =>
    ordinaPerColonne(this.anteprimaFiltrata(), this.ordineAnteprima(), {
      cellText: this.testoAnteprima,
      numeroDi: this.numeroAnteprima,
    }),
  );

  protected readonly sezioniAnteprima = computed(
    (): readonly DataTableSection<InventoryImportPreviewItem>[] => [
      { id: 'anteprima', rows: this.anteprimaOrdinata() },
    ],
  );
  protected readonly sezioniEsito = computed(
    (): readonly DataTableSection<InventoryImportResultItem>[] => [
      {
        id: 'esito',
        rows: ordinaPerColonne(this.esitoFiltrato(), this.ordineEsito(), {
          cellText: this.testoEsito,
        }),
      },
    ],
  );

  /**
   * ⭐ **La riga totali dell'anteprima** somma le tre quantità del risultato
   * filtrato: «di quanti pezzi si muove il magazzino» è il numero che si vuole
   * sapere prima di premere Importa. Le righe con errore hanno `null` e valgono
   * zero nella somma — non hanno una quantità da contare.
   */
  protected readonly totaliAnteprima = computed<DataTableTotals>(() =>
    totaliDiElenco(this.anteprimaOrdinata(), {
      rowId: this.rigaAnteprimaId,
      selectedIds: new Set<string>(),
      columns: this.colonneAnteprima(),
      campi: {
        currentAvailable: { valore: (r) => r.currentAvailable ?? 0, formato: String },
        newAvailable: { valore: (r) => r.newAvailable ?? 0, formato: String },
        delta: { valore: (r) => r.delta ?? 0, formato: conSegno },
      },
    }),
  );

  constructor() {
    this.preferenzeColonne.registerView(
      INVENTORY_IMPORT_PREVIEW_VIEW,
      INVENTORY_IMPORT_PREVIEW_COLUMN_DEFS,
      INVENTORY_IMPORT_PREVIEW_COLUMN_PRESETS,
    );
    this.preferenzeColonne.registerView(
      INVENTORY_IMPORT_RESULT_VIEW,
      INVENTORY_IMPORT_RESULT_COLUMN_DEFS,
      INVENTORY_IMPORT_RESULT_COLUMN_PRESETS,
    );
    this.colonneAnteprima = this.preferenzeColonne.visibleColumns(INVENTORY_IMPORT_PREVIEW_VIEW);
    this.colonneEsito = this.preferenzeColonne.visibleColumns(INVENTORY_IMPORT_RESULT_VIEW);
  }

  protected readonly phase = signal<ImportPhase>('upload');
  protected readonly selectedFile = signal<File | null>(null);
  protected readonly preview = signal<InventoryImportPreview | null>(null);
  protected readonly result = signal<InventoryImportResult | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<AppError | null>(null);

  protected readonly readyKeys = computed(() => {
    const data = this.preview();
    if (!data) {
      return [] as string[];
    }
    return data.rows.filter((item) => item.status === 'ready').map((item) => item.key);
  });

  protected readonly canImport = computed(() => this.readyKeys().length > 0 && !this.loading());

  /** Tutte le righe valide del file sono già allineate alle giacenze a sistema. */
  protected readonly allUnchanged = computed(() => {
    const data = this.preview();
    if (!data || data.summary.total === 0) {
      return false;
    }
    return data.summary.ready === 0 && data.summary.errors === 0 && data.summary.unchanged > 0;
  });

  protected backToList(): void {
    if (this.loading()) {
      return;
    }
    void this.router.navigate(['/app/inventory']);
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.selectedFile.set(file);
    this.preview.set(null);
    this.result.set(null);
    this.error.set(null);
    this.phase.set('upload');
  }

  protected analyzeFile(): void {
    const file = this.selectedFile();
    if (!file || this.loading()) {
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.inventoryService
      .previewInventoryImport(file)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.preview.set(data);
          this.phase.set('preview');
          this.loading.set(false);
        },
        error: (err: unknown) => {
          this.loading.set(false);
          this.error.set(
            isAppError(err)
              ? err
              : { kind: AppErrorKind.Unknown, message: 'Anteprima import non riuscita.' },
          );
        },
      });
  }

  protected runImport(): void {
    const file = this.selectedFile();
    const keys = this.readyKeys();
    if (!file || keys.length === 0 || this.loading()) {
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.inventoryService
      .importInventoryCsv(file, keys)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.result.set(data);
          this.phase.set('done');
          this.loading.set(false);
        },
        error: (err: unknown) => {
          this.loading.set(false);
          this.error.set(
            isAppError(err)
              ? err
              : { kind: AppErrorKind.Unknown, message: 'Import giacenze non riuscito.' },
          );
        },
      });
  }

  protected statusTone(
    item: InventoryImportPreviewItem,
  ): 'success' | 'warning' | 'error' | 'neutral' {
    if (item.status === 'ready') {
      return 'success';
    }
    if (item.status === 'unchanged') {
      return 'neutral';
    }
    return 'error';
  }

  protected statusLabel(item: InventoryImportPreviewItem): string {
    if (item.status === 'ready') {
      return 'Pronta';
    }
    if (item.status === 'unchanged') {
      return 'Invariata';
    }
    return 'Errore';
  }

  protected readonly resultTone = computed<'success' | 'warning' | 'error'>(() => {
    const data = this.result();
    if (!data) {
      return 'success';
    }
    if (data.updated === 0 && data.failed > 0) {
      return 'error';
    }
    if (data.failed > 0 || data.skipped > 0) {
      return 'warning';
    }
    return 'success';
  });

  protected readonly resultMessage = computed(() => {
    const data = this.result();
    if (!data) {
      return '';
    }
    if (data.updated === 0 && data.failed === 0) {
      return 'Nessuna giacenza aggiornata: le righe erano già allineate o sono state saltate.';
    }
    if (data.updated === 0) {
      return 'Import non riuscito: nessuna giacenza è stata aggiornata. Controlla i dettagli qui sotto.';
    }
    const parts = [`${data.updated} giacenze aggiornate`];
    if (data.unchanged > 0) {
      parts.push(`${data.unchanged} già allineate`);
    }
    if (data.skipped > 0) {
      parts.push(`${data.skipped} saltate`);
    }
    if (data.failed > 0) {
      parts.push(`${data.failed} non aggiornate per errori`);
    }
    return `${parts.join(' · ')}.`;
  });

  protected resultStatusLabel(status: 'updated' | 'unchanged' | 'skipped' | 'failed'): string {
    if (status === 'updated') {
      return 'Aggiornata';
    }
    if (status === 'unchanged') {
      return 'Invariata';
    }
    if (status === 'skipped') {
      return 'Saltata';
    }
    return 'Fallita';
  }

  protected resultStatusTone(
    status: 'updated' | 'unchanged' | 'skipped' | 'failed',
  ): 'success' | 'warning' | 'error' | 'neutral' {
    if (status === 'updated') {
      return 'success';
    }
    if (status === 'unchanged') {
      return 'neutral';
    }
    if (status === 'skipped') {
      return 'warning';
    }
    return 'error';
  }
}
