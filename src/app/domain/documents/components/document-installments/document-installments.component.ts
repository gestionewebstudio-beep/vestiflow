import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';

import type { CurrencyCode, Money } from '@core/models/common.model';
import { DEFAULT_CURRENCY, formatMoney } from '@core/utils/money.util';
import { DateInputComponent } from '@shared/components/date-input/date-input.component';
import {
  buildInstallmentGroup,
  installmentAmountText,
  installmentsCoveredMinor,
  installmentsSettledMinor,
  type InstallmentFormArray,
} from '../../utils/document-installments.util';

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Tabella delle rate di pagamento (Registrazione fattura fornitore e Fattura
 * di vendita): data scadenza, importo, saldato, data saldo, totali a piè
 * tabella. Il bottone «Aggiungi scadenza» resta nella testata di sezione del
 * chiamante, che invoca `add()` sul riferimento template.
 */
@Component({
  selector: 'app-document-installments',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, DateInputComponent],
  templateUrl: './document-installments.component.html',
  styleUrl: './document-installments.component.scss',
})
export class DocumentInstallmentsComponent {
  private readonly fb = inject(NonNullableFormBuilder);

  /** FormArray del chiamante: il componente lo popola e lo modifica. */
  readonly installments = input.required<InstallmentFormArray>();
  /** Totale lordo del documento: default della rata nuova e residuo a piè tabella. */
  readonly totalGrossMinor = input.required<number>();
  readonly currencyCode = input<CurrencyCode>(DEFAULT_CURRENCY);
  /** Prefisso degli id dei controlli (unicità nella pagina). */
  readonly idPrefix = input<string>('doc-installments');
  /** Testo mostrato quando non ci sono rate. */
  readonly emptyHint = input<string>(
    'Nessuna scadenza: aggiungi le scadenze di pagamento per tracciare saldo e residuo.',
  );

  /** Invalida i totali quando il FormArray cambia valore o composizione. */
  private readonly formTick = signal(0);

  constructor() {
    effect((onCleanup) => {
      const array = this.installments();
      const subscription = array.valueChanges.subscribe(() =>
        this.formTick.update((tick) => tick + 1),
      );
      onCleanup(() => subscription.unsubscribe());
    });
  }

  /**
   * Righe correnti del FormArray, rilette a ogni tick. La copia è necessaria:
   * `controls` è lo stesso array mutato sul posto, e un computed che
   * restituisse sempre quel riferimento non notificherebbe mai il template.
   */
  protected readonly groups = computed(() => {
    this.formTick();
    return [...this.installments().controls];
  });

  protected readonly settledTotal = computed<Money>(() => {
    this.formTick();
    return {
      amountMinor: installmentsSettledMinor(this.installments().getRawValue(), this.currencyCode()),
      currencyCode: this.currencyCode(),
    };
  });

  protected readonly outstandingTotal = computed<Money>(() => ({
    amountMinor: Math.max(0, this.totalGrossMinor() - this.settledTotal().amountMinor),
    currencyCode: this.currencyCode(),
  }));

  /** Aggiunge una rata proponendo il residuo non ancora coperto. */
  add(): void {
    const array = this.installments();
    const covered = installmentsCoveredMinor(array.getRawValue(), this.currencyCode());
    const residualMinor = Math.max(0, this.totalGrossMinor() - covered);
    array.push(
      buildInstallmentGroup(this.fb, {
        amountText:
          residualMinor > 0
            ? installmentAmountText({
                amountMinor: residualMinor,
                currencyCode: this.currencyCode(),
              })
            : '',
      }),
    );
    array.markAsDirty();
    this.formTick.update((tick) => tick + 1);
  }

  protected remove(index: number): void {
    const array = this.installments();
    array.removeAt(index);
    array.markAsDirty();
    this.formTick.update((tick) => tick + 1);
  }

  /** Spunta «Saldato»: propone oggi come data saldo se assente. */
  protected onSettledChange(index: number, checked: boolean): void {
    const group = this.installments().at(index);
    if (!group) {
      return;
    }
    group.controls.settled.setValue(checked);
    group.controls.settled.markAsDirty();
    if (checked && !group.controls.settledAt.value) {
      group.controls.settledAt.setValue(todayIsoDate());
    }
  }

  protected formatMoney(money: Money): string {
    return formatMoney(money);
  }
}
