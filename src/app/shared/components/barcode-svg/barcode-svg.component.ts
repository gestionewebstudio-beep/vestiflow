import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  input,
  viewChild,
} from '@angular/core';

import { detectBarcodeFormat } from '@core/utils/barcode.util';

/**
 * Renderizza un codice a barre scansionabile in SVG (JsBarcode).
 * Dumb puro: aggiorna il SVG quando cambia `value`.
 */
@Component({
  selector: 'app-barcode-svg',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './barcode-svg.component.html',
  styleUrl: './barcode-svg.component.scss',
})
export class BarcodeSvgComponent {
  readonly value = input.required<string>();
  readonly ariaLabel = input<string>('Codice a barre');
  readonly barHeight = input(40);
  readonly barWidth = input(1.8);

  private readonly svgRef = viewChild.required<ElementRef<SVGSVGElement>>('svg');

  constructor() {
    effect(() => {
      const trimmed = this.value().trim();
      const svg = this.svgRef().nativeElement;
      if (!trimmed) {
        svg.innerHTML = '';
        return;
      }
      void this.renderBarcode(svg, trimmed, this.barHeight(), this.barWidth());
    });
  }

  private async renderBarcode(
    svg: SVGSVGElement,
    value: string,
    height: number,
    width: number,
  ): Promise<void> {
    const { default: JsBarcode } = await import('jsbarcode');
    const format = detectBarcodeFormat(value);
    svg.innerHTML = '';

    try {
      JsBarcode(svg, value, {
        format,
        displayValue: false,
        margin: 0,
        height,
        width,
      });
      return;
    } catch {
      // Fallback: Code 128 accetta alfanumerico se EAN/UPC non validi.
    }

    try {
      JsBarcode(svg, value, {
        format: 'CODE128',
        displayValue: false,
        margin: 0,
        height,
        width,
      });
    } catch {
      svg.innerHTML = '';
    }
  }
}
