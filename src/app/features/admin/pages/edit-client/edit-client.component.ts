import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, map, of, startWith, switchMap } from 'rxjs';

import { isAppError } from '@core/models/app-error.model';
import { formatDateTime } from '@core/utils/date.util';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { AdminTenantProfileFieldsComponent } from '../../components/admin-tenant-profile-fields/admin-tenant-profile-fields.component';
import type { TenantDetail } from '../../models/admin-tenant.model';
import {
  createTenantProfileControls,
  patchTenantProfileForm,
  profilePayloadFromForm,
} from '../../models/admin-tenant-profile.form';
import { AdminTenantsService } from '../../services/admin-tenants.service';

type TenantLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly tenant: TenantDetail }
  | { readonly status: 'error'; readonly message: string };

@Component({
  selector: 'app-edit-client',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ButtonComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
    AdminTenantProfileFieldsComponent,
  ],
  templateUrl: './edit-client.component.html',
  styleUrl: '../create-client/create-client.component.scss',
})
export class EditClientComponent {
  private readonly adminTenants = inject(AdminTenantsService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly formatDateTime = formatDateTime;

  private readonly params = toSignal(this.route.paramMap, { requireSync: true });
  private readonly tenantId = computed(() => this.params().get('tenantId') ?? '');

  private readonly loadState = toSignal(
    toObservable(this.tenantId).pipe(
      switchMap((id) => {
        if (!id) {
          return of({ status: 'error' as const, message: 'Cliente non valido.' });
        }
        return this.adminTenants.getTenant(id).pipe(
          map((tenant): TenantLoadState => ({ status: 'success', tenant })),
          startWith<TenantLoadState>({ status: 'loading' }),
          catchError((err: unknown) =>
            of({
              status: 'error' as const,
              message: isAppError(err) ? err.message : 'Impossibile caricare il cliente.',
            }),
          ),
        );
      }),
    ),
    { initialValue: { status: 'loading' } satisfies TenantLoadState },
  );

  protected readonly loading = computed(() => this.loadState().status === 'loading');
  protected readonly error = computed(() => {
    const state = this.loadState();
    return state.status === 'error' ? state.message : null;
  });
  protected readonly tenant = computed((): TenantDetail | null => {
    const state = this.loadState();
    return state.status === 'success' ? state.tenant : null;
  });

  protected readonly submitLoading = signal(false);
  protected readonly submitError = signal<string | null>(null);
  protected readonly saved = signal(false);

  protected readonly form = this.fb.group({
    tenantName: this.fb.control('', {
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(120)],
    }),
    ...createTenantProfileControls(this.fb),
    ownerDisplayName: this.fb.control('', {
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(120)],
    }),
    storeName: this.fb.control('', { validators: [Validators.maxLength(120)] }),
    locationName: this.fb.control('', { validators: [Validators.maxLength(120)] }),
  });

  constructor() {
    effect(() => {
      const detail = this.tenant();
      if (detail) {
        patchTenantProfileForm(this.form, detail);
      }
    });
  }

  protected showError(controlName: string): boolean {
    const control = this.form.controls[controlName as keyof typeof this.form.controls];
    return control.invalid && control.touched;
  }

  protected onSubmit(): void {
    this.form.markAllAsTouched();
    const detail = this.tenant();
    if (this.form.invalid || this.submitLoading() || !detail) {
      return;
    }

    this.submitLoading.set(true);
    this.submitError.set(null);
    this.saved.set(false);

    const raw = this.form.getRawValue();
    const storeName = raw.storeName.trim();
    const locationName = raw.locationName.trim();

    this.adminTenants
      .updateTenant(detail.id, {
        tenantName: raw.tenantName.trim(),
        ownerDisplayName: raw.ownerDisplayName.trim(),
        ...(storeName ? { storeName } : {}),
        ...(locationName ? { locationName } : {}),
        ...profilePayloadFromForm(raw),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.submitLoading.set(false);
          this.saved.set(true);
        },
        error: (err: unknown) => {
          this.submitLoading.set(false);
          if (isAppError(err)) {
            this.submitError.set(err.message);
            return;
          }
          this.submitError.set('Salvataggio non riuscito. Riprova.');
        },
      });
  }

  protected reload(): void {
    this.saved.set(false);
    this.submitError.set(null);
    void this.router.navigateByUrl(this.router.url, { onSameUrlNavigation: 'reload' });
  }
}
