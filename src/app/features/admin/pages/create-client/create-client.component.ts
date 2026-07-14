import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
  computed,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

import { isAppError } from '@core/models/app-error.model';
import { PASSWORD_MIN_LENGTH } from '@core/auth/auth-password.constants';
import type { UserRole as UserRoleType } from '@core/models/user.model';
import { UserRole } from '@core/models/user.model';
import {
  TENANT_CHANNEL_PROFILE_OPTIONS,
  TenantChannelProfile,
  tenantChannelProfileLabel,
} from '@core/models/tenant-channel-profile.model';
import { SupportSessionService } from '@core/support/support-session.service';
import { formatDateTime } from '@core/utils/date.util';
import {
  TENANT_LICENSED_LOCATION_MAX,
  TENANT_LICENSED_LOCATION_MIN,
  TENANT_LICENSED_LOCATION_OPTIONS,
} from '@core/constants/tenant-location-license.constants';
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
  private readonly supportSessions = inject(SupportSessionService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);

  protected readonly showCreateForm = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects.includes('/clients/new')),
      startWith(this.router.url.includes('/clients/new')),
    ),
    { initialValue: this.router.url.includes('/clients/new') },
  );

  protected readonly formatDateTime = formatDateTime;
  protected readonly tenantRoleOptions = TENANT_ROLE_OPTIONS;
  protected readonly tenantRoleLabel = tenantRoleLabel;
  protected readonly channelProfileOptions = TENANT_CHANNEL_PROFILE_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
  }));
  protected readonly licensedLocationOptions = TENANT_LICENSED_LOCATION_OPTIONS.map((count) => ({
    value: String(count),
    label: count === 1 ? '1 sede' : `${count} sedi`,
  }));
  protected readonly tenantChannelProfileLabel = tenantChannelProfileLabel;
  protected readonly selectedChannelProfileDescription = computed(() => {
    const value = this.channelProfileValue();
    return (
      TENANT_CHANNEL_PROFILE_OPTIONS.find((option) => option.value === value)?.description ?? ''
    );
  });

  protected readonly isShopifyChannelProfile = computed(
    () => this.channelProfileValue() === TenantChannelProfile.Shopify,
  );

  protected readonly tenantsLoading = signal(true);
  protected readonly tenants = signal<readonly TenantSummary[]>([]);
  protected readonly tenantsError = signal<string | null>(null);

  protected readonly submitLoading = signal(false);
  protected readonly submitError = signal<string | null>(null);
  protected readonly supportSessionLoadingId = signal<string | null>(null);
  protected readonly supportSessionError = signal<string | null>(null);
  protected readonly created = signal<ProvisionedTenant | null>(null);
  protected readonly passwordVisible = signal(false);
  protected readonly passwordMinLength = PASSWORD_MIN_LENGTH;

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
      validators: [Validators.required, Validators.minLength(PASSWORD_MIN_LENGTH)],
    }),
    role: this.fb.control<UserRoleType>(UserRole.Owner, { validators: [Validators.required] }),
    channelProfile: this.fb.control<TenantChannelProfile>(TenantChannelProfile.Gestionale, {
      validators: [Validators.required],
    }),
    storeName: this.fb.control('', { validators: [Validators.maxLength(120)] }),
    locationName: this.fb.control('', { validators: [Validators.maxLength(120)] }),
    licensedLocationCount: this.fb.control(TENANT_LICENSED_LOCATION_MIN, {
      validators: [
        Validators.required,
        Validators.min(TENANT_LICENSED_LOCATION_MIN),
        Validators.max(TENANT_LICENSED_LOCATION_MAX),
      ],
    }),
  });

  // Valore reattivo di channelProfile: i computed derivati (hint del profilo,
  // toggle dei campi Shopify) leggono dal FormControl, che non e' un signal.
  // Senza questo signal resterebbero memoizzati sul profilo iniziale.
  private readonly channelProfileValue = toSignal(this.form.controls.channelProfile.valueChanges, {
    initialValue: this.form.controls.channelProfile.value,
  });

  constructor() {
    this.loadTenants();
  }

  protected showError(controlName: string): boolean {
    const control = this.form.controls[controlName as keyof typeof this.form.controls];
    return control.invalid && control.touched;
  }

  protected onChannelProfileSelect(value: string | null): void {
    if (!value || !this.isChannelProfile(value)) {
      return;
    }
    this.form.controls.channelProfile.setValue(value);
    this.form.controls.channelProfile.markAsTouched();
  }

  private isChannelProfile(value: string): value is TenantChannelProfile {
    return (Object.values(TenantChannelProfile) as readonly string[]).includes(value);
  }

  protected onRoleSelect(value: string | null): void {
    if (!value || !this.isUserRole(value)) {
      return;
    }
    this.form.controls.role.setValue(value);
    this.form.controls.role.markAsTouched();
  }

  protected onLicensedLocationCountSelect(value: string | null): void {
    const parsed = Number(value);
    if (
      !Number.isInteger(parsed) ||
      parsed < TENANT_LICENSED_LOCATION_MIN ||
      parsed > TENANT_LICENSED_LOCATION_MAX
    ) {
      return;
    }
    this.form.controls.licensedLocationCount.setValue(parsed);
    this.form.controls.licensedLocationCount.markAsTouched();
  }

  private isUserRole(value: string): value is UserRoleType {
    return (Object.values(UserRole) as readonly string[]).includes(value);
  }

  protected openCreateForm(): void {
    void this.router.navigate(['/app/admin/clients/new']);
  }

  protected closeCreateForm(): void {
    this.created.set(null);
    this.submitError.set(null);
    void this.router.navigate(['/app/admin/clients']);
  }

  protected openTenant(tenant: TenantSummary): void {
    void this.router.navigate(['/app/admin/clients', tenant.id]);
  }

  protected openSupportSession(tenant: TenantSummary, event: Event): void {
    event.stopPropagation();
    if (this.supportSessionLoadingId()) {
      return;
    }

    this.supportSessionError.set(null);
    this.supportSessionLoadingId.set(tenant.id);

    this.supportSessions
      .startSession(tenant.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.supportSessionLoadingId.set(null);
          this.supportSessions.enterTenantWorkspace();
        },
        error: (err: unknown) => {
          this.supportSessionLoadingId.set(null);
          this.supportSessionError.set(this.supportSessions.mapStartError(err));
        },
      });
  }

  protected togglePasswordVisibility(): void {
    this.passwordVisible.update((visible) => !visible);
  }

  protected onSubmit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.submitLoading()) {
      if (this.form.invalid) {
        this.submitError.set('Controlla i campi evidenziati in rosso.');
      }
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
        channelProfile: raw.channelProfile,
        licensedLocationCount: raw.licensedLocationCount,
        ...(storeName ? { storeName } : {}),
        ...(locationName ? { locationName } : {}),
        ...profilePayloadFromForm(raw),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.submitLoading.set(false);
          this.created.set(result);
          this.form.reset({
            countryCode: 'IT',
            role: UserRole.Owner,
            channelProfile: TenantChannelProfile.Gestionale,
            licensedLocationCount: TENANT_LICENSED_LOCATION_MIN,
          });
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

  protected backToList(): void {
    this.closeCreateForm();
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
