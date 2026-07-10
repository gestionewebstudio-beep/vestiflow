import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';

import type { CustomerFormGroup } from '@features/customers/utils/customer-form.util';

@Component({
  selector: 'app-customer-form-fields',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './customer-form-fields.component.html',
  styleUrl: './customer-form-fields.component.scss',
})
export class CustomerFormFieldsComponent {
  readonly formGroup = input.required<CustomerFormGroup>();
  readonly idPrefix = input('customer-form');
  readonly anagraficaReadOnly = input(false);
}
