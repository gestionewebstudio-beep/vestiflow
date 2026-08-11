import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { switchMap } from 'rxjs';

import { AuthService } from '@core/auth';
import { PASSWORD_MIN_LENGTH } from '@core/auth/auth-password.constants';
import { PasswordChangeService } from '@core/auth/password-change.service';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import { ButtonComponent } from '@shared/components/button/button.component';
import { InlineBannerComponent } from '@shared/components/inline-banner/inline-banner.component';

function passwordsMatch(control: AbstractControl): ValidationErrors | null {
  if (!(control instanceof FormGroup)) {
    return null;
  }
  const raw = control.getRawValue() as { password?: string; confirmPassword?: string };
  const password = raw.password;
  const confirm = raw.confirmPassword;
  if (typeof password !== 'string' || typeof confirm !== 'string') {
    return null;
  }
  return password === confirm ? null : { passwordMismatch: true };
}

/**
 * Cambio obbligatorio della password iniziale (impostata da chi ha creato
 * l'account). L'utente arriva qui dal mustChangePasswordGuard; a cambio
 * concluso il flag si azzera e si entra nella shell.
 */
@Component({
  selector: 'app-change-password',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ButtonComponent, InlineBannerComponent],
  templateUrl: './change-password.component.html',
  styleUrl: './auth-page.component.scss',
})
export class ChangePasswordComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly passwordChange = inject(PasswordChangeService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly passwordMinLength = PASSWORD_MIN_LENGTH;

  protected readonly form = this.fb.group(
    {
      password: this.fb.control('', [
        Validators.required,
        Validators.minLength(PASSWORD_MIN_LENGTH),
      ]),
      confirmPassword: this.fb.control('', [Validators.required]),
    },
    { validators: passwordsMatch },
  );

  protected readonly loading = signal(false);
  protected readonly passwordVisible = signal(false);
  protected readonly error = signal<AppError | null>(null);

  protected togglePasswordVisibility(): void {
    this.passwordVisible.update((visible) => !visible);
  }

  protected showPasswordError(): boolean {
    const control = this.form.controls.password;
    return control.invalid && control.touched;
  }

  protected showConfirmError(): boolean {
    const control = this.form.controls.confirmPassword;
    return (
      (control.invalid && control.touched) ||
      (this.form.hasError('passwordMismatch') && control.touched)
    );
  }

  protected onSubmit(): void {
    this.error.set(null);
    this.form.markAllAsTouched();

    if (this.form.invalid || this.loading()) {
      return;
    }

    this.loading.set(true);
    this.form.disable();

    this.auth
      .updatePassword(this.form.controls.password.value)
      .pipe(
        switchMap(() => this.passwordChange.confirmPasswordChanged()),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          void this.router.navigate(['/app/dashboard']);
        },
        error: (err: unknown) => {
          this.loading.set(false);
          this.form.enable();
          this.error.set(
            isAppError(err)
              ? err
              : ({
                  kind: AppErrorKind.Unknown,
                  message: 'Aggiornamento non riuscito. Riprova.',
                } satisfies AppError),
          );
        },
      });
  }
}
