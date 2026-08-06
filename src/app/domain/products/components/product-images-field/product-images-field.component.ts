import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import type { ProductImage } from '@core/models/product-image.model';

const MAX_IMAGES = 10;
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Campo immagini prodotto (presentazionale).
 * In create accumula File locali; in edit può mostrare immagini già salvate.
 */
@Component({
  selector: 'app-product-images-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-images-field.component.html',
  styleUrl: './product-images-field.component.scss',
})
export class ProductImagesFieldComponent {
  private readonly destroyRef = inject(DestroyRef);

  readonly existingImages = input<readonly ProductImage[]>([]);
  /** File selezionati dal wizard padre: sopravvivono al cambio step. */
  readonly selectedFiles = input<readonly File[]>([]);
  readonly disabled = input(false);

  readonly filesChange = output<readonly File[]>();
  readonly removeExisting = output<string>();

  protected readonly pendingFiles = signal<
    readonly { readonly file: File; readonly previewUrl: string }[]
  >([]);
  protected readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      const files = this.selectedFiles();
      const current = this.pendingFiles();
      const alreadySynced =
        files.length === current.length &&
        files.every((file, index) => file === current[index]?.file);
      if (alreadySynced) {
        return;
      }

      this.revokePendingPreviews();
      this.pendingFiles.set(
        files.map((file) => ({
          file,
          previewUrl: URL.createObjectURL(file),
        })),
      );
    });

    this.destroyRef.onDestroy(() => this.revokePendingPreviews());
  }

  protected onFileSelected(event: Event): void {
    if (this.disabled()) {
      return;
    }
    const inputEl = event.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    inputEl.value = '';
    if (!file) {
      return;
    }

    this.error.set(null);
    const total = this.existingImages().length + this.pendingFiles().length;
    if (total >= MAX_IMAGES) {
      this.error.set(`Massimo ${MAX_IMAGES} immagini per prodotto.`);
      return;
    }
    if (file.size > MAX_BYTES) {
      this.error.set('Immagine troppo grande (max 5 MB).');
      return;
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      this.error.set('Formato non supportato. Usa JPEG, PNG o WebP.');
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    const next = [...this.pendingFiles(), { file, previewUrl }];
    this.pendingFiles.set(next);
    this.filesChange.emit(next.map((entry) => entry.file));
    // Evita scroll verso l'input nascosto quando si chiude il dialog del file system.
    inputEl.blur();
  }

  protected removePending(index: number): void {
    const current = [...this.pendingFiles()];
    const removed = current.splice(index, 1)[0];
    if (removed) {
      URL.revokeObjectURL(removed.previewUrl);
    }
    this.pendingFiles.set(current);
    this.filesChange.emit(current.map((entry) => entry.file));
  }

  protected onRemoveExisting(imageId: string): void {
    this.removeExisting.emit(imageId);
  }

  private revokePendingPreviews(): void {
    for (const entry of this.pendingFiles()) {
      URL.revokeObjectURL(entry.previewUrl);
    }
  }
}
