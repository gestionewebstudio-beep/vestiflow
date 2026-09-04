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

import {
  BarcodeDetectionService,
  type BarcodeDetectorLike,
} from '@core/services/barcode-detection.service';
import { ButtonComponent } from '@shared/components/button/button.component';

/**
 * Scanner barcode inline (cassa/magazzino). La risoluzione del detector (native
 * o ponyfill ZXing-WASM per iOS) è delegata a BarcodeDetectionService; qui resta
 * il solo loop di cattura sul video. Ultimo fallback: input manuale.
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
  private readonly detection = inject(BarcodeDetectionService);
  private readonly videoRef = viewChild<ElementRef<HTMLVideoElement>>('video');

  readonly label = input<string>('Scansiona barcode');

  readonly scanned = output<string>();
  readonly closed = output<void>();

  protected readonly scanning = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  /**
   * ⛔ **Qui c'era `cameraSupported`**, cioè «il dispositivo ha una
   * fotocamera». Non basta più: dal 24/08/2026 il comando fotocamera si offre
   * solo su schermo compatto, e la decisione vive nel servizio — un posto
   * solo per dodici consumer.
   *
   * ⚠️ Il motore di scansione NON è stato toccato: su scrivania si legge col
   * lettore HID, che scrive nel campo come una tastiera e non passa di qui.
   */
  protected readonly detectorSupported = this.detection.cameraScanOffered;

  private stream: MediaStream | null = null;
  private rafId: number | null = null;
  private detector: BarcodeDetectorLike | null = null;

  protected async startScan(): Promise<void> {
    if (this.scanning()) {
      return;
    }

    this.errorMessage.set(null);
    this.scanning.set(true);

    const detector = await this.detection.createDetector();
    if (!detector) {
      this.errorMessage.set(
        'Scanner non disponibile su questo dispositivo. Usa l’inserimento manuale.',
      );
      this.scanning.set(false);
      return;
    }

    try {
      this.detector = detector;
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
