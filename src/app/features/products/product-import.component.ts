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

import { AuthService } from '@core/auth';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import {
  productImportFormatHint,
  productImportIntro,
} from '@core/models/tenant-channel-profile.model';
import { BackButtonComponent } from '@shared/components/back-button/back-button.component';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { DataTableCellDirective } from '@shared/components/data-table/data-table-cell.directive';
import { DataTableRowCardDirective } from '@shared/components/data-table/data-table-row-card.directive';
import { DataTableComponent } from '@shared/components/data-table/data-table.component';
import type {
  DataTableSection,
  DataTableSort,
} from '@shared/components/data-table/data-table.model';
import { InlineBannerComponent } from '@shared/components/inline-banner/inline-banner.component';
import { createColumnFilters } from '@shared/table-columns/column-filters';
import { ordinaPerColonne } from '@shared/table-columns/column-sort.util';
import { TableColumnPickerComponent } from '@shared/components/table-column-picker/table-column-picker.component';
import { TableFiltersButtonComponent } from '@shared/components/table-filters/table-filters-button.component';
import { TableFiltersPanelComponent } from '@shared/components/table-filters/table-filters-panel.component';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';

import type {
  ProductImportPreview,
  ProductImportPreviewItem,
  ProductImportResult,
  ProductImportResultItem,
} from '@domain/products/models/product-import.model';
import { ProductService } from '@domain/products/services/product.service';

import {
  PRODUCT_IMPORT_PREVIEW_COLUMN_DEFS,
  PRODUCT_IMPORT_PREVIEW_COLUMN_PRESETS,
  PRODUCT_IMPORT_PREVIEW_VIEW,
  PRODUCT_IMPORT_RESULT_COLUMN_DEFS,
  PRODUCT_IMPORT_RESULT_COLUMN_PRESETS,
  PRODUCT_IMPORT_RESULT_VIEW,
} from './models/product-import-table-columns.config';

type ImportPhase = 'upload' | 'preview' | 'done';

@Component({
  selector: 'app-product-import',
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
  templateUrl: './product-import.component.html',
  styleUrl: './product-import.component.scss',
})
export class ProductImportComponent {
  private readonly productService = inject(ProductService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly authService = inject(AuthService);
  private readonly preferenzeColonne = inject(TableColumnPreferenceService);

  // ⚠️ **Colonne e Filtri stanno QUI e non nel telaio**: questa è una tappa
  //    dell’import, non un elenco, quindi non passa da `app-list-page`. Il
  //    pulsante e il pannello sono gli stessi pezzi condivisi del telaio
  //    (`docs/26` D1): sul telefono il pannello laterale, su scrivania le
  //    intestazioni. Un `open` per tabella: sono due viste.
  protected readonly filtriAnteprimaAperti = signal(false);
  protected readonly filtriEsitoAperti = signal(false);

  // ⭐ **Le due tabelle sono sul MOTORE comune** (`docs/26` A1). Erano due
  //    `<table>` a mano: niente ordinamento, niente filtri di colonna, niente
  //    maniglie, e sul telefono il ripiego generico che allineava a destra
  //    un messaggio con un indirizzo dentro. La stessa strada dei registri
  //    della Cassa: colonne dal catalogo, filtri e ordinamento condivisi,
  //    card progettata sotto `lg`.
  protected readonly vistaAnteprima = PRODUCT_IMPORT_PREVIEW_VIEW;
  protected readonly vistaEsito = PRODUCT_IMPORT_RESULT_VIEW;
  // ⛔ Si ASSEGNANO nel costruttore, dopo `registerView`: un inizializzatore
  //    di campo gira prima, e `visibleColumns` su una vista non registrata
  //    lancia — la pagina restava bianca. Visto a schermo l’11/09/2026.
  protected readonly colonneAnteprima: ReturnType<TableColumnPreferenceService['visibleColumns']>;
  protected readonly colonneEsito: ReturnType<TableColumnPreferenceService['visibleColumns']>;
  protected readonly ordineAnteprima = signal<readonly DataTableSort[]>([]);
  protected readonly ordineEsito = signal<readonly DataTableSort[]>([]);

  protected readonly rigaAnteprimaId = (item: ProductImportPreviewItem): string => item.handle;
  protected readonly rigaEsitoId = (row: ProductImportResultItem): string =>
    `${row.handle}·${row.status}`;

  /** Il testo di ogni cella dell’anteprima: è ciò che filtri, ordinamento e card leggono. */
  protected readonly testoAnteprima = (item: ProductImportPreviewItem, colonna: string): string => {
    switch (colonna) {
      case 'name':
        return item.name;
      case 'handle':
        return item.handle;
      case 'variantCount':
        return String(item.variantCount);
      case 'status':
        return this.statusLabel(item);
      case 'issues':
        return item.issues.map((issue) => issue.message).join(' · ');
      default:
        return '';
    }
  };

  protected readonly testoEsito = (row: ProductImportResultItem, colonna: string): string => {
    switch (colonna) {
      case 'name':
        return row.name;
      case 'articleCode':
        return row.articleCode
          ? `${row.articleCode}${row.articleCodeGenerated ? ' (generato)' : ''}`
          : '—';
      case 'status':
        return this.resultStatusLabel(row.status);
      case 'message':
        return row.message ?? '—';
      default:
        return '';
    }
  };

  // ⚠️ `numeroDi` non è facoltativo sulla colonna «Varianti»: senza, il filtro
  //    a intervallo non filtra e l’ordinamento confronta «10» prima di «2».
  private readonly numeroAnteprima = (item: ProductImportPreviewItem, colonna: string) =>
    colonna === 'variantCount' ? item.variantCount : null;

  private readonly anteprimaFiltrata = createColumnFilters<ProductImportPreviewItem>({
    viewId: () => PRODUCT_IMPORT_PREVIEW_VIEW,
    righe: () => this.preview()?.products ?? [],
    cellText: this.testoAnteprima,
    numeroDi: this.numeroAnteprima,
  });
  private readonly esitoFiltrato = createColumnFilters<ProductImportResultItem>({
    viewId: () => PRODUCT_IMPORT_RESULT_VIEW,
    righe: () => this.result()?.products ?? [],
    cellText: this.testoEsito,
  });

  protected readonly sezioniAnteprima = computed(
    (): readonly DataTableSection<ProductImportPreviewItem>[] => [
      {
        id: 'anteprima',
        rows: ordinaPerColonne(this.anteprimaFiltrata(), this.ordineAnteprima(), {
          cellText: this.testoAnteprima,
          numeroDi: this.numeroAnteprima,
        }),
      },
    ],
  );
  protected readonly sezioniEsito = computed(
    (): readonly DataTableSection<ProductImportResultItem>[] => [
      {
        id: 'esito',
        rows: ordinaPerColonne(this.esitoFiltrato(), this.ordineEsito(), {
          cellText: this.testoEsito,
        }),
      },
    ],
  );

  constructor() {
    this.preferenzeColonne.registerView(
      PRODUCT_IMPORT_PREVIEW_VIEW,
      PRODUCT_IMPORT_PREVIEW_COLUMN_DEFS,
      PRODUCT_IMPORT_PREVIEW_COLUMN_PRESETS,
    );
    this.preferenzeColonne.registerView(
      PRODUCT_IMPORT_RESULT_VIEW,
      PRODUCT_IMPORT_RESULT_COLUMN_DEFS,
      PRODUCT_IMPORT_RESULT_COLUMN_PRESETS,
    );
    this.colonneAnteprima = this.preferenzeColonne.visibleColumns(PRODUCT_IMPORT_PREVIEW_VIEW);
    this.colonneEsito = this.preferenzeColonne.visibleColumns(PRODUCT_IMPORT_RESULT_VIEW);
  }

  private readonly tenantProfile = computed(
    () => this.authService.currentUser()?.tenantChannelProfile,
  );
  protected readonly pageIntro = computed(() => productImportIntro(this.tenantProfile()));
  protected readonly formatHint = computed(() => productImportFormatHint(this.tenantProfile()));

  protected readonly phase = signal<ImportPhase>('upload');
  protected readonly selectedFile = signal<File | null>(null);
  protected readonly preview = signal<ProductImportPreview | null>(null);
  protected readonly result = signal<ProductImportResult | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<AppError | null>(null);

  protected readonly readyHandles = computed(() => {
    const data = this.preview();
    if (!data) {
      return [] as string[];
    }
    return data.products
      .filter((item) => item.status !== 'error' && !item.alreadyImported)
      .map((item) => item.handle);
  });

  protected readonly canImport = computed(() => this.readyHandles().length > 0 && !this.loading());

  /** Tutti i prodotti del file risultano già presenti in catalogo. */
  protected readonly allAlreadyImported = computed(() => {
    const data = this.preview();
    if (!data || data.summary.total === 0) {
      return false;
    }
    return data.summary.alreadyImported === data.summary.total;
  });

  protected backToList(): void {
    void this.router.navigate(['/app/products']);
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
    this.productService
      .previewProductImport(file)
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
    const handles = this.readyHandles();
    if (!file || handles.length === 0 || this.loading()) {
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.productService
      .importProducts(file, handles)
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
              : { kind: AppErrorKind.Unknown, message: 'Import prodotti non riuscito.' },
          );
        },
      });
  }

  protected statusTone(
    item: ProductImportPreviewItem,
  ): 'success' | 'warning' | 'error' | 'neutral' {
    if (item.alreadyImported) {
      return 'neutral';
    }
    if (item.status === 'ready') {
      return 'success';
    }
    if (item.status === 'warning') {
      return 'warning';
    }
    return 'error';
  }

  protected statusLabel(item: ProductImportPreviewItem): string {
    if (item.alreadyImported) {
      return 'Già importato';
    }
    if (item.status === 'ready') {
      return 'Pronto';
    }
    if (item.status === 'warning') {
      return 'Con avvisi';
    }
    return 'Errore';
  }

  protected readonly resultTone = computed<'success' | 'warning' | 'error'>(() => {
    const data = this.result();
    if (!data) {
      return 'success';
    }
    if (data.imported === 0 && data.failed > 0) {
      return 'error';
    }
    if (data.imported === 0 || data.failed > 0 || data.skipped > 0) {
      return 'warning';
    }
    return 'success';
  });

  protected readonly resultMessage = computed(() => {
    const data = this.result();
    if (!data) {
      return '';
    }
    if (data.imported === 0 && data.failed === 0) {
      return 'Nessun prodotto importato: erano tutti già presenti in catalogo o saltati.';
    }
    if (data.imported === 0) {
      return 'Import non riuscito: nessun prodotto è stato importato. Controlla i dettagli qui sotto.';
    }
    const parts = [`${data.imported} prodotti importati con successo`];
    if (data.skipped > 0) {
      parts.push(`${data.skipped} saltati (già presenti o con errori)`);
    }
    if (data.failed > 0) {
      parts.push(`${data.failed} non importati per errori`);
    }
    return `${parts.join(' · ')}.`;
  });

  protected resultStatusLabel(status: 'imported' | 'skipped' | 'failed'): string {
    if (status === 'imported') {
      return 'Importato';
    }
    if (status === 'skipped') {
      return 'Saltato';
    }
    return 'Fallito';
  }

  protected resultStatusTone(
    status: 'imported' | 'skipped' | 'failed',
  ): 'success' | 'warning' | 'error' {
    if (status === 'imported') {
      return 'success';
    }
    if (status === 'skipped') {
      return 'warning';
    }
    return 'error';
  }
}
