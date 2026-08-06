import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

import type { Money } from '@core/models/money.model';
import { formatDateTime } from '@core/utils/date.util';
import { formatMoney, parseMoneyInput } from '@core/utils/money.util';
import { ButtonComponent } from '@shared/components/button/button.component';
import { SlidePanelComponent } from '@shared/components/slide-panel/slide-panel.component';

import type {
  CashMovementType,
  CashSessionSummary,
  CloseCashSessionPayload,
  CreateCashMovementPayload,
} from '../../models/cash-session.model';

type SessionDialog = 'open' | 'movement' | 'close';

/**
 * Fascia stato sessione di cassa (dumb): mostra la cassa aperta/chiusa della
 * sede e raccoglie apertura, movimenti di cassetto e chiusura con conteggio.
 * Nessun service: i payload salgono al contenitore via output.
 */
@Component({
  selector: 'app-cash-session-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, SlidePanelComponent],
  templateUrl: './cash-session-bar.component.html',
  styleUrl: './cash-session-bar.component.scss',
})
export class CashSessionBarComponent {
  readonly session = input.required<CashSessionSummary | null>();
  readonly pending = input(false);
  readonly error = input<string | null>(null);
  readonly locationSelected = input(false);

  readonly openSession = output<{ openingFloatMinor: number; notes?: string }>();
  readonly addMovement = output<CreateCashMovementPayload>();
  readonly closeSession = output<CloseCashSessionPayload>();

  protected readonly formatDateTime = formatDateTime;

  protected readonly dialog = signal<SessionDialog | null>(null);

  // ── Apertura ─────────────────────────────────────────────────────────────
  protected readonly floatText = signal('');
  protected readonly openNotes = signal('');

  // ── Movimento di cassetto ────────────────────────────────────────────────
  protected readonly movementType = signal<CashMovementType>('withdrawal');
  protected readonly movementAmountText = signal('');
  protected readonly movementReason = signal('');

  // ── Chiusura ─────────────────────────────────────────────────────────────
  protected readonly countedCashText = signal('');
  protected readonly countedCardText = signal('');
  protected readonly countedOtherText = signal('');
  protected readonly closeNotes = signal('');

  private readonly floatMinor = computed(() => this.parse(this.floatText()));
  private readonly movementAmountMinor = computed(() => this.parse(this.movementAmountText()));
  protected readonly countedCashMinor = computed(() => this.parse(this.countedCashText()));
  protected readonly countedCardMinor = computed(() => this.parse(this.countedCardText()));
  protected readonly countedOtherMinor = computed(() => this.parse(this.countedOtherText()));

  protected readonly canSubmitOpen = computed(() => this.floatMinor() != null);
  protected readonly canSubmitMovement = computed(
    () => this.movementAmountMinor() != null && this.movementReason().trim().length >= 2,
  );
  protected readonly canSubmitClose = computed(() => this.countedCashMinor() != null);

  /** Differenza contanti live nel pannello di chiusura (contato − atteso). */
  protected readonly cashDifferenceMinor = computed(() => {
    const counted = this.countedCashMinor();
    const current = this.session();
    return counted == null || !current ? null : counted - current.expectedCashMinor;
  });

  protected openDialog(dialog: SessionDialog): void {
    if (dialog === 'close') {
      // Precompila il contato con l'atteso: chi quadra al centesimo conferma
      // e basta, chi trova differenze corregge il numero.
      const current = this.session();
      this.countedCashText.set(current ? this.moneyText(current.expectedCashMinor) : '');
      this.countedCardText.set('');
      this.countedOtherText.set('');
      this.closeNotes.set('');
    }
    this.dialog.set(dialog);
  }

  protected closeDialog(): void {
    this.dialog.set(null);
  }

  protected submitOpen(): void {
    const openingFloatMinor = this.floatMinor();
    if (openingFloatMinor == null) {
      return;
    }
    this.openSession.emit({
      openingFloatMinor,
      notes: this.openNotes().trim() || undefined,
    });
    this.floatText.set('');
    this.openNotes.set('');
    this.dialog.set(null);
  }

  protected submitMovement(): void {
    const amountMinor = this.movementAmountMinor();
    if (amountMinor == null || amountMinor <= 0 || !this.canSubmitMovement()) {
      return;
    }
    this.addMovement.emit({
      type: this.movementType(),
      amountMinor,
      reason: this.movementReason().trim(),
    });
    this.movementAmountText.set('');
    this.movementReason.set('');
    this.dialog.set(null);
  }

  protected submitClose(): void {
    const countedCashMinor = this.countedCashMinor();
    if (countedCashMinor == null) {
      return;
    }
    this.closeSession.emit({
      countedCashMinor,
      countedCardMinor: this.countedCardMinor() ?? undefined,
      countedOtherMinor: this.countedOtherMinor() ?? undefined,
      notes: this.closeNotes().trim() || undefined,
    });
    this.dialog.set(null);
  }

  // ── Input handlers ───────────────────────────────────────────────────────

  protected onTextInput(
    target:
      | 'float'
      | 'movementAmount'
      | 'cash'
      | 'card'
      | 'other'
      | 'openNotes'
      | 'movementReason'
      | 'closeNotes',
    event: Event,
  ): void {
    const value = (event.target as HTMLInputElement).value;
    switch (target) {
      case 'float':
        this.floatText.set(value);
        break;
      case 'movementAmount':
        this.movementAmountText.set(value);
        break;
      case 'cash':
        this.countedCashText.set(value);
        break;
      case 'card':
        this.countedCardText.set(value);
        break;
      case 'other':
        this.countedOtherText.set(value);
        break;
      case 'openNotes':
        this.openNotes.set(value);
        break;
      case 'movementReason':
        this.movementReason.set(value);
        break;
      case 'closeNotes':
        this.closeNotes.set(value);
        break;
    }
  }

  protected onMovementTypeChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === 'deposit' || value === 'withdrawal') {
      this.movementType.set(value);
    }
  }

  // ── Display ──────────────────────────────────────────────────────────────

  protected money(amountMinor: number): string {
    const money: Money = { amountMinor, currencyCode: 'EUR' };
    return formatMoney(money);
  }

  private moneyText(amountMinor: number): string {
    return (amountMinor / 100).toFixed(2).replace('.', ',');
  }

  /** Testo importo → unità minori; vuoto o non parsabile = null. */
  private parse(text: string): number | null {
    const trimmed = text.trim();
    if (trimmed === '') {
      return null;
    }
    const parsed = parseMoneyInput(trimmed);
    return parsed && parsed.amountMinor >= 0 ? parsed.amountMinor : null;
  }
}
