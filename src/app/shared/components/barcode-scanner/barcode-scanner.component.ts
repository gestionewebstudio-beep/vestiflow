import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

import { ButtonComponent } from '@shared/components/button/button.component';

interface BarcodeDetectorLike {
  detect(source: ImageBitmapSource): Promise<readonly { rawValue: string }[]>;
}

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike;
  }
}

/**
 * Scanner barcode via BarcodeDetector (Chrome/Android). Fallback: input manuale.
 */
@Component({
  selector: 'app-barcode-scanner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent],
  templateUrl: './barcode-scanner.component.html',
  styleUrl: './barcode-scanner.component.scss',
})
export class BarcodeScannerComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly videoRef = viewChild<ElementRef<HTMLVideoElement>>('video');

  readonly label = input<string>('Scansiona barcode');

  readonly scanned = output<string>();
  readonly closed = output<void>();

  protected readonly scanning = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly detectorSupported = signal(
    typeof window !== 'undefined' && typeof window.BarcodeDetector !== 'undefined',
  );

  private stream: MediaStream | null = null;
  private rafId: number | null = null;
  private detector: BarcodeDetectorLike | null = null;

  protected async startScan(): Promise<void> {
    if (!this.detectorSupported()) {
      return;
    }

    const BarcodeDetectorCtor = window.BarcodeDetector;
    if (!BarcodeDetectorCtor) {
      return;
    }

    this.errorMessage.set(null);
    this.scanning.set(true);

    try {
      this.detector = new BarcodeDetectorCtor({
        formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code'],
      });
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });

      const video = this.videoRef()?.nativeElement;
      if (!video) {
        throw new Error('Video element missing');
      }

      video.srcObject = this.stream;
      await video.play();

      const tick = async (): Promise<void> => {
        if (!this.scanning() || !this.detector || !video.videoWidth) {
          return;
        }

        try {
          const codes = await this.detector.detect(video);
          const value = codes[0]?.rawValue?.trim();
          if (value) {
            this.scanned.emit(value);
            this.stopScan();
            return;
          }
        } catch {
          // Frame non decodificabile: continua il loop.
        }

        this.rafId = globalThis.requestAnimationFrame(() => {
          void tick();
        });
      };

      void tick();
    } catch {
      this.errorMessage.set(
        'Impossibile accedere alla fotocamera. Controlla i permessi o usa l’inserimento manuale.',
      );
      this.stopScan();
    }
  }

  protected stopScan(): void {
    this.releaseCamera();
    this.closed.emit();
  }

  private releaseCamera(): void {
    this.scanning.set(false);
    if (this.rafId !== null) {
      globalThis.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }
    this.detector = null;
  }

  constructor() {
    // Alla destroy si rilascia solo la fotocamera: emettere `closed` su un
    // OutputRef distrutto genererebbe NG0953 a ogni cambio pagina.
    this.destroyRef.onDestroy(() => this.releaseCamera());
  }
}
