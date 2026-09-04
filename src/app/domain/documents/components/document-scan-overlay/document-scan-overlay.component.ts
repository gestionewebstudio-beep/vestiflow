import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { take } from 'rxjs';

import { BarcodeDetectionService } from '@core/services/barcode-detection.service';
import type { BarcodeDetectorLike } from '@core/services/barcode-detection.service';
import { BarcodeLookupService } from '@domain/products/services/barcode-lookup.service';
import { formatMoney } from '@core/utils/money.util';
import type { VariantSummary } from '@domain/products/models/variant-summary.model';
import { ProductService } from '@domain/products/services/product.service';
import { ButtonComponent } from '@shared/components/button/button.component';
import { InlineBannerComponent } from '@shared/components/inline-banner/inline-banner.component';

/** Riga in verifica nella metà inferiore, prima di essere emessa. */
interface PendingScanLine {
  readonly variant: VariantSummary;
  readonly quantity: number;
}

/**
 * Overlay fotocamera a tutto schermo, «metà/metà»: sopra la fotocamera live
 * sempre attiva, sotto la vista dinamica — articolo riconosciuto con stepper,
 * oppure «codice non trovato» con Riprova / Aggiungi / Crea prodotto.
 *
 * **Scansione continua**: al codice nuovo l'articolo precedente viene emesso
 * da sé, e lo stesso codice riscansionato **incrementa** invece di duplicare.
 * Per riscansionare due volte lo stesso capo il barcode deve uscire dal campo
 * e rientrare — al banco quel gesto vuol dire «due pezzi» (`11` A14).
 *
 * ⭐ **Sta in `domain/` perché il comportamento è comune**, non perché sia
 * nato nell'Ordine cliente (21/08/2026). Non importava niente da quella
 * feature: riconosce un codice, mostra la variante, conta i pezzi, e**emette**.
 * Che cosa diventi la riga lo decide la maschera che lo ospita — l'Ordine
 * cliente impegna, la Vendita al banco scarica alla conclusione: il dominio
 * resta fuori da qui, e per questo l'overlay è uno solo.
 *
 * ⛔ **Nessuna creazione automatica e nessun popup automatico** (`11` A14):
 * su un codice non trovato l'overlay mostra tre AZIONI, e non fa niente
 * finché l'operatore non ne sceglie una.
 */
@Component({
  selector: 'app-document-scan-overlay',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, InlineBannerComponent],
  templateUrl: './document-scan-overlay.component.html',
  styleUrl: './document-scan-overlay.component.scss',
})
export class DocumentScanOverlayComponent {
  readonly locationId = input<string | null>(null);
  /**
   * La frase a schermo quando non c'è ancora niente da mostrare. È l'unico
   * punto in cui il documento ospite si nomina: «all'ordine» al banco sarebbe
   * la parola sbagliata.
   */
  readonly idleHint = input<string>('Inquadra un codice per aggiungerlo.');
  /**
   * Chi non gestisce il catalogo non vede i comandi che creano un articolo:
   * davanti al cliente un pulsante che risponde «non autorizzato» lascia il
   * banco fermo senza dire cosa fare. Al loro posto resta scritto a chi
   * chiedere l'articolo mancante.
   */
  readonly canCreateProducts = input<boolean>(true);

  /** Riga da aggiungere al documento (la maschera deduplica o incrementa). */
  readonly lineAdded = output<{ readonly variantId: string; readonly quantity: number }>();
  /** Quick-add articolo non catalogato: la maschera crea il prodotto bozza. */
  readonly quickAddRequested = output<{
    readonly name: string;
    readonly priceText: string;
    readonly ean: string;
    readonly quantity: number;
  }>();
  /** «Crea prodotto»: apre il form completo con l'EAN precompilato. */
  readonly createFullRequested = output<string>();
  readonly closed = output<void>();

  private readonly detection = inject(BarcodeDetectionService);
  private readonly barcodeLookup = inject(BarcodeLookupService);
  private readonly productService = inject(ProductService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly videoRef = viewChild<ElementRef<HTMLVideoElement>>('video');

  protected readonly formatMoney = formatMoney;

  protected readonly phase = signal<'idle' | 'recognized' | 'notFound' | 'quickAdd'>('idle');
  protected readonly current = signal<PendingScanLine | null>(null);
  protected readonly notFoundEan = signal('');
  protected readonly cameraError = signal<string | null>(null);
  protected readonly resolving = signal(false);

  // Mini-form quick-add.
  protected readonly qaName = signal('');
  protected readonly qaPriceText = signal('');
  protected readonly qaQty = signal(1);

  private stream: MediaStream | null = null;
  private rafId: number | null = null;
  private detector: BarcodeDetectorLike | null = null;
  /** Ultimo codice processato + flag «uscito dal campo»: per riscansionare lo
   *  stesso codice il barcode deve lasciare la vista e rientrare. */
  private lastCode = '';
  private cleared = true;

  constructor() {
    afterNextRender(() => void this.startCamera());
    this.destroyRef.onDestroy(() => this.releaseCamera());
  }

  private async startCamera(): Promise<void> {
    const detector = await this.detection.createDetector();
    if (!detector) {
      this.cameraError.set('Scanner non disponibile su questo dispositivo.');
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
      this.loop(video);
    } catch {
      this.cameraError.set('Impossibile accedere alla fotocamera. Controlla i permessi.');
      this.releaseCamera();
    }
  }

  private loop(video: HTMLVideoElement): void {
    const tick = async (): Promise<void> => {
      if (!this.detector || !this.stream) {
        return;
      }
      // Mentre si compila il quick-add la scansione è in pausa.
      if (this.phase() !== 'quickAdd' && video.videoWidth) {
        try {
          const codes = await this.detector.detect(video);
          const code = codes[0]?.rawValue?.trim();
          if (!code) {
            this.cleared = true;
          } else if (code !== this.lastCode || this.cleared) {
            this.lastCode = code;
            this.cleared = false;
            this.onCode(code);
          }
        } catch {
          // Frame non decodificabile: continua.
        }
      }
      this.rafId = globalThis.requestAnimationFrame(() => void tick());
    };
    void tick();
  }

  private onCode(code: string): void {
    this.vibrate();
    const currentLine = this.current();
    // Stesso codice del corrente → incrementa, niente duplicato.
    if (currentLine && (currentLine.variant.barcode === code || currentLine.variant.sku === code)) {
      this.current.set({ ...currentLine, quantity: currentLine.quantity + 1 });
      return;
    }
    this.resolving.set(true);
    this.barcodeLookup
      .resolveVariantIdByCode(code, { locationId: this.locationId() ?? undefined })
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (variantId) => {
          if (!variantId) {
            this.resolving.set(false);
            this.flushCurrent();
            this.notFoundEan.set(code);
            this.phase.set('notFound');
            return;
          }
          this.loadVariant(variantId);
        },
        error: () => {
          this.resolving.set(false);
          this.flushCurrent();
          this.notFoundEan.set(code);
          this.phase.set('notFound');
        },
      });
  }

  private loadVariant(variantId: string): void {
    this.productService
      .searchVariantSummaries({ variantId, locationId: this.locationId() ?? undefined })
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          this.resolving.set(false);
          const variant = rows[0];
          if (!variant) {
            this.notFoundEan.set(this.lastCode);
            this.phase.set('notFound');
            return;
          }
          // Nuovo articolo: aggiungi il precedente e mostra questo.
          this.flushCurrent();
          this.current.set({ variant, quantity: 1 });
          this.phase.set('recognized');
        },
        error: () => this.resolving.set(false),
      });
  }

  /** Emette la riga corrente verso l'ordine (se presente). */
  private flushCurrent(): void {
    const line = this.current();
    if (line && line.quantity > 0) {
      this.lineAdded.emit({ variantId: line.variant.variantId, quantity: line.quantity });
    }
    this.current.set(null);
  }

  protected incQty(): void {
    const line = this.current();
    if (line) {
      this.current.set({ ...line, quantity: line.quantity + 1 });
    }
  }

  protected decQty(): void {
    const line = this.current();
    if (line) {
      this.current.set({ ...line, quantity: Math.max(1, line.quantity - 1) });
    }
  }

  protected lineTotal(line: PendingScanLine): string {
    return formatMoney({
      amountMinor: line.variant.sellingPrice.amountMinor * line.quantity,
      currencyCode: line.variant.sellingPrice.currencyCode,
    });
  }

  // ── Codice non trovato ───────────────────────────────────────────────────
  protected retry(): void {
    this.notFoundEan.set('');
    this.lastCode = '';
    this.cleared = true;
    this.phase.set(this.current() ? 'recognized' : 'idle');
  }

  protected startQuickAdd(): void {
    this.qaName.set('');
    this.qaPriceText.set('');
    this.qaQty.set(1);
    this.phase.set('quickAdd');
  }

  protected qaInc(): void {
    this.qaQty.update((q) => q + 1);
  }

  protected qaDec(): void {
    this.qaQty.update((q) => Math.max(1, q - 1));
  }

  protected get qaValid(): boolean {
    return this.qaName().trim().length > 0 && this.qaPriceText().trim().length > 0;
  }

  protected submitQuickAdd(): void {
    if (!this.qaValid) {
      return;
    }
    this.quickAddRequested.emit({
      name: this.qaName().trim(),
      priceText: this.qaPriceText().trim(),
      ean: this.notFoundEan(),
      quantity: this.qaQty(),
    });
    // Torna a scansione per il prossimo codice.
    this.notFoundEan.set('');
    this.lastCode = '';
    this.cleared = true;
    this.phase.set('idle');
  }

  protected cancelQuickAdd(): void {
    this.phase.set('notFound');
  }

  protected createFull(): void {
    this.createFullRequested.emit(this.notFoundEan());
    this.close();
  }

  /** Chiusura: salva la riga corrente se ha quantità, poi esce. */
  protected close(): void {
    this.flushCurrent();
    this.releaseCamera();
    this.closed.emit();
  }

  private vibrate(): void {
    try {
      navigator.vibrate?.(30);
    } catch {
      // Best-effort: nessun haptic dove non supportato (iOS Safari).
    }
  }

  private releaseCamera(): void {
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
}
