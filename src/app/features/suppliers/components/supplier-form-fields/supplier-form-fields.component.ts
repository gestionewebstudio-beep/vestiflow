import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';

import type { PaymentOption } from '@core/models/payment-option.model';
import { isPurchaseVatCode, vatCodeOptionLabel, type VatCode } from '@core/models/vat-code.model';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

import type { SupplierFormGroup } from '@features/suppliers/utils/supplier-form.util';

@Component({
  selector: 'app-supplier-form-fields',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, SelectMenuComponent],
  templateUrl: './supplier-form-fields.component.html',
  styleUrl: './supplier-form-fields.component.scss',
})
export class SupplierFormFieldsComponent {
  readonly formGroup = input.required<SupplierFormGroup>();
  /** Prefisso univoco per id/for (es. `gr-new-supplier`, `po-new-supplier`). */
  readonly idPrefix = input.required<string>();
  /** Visibile solo in modifica: in creazione il codice è assegnato automaticamente dal backend. */
  readonly showCodeField = input(false);
  /** Codici IVA del tenant (dal parent smart), per la tendina "Codice IVA predefinito". */
  readonly vatCodes = input<readonly VatCode[]>([]);
  /** Voci pagamento del tenant (dal parent smart): modalità e condizioni. */
  readonly paymentOptions = input<readonly PaymentOption[]>([]);

  protected readonly vatSelectOptions = computed((): readonly SelectMenuOption[] => {
    const currentId = this.formGroup().controls.defaultVatCodeId.value;
    return this.vatCodes()
      .filter((entry) => isPurchaseVatCode(entry) && (entry.isActive || entry.id === currentId))
      .map((entry) => ({ value: entry.id, label: vatCodeOptionLabel(entry) }));
  });

  protected readonly paymentMethodOptions = computed((): readonly SelectMenuOption[] =>
    this.buildPaymentOptions('method', this.formGroup().controls.paymentMethod.value),
  );

  protected readonly paymentTermsOptions = computed((): readonly SelectMenuOption[] =>
    this.buildPaymentOptions('terms', this.formGroup().controls.paymentTerms.value),
  );

  protected onVatSelect(value: string | null): void {
    this.formGroup().controls.defaultVatCodeId.setValue(value ?? '');
  }

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
