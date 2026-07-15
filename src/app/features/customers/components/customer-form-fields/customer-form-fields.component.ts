import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';

import type { PaymentOption } from '@core/models/payment-option.model';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

import type { CustomerFormGroup } from '@features/customers/utils/customer-form.util';

@Component({
  selector: 'app-customer-form-fields',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, SelectMenuComponent],
  templateUrl: './customer-form-fields.component.html',
  styleUrl: './customer-form-fields.component.scss',
})
export class CustomerFormFieldsComponent {
  readonly formGroup = input.required<CustomerFormGroup>();
  readonly idPrefix = input('customer-form');
  readonly anagraficaReadOnly = input(false);
  /** Visibile solo in modifica: in creazione il codice è assegnato automaticamente. */
  readonly showCodeField = input(false);
  /** Voci pagamento del tenant (dal parent smart): modalità e condizioni. */
  readonly paymentOptions = input<readonly PaymentOption[]>([]);

  protected readonly paymentMethodOptions = computed((): readonly SelectMenuOption[] =>
    this.buildPaymentOptions('method', this.formGroup().controls.paymentMethod.value),
  );

  protected readonly paymentTermsOptions = computed((): readonly SelectMenuOption[] =>
    this.buildPaymentOptions('terms', this.formGroup().controls.paymentTerms.value),
  );

  protected onPaymentMethodSelect(value: string | null): void {
    this.formGroup().controls.paymentMethod.setValue(value ?? '');
    this.formGroup().controls.paymentMethod.markAsDirty();
  }

  protected onPaymentTermsSelect(value: string | null): void {
    this.formGroup().controls.paymentTerms.setValue(value ?? '');
    this.formGroup().controls.paymentTerms.markAsDirty();
  }

  /** Voci attive + il valore corrente se non più in elenco (snapshot storico). */
  private buildPaymentOptions(
    kind: PaymentOption['kind'],
    currentValue: string,
  ): readonly SelectMenuOption[] {
    const options = this.paymentOptions()
      .filter((entry) => entry.kind === kind && (entry.isActive || entry.name === currentValue))
      .map((entry) => ({ value: entry.name, label: entry.name }));
    const current = currentValue.trim();
    if (current && !options.some((option) => option.value === current)) {
      return [...options, { value: current, label: `${current} (personalizzato)` }];
    }
    return options;
  }
}
