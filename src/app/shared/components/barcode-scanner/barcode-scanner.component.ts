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

type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorCtor;
  }
}

/** Percorso same-origin del .wasm (copiato da angular.json); i CDN sono
 *  vietati dalla CSP connect-src 'self'. */
const ZXING_WASM_PATH = '/assets/zxing_reader.wasm';

/**
 * Scanner barcode. Su Chrome/Android usa l'API nativa BarcodeDetector; dove
 * manca (iOS Safari) carica in lazy un ponyfill ZXing-WASM equivalente, così
 * la scansione funziona su tutti i dispositivi. Ultimo fallback: input manuale.
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
  // Abilitato ovunque ci sia una fotocamera: dove manca l'API nativa subentra
  // il ponyfill WASM (vedi resolveDetectorCtor), quindi non è più un gate sui
  // soli Chrome/Android.
  protected readonly detectorSupported = signal(
    typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia,
  );

  private stream: MediaStream | null = null;
  private rafId: number | null = null;
  private detector: BarcodeDetectorLike | null = null;
  private detectorCtor: BarcodeDetectorCtor | null = null;

  /**
   * Costruttore del detector: API nativa se presente, altrimenti ponyfill
   * ZXing-WASM caricato in lazy (chunk separato, solo qui) e configurato per
   * prendere il .wasm da same-origin. Cache dopo la prima risoluzione.
   */
  private async resolveDetectorCtor(): Promise<BarcodeDetectorCtor | null> {
    if (this.detectorCtor) {
      return this.detectorCtor;
    }
    if (typeof window !== 'undefined' && window.BarcodeDetector) {
      this.detectorCtor = window.BarcodeDetector;
      return this.detectorCtor;
    }
    try {
      const mod = await import('barcode-detector/pure');
      mod.setZXingModuleOverrides({
        locateFile: (path: string, prefix: string) =>
          path.endsWith('.wasm') ? ZXING_WASM_PATH : prefix + path,
      });
      this.detectorCtor = mod.BarcodeDetector as unknown as BarcodeDetectorCtor;
      return this.detectorCtor;
    } catch {
      return null;
    }
  }

  protected async startScan(): Promise<void> {
    if (this.scanning()) {
      return;
    }

    this.errorMessage.set(null);
    this.scanning.set(true);

    const BarcodeDetectorCtor = await this.resolveDetectorCtor();
    if (!BarcodeDetectorCtor) {
      this.errorMessage.set(
        'Scanner non disponibile su questo dispositivo. Usa l’inserimento manuale.',
      );
      this.scanning.set(false);
      return;
    }

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
