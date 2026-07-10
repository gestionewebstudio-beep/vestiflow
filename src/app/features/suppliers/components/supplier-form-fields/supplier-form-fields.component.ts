import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';

import { COMMON_VAT_RATES } from '@core/models/product-catalog.model';
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

  protected readonly vatSelectOptions: readonly SelectMenuOption[] = COMMON_VAT_RATES.map(
    (rate) => ({
      value: String(rate),
      label: `${rate}%`,
    }),
  );

  protected onVatSelect(value: string | null): void {
    this.formGroup().controls.defaultVatRatePercent.setValue(value ?? '');
  }
}
