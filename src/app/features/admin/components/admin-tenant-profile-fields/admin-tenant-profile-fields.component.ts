import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ReactiveFormsModule, type FormGroup } from '@angular/forms';

import { TAX_REGIME_OPTIONS } from '@domain/tenant/models/tax-regime.model';

@Component({
  selector: 'app-admin-tenant-profile-fields',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './admin-tenant-profile-fields.component.html',
  styleUrl: './admin-tenant-profile-fields.component.scss',
})
export class AdminTenantProfileFieldsComponent {
  readonly form = input.required<FormGroup>();
  readonly showError = input.required<(controlName: string) => boolean>();

  protected readonly taxRegimes = TAX_REGIME_OPTIONS;
}
