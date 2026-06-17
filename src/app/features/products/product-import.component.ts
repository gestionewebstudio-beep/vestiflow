import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
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
    return data.products.filter((item) => item.status !== 'error').map((item) => item.handle);
  });

  protected readonly canImport = computed(() => this.readyHandles().length > 0 && !this.loading());

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
    this.productService.previewProductImport(file).subscribe({
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
    this.productService.importProducts(file, handles).subscribe({
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
    if (item.status === 'ready') {
      return 'success';
    }
    if (item.status === 'warning') {
      return 'warning';
    }
    return 'error';
  }

  protected statusLabel(item: ProductImportPreviewItem): string {
    if (item.status === 'ready') {
      return 'Pronto';
    }
    if (item.status === 'warning') {
      return 'Con avvisi';
    }
    return 'Errore';
  }
}
