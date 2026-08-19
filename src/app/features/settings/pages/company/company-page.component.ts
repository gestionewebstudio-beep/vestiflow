import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { catchError, map, of, startWith, switchMap, take } from 'rxjs';

import type { CanComponentDeactivate } from '@core/guards/unsaved-changes.guard';
import { isAppError } from '@core/models/app-error.model';
import { ToastService } from '@core/services/toast.service';
import { BackButtonComponent } from '@shared/components/back-button/back-button.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { InlineBannerComponent } from '@shared/components/inline-banner/inline-banner.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { CompanyProfileService } from '@domain/tenant/services/company-profile.service';
import {
  EMPTY_COMPANY_FIELDS,
  companyProfileFormValue,
  companyProfilePayload,
  createCompanyProfileControls,
  hasAnyCompanyField,
  missingEssentialCompanyFields,
  type CompanyProfile,
} from '@domain/tenant/models/company-profile.model';
import { TAX_REGIME_OPTIONS } from '@domain/tenant/models/tax-regime.model';

type LoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly company: CompanyProfile }
  | { readonly status: 'error'; readonly message: string };

/**
 * Impostazioni → Dati azienda: l'anagrafica che intesta documenti, stampe e
 * fatture elettroniche. La compila il titolare, ed è l'unico a vederla.
 *
 * Non è l'anagrafica del cliente VestiFlow: quella la registra l'admin di
 * piattaforma all'attivazione e vive per conto suo. Qui il titolare dichiara
 * **l'azienda che gestisce nel gestionale**, e può cambiarla quando vuole
 * senza che nessuno debba intervenire.
 */
@Component({
  selector: 'app-company-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    BackButtonComponent,
    ButtonComponent,
    ErrorStateComponent,
    InlineBannerComponent,
    TableSkeletonComponent,
  ],
  templateUrl: './company-page.component.html',
  styleUrl: './company-page.component.scss',
})
export class CompanyPageComponent implements CanComponentDeactivate {
  private readonly service = inject(CompanyProfileService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly form = this.fb.group(createCompanyProfileControls(this.fb));
  protected readonly taxRegimeOptions = TAX_REGIME_OPTIONS;

  private readonly reload = signal(0);
  private readonly loadState = toSignal(
    toObservable(this.reload).pipe(
      switchMap(() =>
        this.service.get().pipe(
          map((company): LoadState => {
            this.patchForm(company);
            return { status: 'ready', company };
          }),
          startWith<LoadState>({ status: 'loading' }),
          catchError((err: unknown) =>
            of<LoadState>({
              status: 'error',
              message: isAppError(err) ? err.message : 'Impossibile caricare i dati azienda.',
            }),
          ),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } satisfies LoadState },
  );

  protected readonly loading = computed(() => this.loadState().status === 'loading');
  protected readonly loadError = computed(() => {
    const state = this.loadState();
    return state.status === 'error' ? state.message : null;
  });
  private readonly company = computed(() => {
    const state = this.loadState();
    return state.status === 'ready' ? state.company : null;
  });

  protected readonly saving = signal(false);

  /** Mai salvata: è uno stato reale, e si dice — non si mostra un form vuoto e basta. */
  protected readonly neverFilled = computed(() => this.company()?.profile === null);

  /**
   * Il pulsante di precompilazione compare solo se c'è davvero qualcosa da
   * copiare, e solo finché l'anagrafica non è stata salvata: dopo, riproporlo
   * significherebbe offrire di sovrascrivere quello che il titolare ha scritto.
   */
  protected readonly canPrefill = computed(() => {
    const company = this.company();
    return Boolean(
      company && company.profile === null && hasAnyCompanyField(company.activationDefaults),
    );
  });

  protected readonly missingFields = computed(() =>
    missingEssentialCompanyFields(this.company()?.profile ?? null),
  );

  protected readonly missingFieldsMessage = computed(() => {
    const missing = this.missingFields();
    if (missing.length === 0) {
      return null;
    }
    const elenco = missing.join(', ');
    return `Documenti e fatture elettroniche escono senza questi dati: ${elenco}.`;
  });

  protected showError(controlName: string): boolean {
    const control = this.form.get(controlName);
    return Boolean(control && control.invalid && (control.dirty || control.touched));
  }

  protected prefillFromActivation(): void {
    const defaults = this.company()?.activationDefaults;
    if (!defaults) {
      return;
    }
    this.form.patchValue(companyProfileFormValue(defaults));
    this.form.markAsDirty();
    this.toast.showInfo('Campi precompilati. Controllali e premi Salva.');
  }

  protected save(): void {
    if (this.saving()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.showError('Controlla i campi segnalati.');
      return;
    }

    this.saving.set(true);
    this.service
      .update(companyProfilePayload(this.form.getRawValue()))
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.form.markAsPristine();
          this.toast.showInfo('Dati azienda salvati.');
          this.reload.update((value) => value + 1);
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.toast.showError(isAppError(err) ? err.message : 'Salvataggio non riuscito.');
        },
      });
  }

  protected undoChanges(): void {
    const company = this.company();
    if (company) {
      this.patchForm(company);
    }
  }

  protected retry(): void {
    this.reload.update((value) => value + 1);
  }

  canDeactivate(): boolean {
    if (!this.form.dirty || this.saving()) {
      return true;
    }
    return window.confirm('Ci sono modifiche non salvate. Uscire comunque?');
  }

  /**
   * Senza anagrafica salvata il form parte **vuoto**, non precompilato: la
   * proposta resta un pulsante. Riempirlo all'apertura renderebbe un dato
   * ereditato indistinguibile da uno confermato dal titolare.
   */
  private patchForm(company: CompanyProfile): void {
    this.form.reset(companyProfileFormValue(company.profile ?? EMPTY_COMPANY_FIELDS));
    this.form.markAsPristine();
  }
}
