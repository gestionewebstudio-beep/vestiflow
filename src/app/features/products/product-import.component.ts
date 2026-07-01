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
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { ButtonComponent } from '@shared/components/button/button.component';

import type {
  ProductImportPreview,
  ProductImportPreviewItem,
  ProductImportResult,
} from './models/product-import.model';
import { ProductService } from './services/product.service';

type ImportPhase = 'upload' | 'preview' | 'done';

@Component({
  selector: 'app-product-import',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, BadgeComponent],
  templateUrl: './product-import.component.html',
  styleUrl: './product-import.component.scss',
})
export class ProductImportComponent {
  private readonly productService = inject(ProductService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly authService = inject(AuthService);

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
