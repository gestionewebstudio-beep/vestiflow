import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  type ElementRef,
  inject,
  Injector,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';

import { ButtonComponent } from '@shared/components/button/button.component';
import {
  AVATAR_CROP_OUTPUT_PX,
  AVATAR_CROP_VIEWPORT_PX,
  AVATAR_CROP_ZOOM_MAX,
  AVATAR_CROP_ZOOM_MIN,
} from '@shared/constants/avatar-crop.constants';
import {
  clampPan,
  computeCoverScale,
  cropAvatarToBlob,
  effectiveScale,
} from '@shared/utils/avatar-crop.util';

@Component({
  selector: 'app-avatar-crop-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent],
  templateUrl: './avatar-crop-dialog.component.html',
  styleUrl: './avatar-crop-dialog.component.scss',
})
export class AvatarCropDialogComponent {
  private readonly injector = inject(Injector);

  readonly imageSrc = input<string | null>(null);
  readonly busy = input(false);

  readonly open = model(false);

  readonly confirmed = output<Blob>();
  readonly dismissed = output<void>();

  private readonly dialogRef = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly imageRef = viewChild<ElementRef<HTMLImageElement>>('cropImage');

  protected readonly viewportPx = AVATAR_CROP_VIEWPORT_PX;
  protected readonly zoomMin = AVATAR_CROP_ZOOM_MIN;
  protected readonly zoomMax = AVATAR_CROP_ZOOM_MAX;

  protected readonly zoom = signal(AVATAR_CROP_ZOOM_MIN);
  protected readonly panX = signal(0);
  protected readonly panY = signal(0);
  protected readonly naturalWidth = signal(0);
  protected readonly naturalHeight = signal(0);
  protected readonly imageReady = signal(false);
  protected readonly exportError = signal<string | null>(null);

  private dragStart: {
    readonly x: number;
    readonly y: number;
    readonly panX: number;
    readonly panY: number;
  } | null = null;

  protected readonly displayScale = computed(() => {
    const width = this.naturalWidth();
    const height = this.naturalHeight();
    if (!width || !height) {
      return 1;
    }
    const cover = computeCoverScale(width, height);
    return effectiveScale(cover, this.zoom());
  });

  protected readonly imageWidthPx = computed(() => this.naturalWidth() * this.displayScale());

  protected readonly imageHeightPx = computed(() => this.naturalHeight() * this.displayScale());

  protected readonly imageLeftPx = computed(() => {
    return AVATAR_CROP_VIEWPORT_PX / 2 - this.imageWidthPx() / 2 + this.panX();
  });

  protected readonly imageTopPx = computed(() => {
    return AVATAR_CROP_VIEWPORT_PX / 2 - this.imageHeightPx() / 2 + this.panY();
  });

  constructor() {
    effect(() => {
      const dialog = this.dialogRef().nativeElement;
      if (this.open() && !dialog.open) {
        dialog.showModal();
      } else if (!this.open() && dialog.open) {
        dialog.close();
      }
    });

    effect(() => {
      if (this.open() && this.imageSrc()) {
        this.resetCropState();
        afterNextRender(() => this.syncDimensionsFromElement(), { injector: this.injector });
      }
    });
  }

  protected onImageLoad(): void {
    this.syncDimensionsFromElement();
  }

  protected onZoomInput(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.setZoom(value);
  }

  protected onPointerDown(event: PointerEvent): void {
    if (!this.imageReady()) {
      return;
    }
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.dragStart = {
      x: event.clientX,
      y: event.clientY,
      panX: this.panX(),
      panY: this.panY(),
    };
  }

  protected onPointerMove(event: PointerEvent): void {
    if (!this.dragStart) {
      return;
    }
    const deltaX = event.clientX - this.dragStart.x;
    const deltaY = event.clientY - this.dragStart.y;
    this.applyPan(this.dragStart.panX + deltaX, this.dragStart.panY + deltaY);
  }

  protected onPointerUp(event: PointerEvent): void {
    if (this.dragStart) {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
      this.dragStart = null;
    }
  }

  protected async onConfirm(): Promise<void> {
    const image = this.imageRef()?.nativeElement;
    if (!this.imageReady() || !image || this.busy()) {
      return;
    }

    this.exportError.set(null);

    try {
      const blob = await cropAvatarToBlob(
        image,
        { zoom: this.zoom(), panX: this.panX(), panY: this.panY() },
        AVATAR_CROP_OUTPUT_PX,
      );
      this.confirmed.emit(blob);
    } catch {
      this.exportError.set('Impossibile elaborare l’immagine. Riprova.');
    }
  }

  protected onCancel(): void {
    this.open.set(false);
    this.dismissed.emit();
  }

  protected onNativeClose(): void {
    if (this.open()) {
      this.open.set(false);
      this.dismissed.emit();
    }
  }

  private setZoom(value: number): void {
    this.zoom.set(value);
    this.applyPan(this.panX(), this.panY());
  }

  private applyPan(nextPanX: number, nextPanY: number): void {
    const width = this.naturalWidth();
    const height = this.naturalHeight();
    if (!width || !height) {
      return;
    }
    const scale = effectiveScale(computeCoverScale(width, height), this.zoom());
    const clamped = clampPan(nextPanX, nextPanY, width, height, scale);
    this.panX.set(clamped.panX);
    this.panY.set(clamped.panY);
  }

  private resetCropState(): void {
    this.zoom.set(AVATAR_CROP_ZOOM_MIN);
    this.panX.set(0);
    this.panY.set(0);
    this.naturalWidth.set(0);
    this.naturalHeight.set(0);
    this.exportError.set(null);
    this.imageReady.set(false);
    this.dragStart = null;
  }

  private syncDimensionsFromElement(): void {
    const image = this.imageRef()?.nativeElement;
    if (!image?.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
      return;
    }
    this.naturalWidth.set(image.naturalWidth);
    this.naturalHeight.set(image.naturalHeight);
    this.imageReady.set(true);
    this.applyPan(0, 0);
  }
}
