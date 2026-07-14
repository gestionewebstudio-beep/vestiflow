import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { ReactiveFormsModule, type FormControl } from '@angular/forms';

import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import type { VariantSummary } from '@features/products/models/variant-summary.model';

/**
 * Controlli della riga Arrivo merce usati dalla card mobile (§10.10).
 * Tipo strutturale: il FormGroup riga del padre (che ha più controlli) è
 * assegnabile per width subtyping; la card lega i singoli FormControl.
 */
export interface GoodsReceiptLineCardControls {
  readonly productName: FormControl<string>;
  readonly sku: FormControl<string>;
  readonly barcode: FormControl<string>;
  readonly quantity: FormControl<number>;
  readonly unitCost: FormControl<string>;
  readonly discountPercent: FormControl<string>;
  readonly sellingPrice: FormControl<string>;
  readonly compareAtPrice: FormControl<string>;
  readonly loadsStock: FormControl<boolean>;
}

export interface GoodsReceiptLineCardGroup {
  readonly controls: GoodsReceiptLineCardControls;
}

/**
 * Card riga prodotto per mobile (§10.10): campi principali subito visibili
 * (articolo, quantità, costo, totale), dettagli economici espandibili.
 * Dumb component: edita il FormGroup ricevuto e delega al padre ricerca
 * articolo, IVA, duplicazione ed eliminazione.
 */
@Component({
  selector: 'app-goods-receipt-line-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, SelectMenuComponent],
  templateUrl: './goods-receipt-line-card.component.html',
  styleUrl: './goods-receipt-line-card.component.scss',
})
export class GoodsReceiptLineCardComponent {
  readonly lineIndex = input.required<number>();
  readonly line = input.required<GoodsReceiptLineCardGroup>();
  readonly linked = input(false);
  readonly productLabel = input('');
  readonly incomplete = input(false);
  readonly totalLabel = input('');
  readonly grossLabel = input<string | null>(null);
  readonly vatOptions = input<readonly SelectMenuOption[]>([]);
  readonly vatValue = input('');
  readonly disabled = input(false);
  readonly canRemove = input(true);
  /** Suggerimenti ricerca contestuale (§7): stessa sorgente della tabella. */
  readonly suggestions = input<readonly VariantSummary[]>([]);
  readonly suggestionsOpen = input(false);
  /** True quando la riga è in modalità "Crea nuovo articolo" esplicita (§8). */
  readonly createMode = input(false);
  /** Toggle "Gestito a magazzino" del nuovo articolo (punto B, default sì). */
  readonly manageStock = input(true);

  readonly searchProduct = output<number>();
  readonly vatChange = output<string | null>();
  readonly fieldBlur = output<number>();
  readonly duplicated = output<number>();
  readonly removed = output<number>();
  readonly nameInput = output<string>();
  readonly nameFocus = output<number>();
  readonly nameBlur = output<number>();
  readonly suggestionPick = output<{ readonly lineIndex: number; readonly variantId: string }>();
  readonly createNewRequest = output<number>();
  readonly createNewCancel = output<number>();
  readonly manageStockChange = output<boolean>();
  /** "Apri scheda completa…" dal dropdown (punto D): slide-panel prefillato. */
  readonly anagraphicOpen = output<number>();

  protected readonly detailsOpen = signal(false);

  protected toggleDetails(): void {
    this.detailsOpen.update((open) => !open);
  }

  protected onNameInput(value: string): void {
    this.nameInput.emit(value);
  }

  protected pickSuggestion(variantId: string): void {
    this.suggestionPick.emit({ lineIndex: this.lineIndex(), variantId });
  }

  protected suggestionDetail(variant: VariantSummary): string {
    const parts: string[] = [];
    if (variant.sku) {
      parts.push(variant.sku);
    }
    if (variant.stockOnHand != null) {
      parts.push(`Disp. ${variant.stockOnHand}`);
    }
    return parts.join(' · ');
  }

  protected codeLabel(): string {
    const sku = this.line().controls.sku.value.trim();
    const barcode = this.line().controls.barcode.value.trim();
    if (sku && barcode) {
      return `${sku} · EAN ${barcode}`;
    }
    return sku || (barcode ? `EAN ${barcode}` : '');
  }

  /** Etichetta azione "Crea «testo»" nel dropdown (punto D). */
  protected createActionLabel(): string {
    const term = this.line().controls.productName.value.trim();
    return term ? `Crea «${term}»` : 'Crea nuovo articolo';
  }

  protected onManageStockToggle(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.manageStockChange.emit(target.checked);
  }
}
