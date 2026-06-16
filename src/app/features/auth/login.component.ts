import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import type { Subscription } from 'rxjs';

import { AuthService } from '@core/auth';
import { APP_CONFIG } from '@core/config/app-config.token';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import { ButtonComponent } from '@shared/components/button/button.component';

const DEFAULT_REDIRECT = '/app/dashboard';
const PASSWORD_MIN_LENGTH = 6;

/**
 * Pagina di accesso (smart). Reactive Form tipizzato, validazione inline e
 * stato loading/error collegato ad AuthService.login. Nessuna persistenza auth.
 */
@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ButtonComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly config = inject(APP_CONFIG);

  protected readonly passwordMinLength = PASSWORD_MIN_LENGTH;
  protected readonly showDemoCredentials = !this.config.production;

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

  private readonly _loading = signal(false);
  readonly loading = this._loading.asReadonly();

  private readonly _error = signal<AppError | null>(null);
  readonly error = this._error.asReadonly();

  private readonly _submitted = signal(false);
  readonly submitted = this._submitted.asReadonly();

  protected readonly passwordVisible = signal(false);

  // takeUntilDestroyed() gestisce l'unsubscribe; il campo evita subscription "ignorate".
  private loginSubscription: Subscription | null = null;

  protected showError(field: 'email' | 'password'): boolean {
    const control = this.form.controls[field];
    return control.invalid && (control.touched || this._submitted());
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
          this._loading.set(false);
          this.form.enable();
          this._error.set(this.toAppError(err));
        },
      });
  }

  private toAppError(err: unknown): AppError {
    if (isAppError(err)) {
      return err;
    }
    return { kind: AppErrorKind.Unknown, message: 'Errore imprevisto. Riprova.' };
  }

  /** Accetta solo path interni per evitare open redirect. */
  private resolveReturnUrl(): string {
    const raw = this.route.snapshot.queryParamMap.get('returnUrl');
    if (raw && raw.startsWith('/') && !raw.startsWith('//')) {
      return raw;
    }
    return DEFAULT_REDIRECT;
  }
}
