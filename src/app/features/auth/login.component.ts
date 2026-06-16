import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { Subscription } from 'rxjs';

import { AuthService } from '@core/auth';
import { PASSWORD_MIN_LENGTH } from '@core/auth/auth-password.constants';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import { ButtonComponent } from '@shared/components/button/button.component';

const DEFAULT_REDIRECT = '/app/dashboard';

/**
 * Pagina di accesso (smart). Reactive Form tipizzato, validazione inline,
 * secondo fattore TOTP quando MFA è attivo sull'account Supabase.
 */
@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ButtonComponent, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './auth-page.component.scss',
})
export class LoginComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly passwordMinLength = PASSWORD_MIN_LENGTH;

  protected readonly step = signal<'credentials' | 'mfa'>('credentials');

  protected readonly form = this.fb.group(
    {
      email: this.fb.control('', [Validators.required, Validators.email]),
      password: this.fb.control('', [
        Validators.required,
        Validators.minLength(PASSWORD_MIN_LENGTH),
      ]),
    },
    { updateOn: 'blur' },
  );

  protected readonly mfaForm = this.fb.group({
    code: this.fb.control('', {
      validators: [Validators.required, Validators.pattern(/^\d{6}$/)],
    }),
  });

  private readonly _loading = signal(false);
  readonly loading = this._loading.asReadonly();

  private readonly _error = signal<AppError | null>(null);
  readonly error = this._error.asReadonly();

  private readonly _submitted = signal(false);
  readonly submitted = this._submitted.asReadonly();

  protected readonly passwordVisible = signal(false);
  protected readonly passwordResetSuccess = signal(false);

  private loginSubscription: Subscription | null = null;

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.passwordResetSuccess.set(params.get('reset') === 'success');
    });
  }

  protected showError(field: 'email' | 'password'): boolean {
    const control = this.form.controls[field];
    return control.invalid && (control.touched || this._submitted());
  }

  protected showMfaError(): boolean {
    const control = this.mfaForm.controls.code;
    return control.invalid && control.touched;
  }

  protected togglePasswordVisibility(): void {
    this.passwordVisible.update((visible) => !visible);
  }

  protected onSubmit(): void {
    this._submitted.set(true);
    this._error.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this._loading.set(true);
    this.form.disable();

    this.loginSubscription = this.auth
      .login(this.form.getRawValue())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          void this.router.navigateByUrl(this.resolveReturnUrl());
        },
        error: (err: unknown) => {
          if (isAppError(err) && err.kind === AppErrorKind.MfaRequired) {
            this._loading.set(false);
            this._error.set(null);
            this.step.set('mfa');
            this.mfaForm.reset();
            return;
          }

          this._loading.set(false);
          this.form.enable();
          this._error.set(this.toAppError(err));
        },
      });
  }

  protected onMfaSubmit(): void {
    this.mfaForm.markAllAsTouched();
    this._error.set(null);

    if (this.mfaForm.invalid || this._loading()) {
      return;
    }

    this._loading.set(true);
    this.mfaForm.disable();

    this.auth
      .verifyMfa(this.mfaForm.controls.code.value)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          void this.router.navigateByUrl(this.resolveReturnUrl());
        },
        error: (err: unknown) => {
          this._loading.set(false);
          this.mfaForm.enable();
          this._error.set(this.toAppError(err));
        },
      });
  }

  protected backToCredentials(): void {
    this.step.set('credentials');
    this._error.set(null);
    this.mfaForm.reset();
    this.form.enable();
  }

  private toAppError(err: unknown): AppError {
    if (isAppError(err)) {
      return err;
    }
    const message = this.readErrorMessage(err);
    if (message) {
      return { kind: AppErrorKind.Unknown, message };
    }
    return { kind: AppErrorKind.Unknown, message: 'Errore imprevisto. Riprova.' };
  }

  private readErrorMessage(error: unknown): string | null {
    if (typeof error === 'object' && error !== null && 'message' in error) {
      const candidate = (error as { message?: unknown }).message;
      return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate : null;
    }
    return null;
  }

  private resolveReturnUrl(): string {
    const raw = this.route.snapshot.queryParamMap.get('returnUrl');
    if (raw && raw.startsWith('/') && !raw.startsWith('//')) {
      return raw;
    }
    return DEFAULT_REDIRECT;
  }
}
