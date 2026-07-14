import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';

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

  protected readonly vatSelectOptions = computed((): readonly SelectMenuOption[] => {
    const currentId = this.formGroup().controls.defaultVatCodeId.value;
    return this.vatCodes()
      .filter((entry) => isPurchaseVatCode(entry) && (entry.isActive || entry.id === currentId))
      .map((entry) => ({ value: entry.id, label: vatCodeOptionLabel(entry) }));
  });

  protected onVatSelect(value: string | null): void {
    this.formGroup().controls.defaultVatCodeId.setValue(value ?? '');
  }
}
