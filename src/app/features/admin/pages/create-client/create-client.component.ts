import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { isAppError } from '@core/models/app-error.model';
import { formatDateTime } from '@core/utils/date.util';
import { ButtonComponent } from '@shared/components/button/button.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import type { ProvisionedTenant, TenantSummary } from '../../models/admin-tenant.model';
import { AdminTenantsService } from '../../services/admin-tenants.service';

/**
 * Provisioning di un nuovo cliente (tenant + owner + negozio/location base).
 * Visibile solo agli operatori piattaforma (`isPlatformAdmin`).
 */
@Component({
  selector: 'app-create-client',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ButtonComponent, TableSkeletonComponent],
  templateUrl: './create-client.component.html',
  styleUrl: './create-client.component.scss',
})
export class CreateClientComponent {
  private readonly adminTenants = inject(AdminTenantsService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly formatDateTime = formatDateTime;

  protected readonly tenantsLoading = signal(true);
  protected readonly tenants = signal<readonly TenantSummary[]>([]);
  protected readonly tenantsError = signal<string | null>(null);

  protected readonly submitLoading = signal(false);
  protected readonly submitError = signal<string | null>(null);
  protected readonly created = signal<ProvisionedTenant | null>(null);

  protected readonly form = this.fb.group({
    tenantName: this.fb.control('', {
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(120)],
    }),
    ownerDisplayName: this.fb.control('', {
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(120)],
    }),
    ownerEmail: this.fb.control('', {
      validators: [Validators.required, Validators.email, Validators.maxLength(255)],
    }),
    ownerPassword: this.fb.control('', {
      validators: [Validators.required, Validators.minLength(8), Validators.maxLength(128)],
    }),
    storeName: this.fb.control('', { validators: [Validators.maxLength(120)] }),
    locationName: this.fb.control('', { validators: [Validators.maxLength(120)] }),
  });

  constructor() {
    this.loadTenants();
  }

  protected showError(controlName: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && control.touched;
  }

  protected onSubmit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.submitLoading()) {
      return;
    }

    this.submitLoading.set(true);
    this.submitError.set(null);

    const raw = this.form.getRawValue();
    const storeName = raw.storeName.trim();
    const locationName = raw.locationName.trim();

    this.adminTenants
      .createTenant({
        tenantName: raw.tenantName.trim(),
        ownerDisplayName: raw.ownerDisplayName.trim(),
        ownerEmail: raw.ownerEmail.trim(),
        ownerPassword: raw.ownerPassword,
        ...(storeName ? { storeName } : {}),
        ...(locationName ? { locationName } : {}),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.submitLoading.set(false);
          this.created.set(result);
          this.form.reset();
          this.loadTenants();
        },
        error: (err: unknown) => {
          this.submitLoading.set(false);
          if (isAppError(err)) {
            this.submitError.set(err.message);
            return;
          }
          this.submitError.set('Creazione cliente non riuscita. Riprova.');
        },
      });
  }

  protected resetForm(): void {
    this.created.set(null);
    this.submitError.set(null);
  }

  private loadTenants(): void {
    this.tenantsLoading.set(true);
    this.tenantsError.set(null);

    this.adminTenants
      .listTenants()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.tenants.set(items);
          this.tenantsLoading.set(false);
        },
        error: () => {
          this.tenantsLoading.set(false);
          this.tenantsError.set('Impossibile caricare l’elenco clienti.');
        },
      });
  }
}
