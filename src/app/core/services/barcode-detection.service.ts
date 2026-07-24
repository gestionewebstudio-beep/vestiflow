import { Injectable } from '@angular/core';

/** Superficie minima usata dai consumer (native o ponyfill). */
export interface BarcodeDetectorLike {
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

const SCAN_FORMATS = ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code'];

/**
 * Risoluzione condivisa del BarcodeDetector: API nativa su Chrome/Android,
 * ponyfill ZXing-WASM (lazy, .wasm same-origin) dove manca — es. iOS Safari.
 * Usato sia dallo scanner inline (cassa/magazzino) sia dall'overlay fotocamera
 * fullscreen dell'Ordine cliente: la logica complessa (fallback WASM) vive qui,
 * i consumer gestiscono solo il proprio loop di cattura sul video.
 */
@Injectable({ providedIn: 'root' })
export class BarcodeDetectionService {
  private detectorCtor: BarcodeDetectorCtor | null = null;

  /** Vero se il dispositivo espone una fotocamera (il resto lo copre il WASM). */
  get cameraSupported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }

  /** Nuovo detector pronto all'uso, o null se non risolvibile. */
  async createDetector(): Promise<BarcodeDetectorLike | null> {
    const ctor = await this.resolveDetectorCtor();
    return ctor ? new ctor({ formats: [...SCAN_FORMATS] }) : null;
  }

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
}
