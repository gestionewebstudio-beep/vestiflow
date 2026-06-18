import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { isAppError } from '@core/models/app-error.model';
import type { UserRole as UserRoleType } from '@core/models/user.model';
import { UserRole } from '@core/models/user.model';
import { formatDateTime } from '@core/utils/date.util';
import { ButtonComponent } from '@shared/components/button/button.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { AdminTenantProfileFieldsComponent } from '../../components/admin-tenant-profile-fields/admin-tenant-profile-fields.component';
import type { ProvisionedTenant, TenantSummary } from '../../models/admin-tenant.model';
import {
  createTenantProfileControls,
  profilePayloadFromForm,
} from '../../models/admin-tenant-profile.form';
import { TENANT_ROLE_OPTIONS, tenantRoleLabel } from '../../models/admin-tenant-role.util';
import { AdminTenantsService } from '../../services/admin-tenants.service';

/**
 * Provisioning di un nuovo cliente (tenant + owner + negozio/location base).
 * Visibile solo agli operatori piattaforma (`isPlatformAdmin`).
 */
@Component({
  selector: 'app-create-client',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ButtonComponent,
    SelectMenuComponent,
    TableSkeletonComponent,
    AdminTenantProfileFieldsComponent,
  ],
  templateUrl: './create-client.component.html',
  styleUrl: './create-client.component.scss',
})
export class CreateClientComponent {
  private readonly adminTenants = inject(AdminTenantsService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);

  protected readonly formatDateTime = formatDateTime;
  protected readonly tenantRoleOptions = TENANT_ROLE_OPTIONS;
  protected readonly tenantRoleLabel = tenantRoleLabel;

  protected readonly tenantsLoading = signal(true);
  protected readonly tenants = signal<readonly TenantSummary[]>([]);
  protected readonly tenantsError = signal<string | null>(null);

  protected readonly submitLoading = signal(false);
  protected readonly submitError = signal<string | null>(null);
  protected readonly created = signal<ProvisionedTenant | null>(null);
  protected readonly passwordVisible = signal(false);

  protected readonly form = this.fb.group({
    tenantName: this.fb.control('', {
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(120)],
    }),
    ...createTenantProfileControls(this.fb),
    ownerDisplayName: this.fb.control('', {
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(120)],
    }),
    ownerEmail: this.fb.control('', {
      validators: [Validators.required, Validators.email, Validators.maxLength(255)],
    }),
    ownerPassword: this.fb.control('', {
      validators: [Validators.required, Validators.minLength(8), Validators.maxLength(128)],
    }),
    role: this.fb.control<UserRoleType>(UserRole.Owner, { validators: [Validators.required] }),
    storeName: this.fb.control('', { validators: [Validators.maxLength(120)] }),
    locationName: this.fb.control('', { validators: [Validators.maxLength(120)] }),
  });

  constructor() {
    this.loadTenants();
  }

  protected showError(controlName: string): boolean {
    const control = this.form.controls[controlName as keyof typeof this.form.controls];
    return control.invalid && control.touched;
  }

  protected togglePasswordVisibility(): void {
    this.passwordVisible.update((visible) => !visible);
  }

  protected onRoleSelect(value: string | null): void {
    if (!value || !this.isUserRole(value)) {
      return;
    }
    this.form.controls.role.setValue(value);
    this.form.controls.role.markAsTouched();
  }

  private isUserRole(value: string): value is UserRoleType {
    return (Object.values(UserRole) as readonly string[]).includes(value);
  }

  protected openTenant(tenant: TenantSummary): void {
    void this.router.navigate(['/app/admin/clients', tenant.id]);
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
        role: raw.role,
        ...(storeName ? { storeName } : {}),
        ...(locationName ? { locationName } : {}),
        ...profilePayloadFromForm(raw),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.submitLoading.set(false);
          this.created.set(result);
          this.form.reset({ countryCode: 'IT', role: UserRole.Owner });
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
