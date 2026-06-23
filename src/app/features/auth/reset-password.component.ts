import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { from } from 'rxjs';

import { AuthService } from '@core/auth';
import { establishSessionFromAuthRedirect } from '@core/auth/auth-redirect-session.util';
import { PASSWORD_MIN_LENGTH } from '@core/auth/auth-password.constants';
import { SupabaseClientService } from '@core/auth/supabase-client.service';
import { APP_CONFIG } from '@core/config/app-config.token';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import { ButtonComponent } from '@shared/components/button/button.component';

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
 * Imposta password dopo click su link Supabase (invito primo accesso o recupero).
 */
@Component({
  selector: 'app-reset-password',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, ButtonComponent],
  templateUrl: './reset-password.component.html',
  styleUrl: './auth-page.component.scss',
})
export class ResetPasswordComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly config = inject(APP_CONFIG);
  private readonly supabase = inject(SupabaseClientService, { optional: true });

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
  protected readonly checkingLink = signal(true);
  protected readonly linkValid = signal(false);
  protected readonly isInviteFlow = signal(false);
  protected readonly passwordVisible = signal(false);
  protected readonly error = signal<AppError | null>(null);

  ngOnInit(): void {
    if (!this.config.supabase?.anonKey || !this.supabase) {
      this.checkingLink.set(false);
      this.linkValid.set(false);
      return;
    }

    from(
      establishSessionFromAuthRedirect({
        client: this.supabase.client,
        supabaseUrl: this.config.supabase.url,
        anonKey: this.config.supabase.anonKey,
      }),
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ ok, flowType }) => {
          this.checkingLink.set(false);
          this.linkValid.set(ok);
          this.isInviteFlow.set(flowType === 'invite');
        },
        error: () => {
          this.checkingLink.set(false);
          this.linkValid.set(false);
        },
      });
  }

  protected pageTitle(): string {
    return this.isInviteFlow() ? 'Imposta la tua password' : 'Nuova password';
  }

  protected pageSubtitle(): string {
    return this.isInviteFlow()
      ? 'Benvenuto in VestiFlow. Scegli una password per il tuo account.'
      : 'Scegli una password sicura per il tuo account VestiFlow.';
  }

  protected submitLabel(): string {
    return this.loading()
      ? 'Salvataggio…'
      : this.isInviteFlow()
        ? 'Imposta password e accedi'
        : 'Salva nuova password';
  }

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
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          void this.router.navigate(['/login'], {
            queryParams: this.isInviteFlow() ? { invite: 'success' } : { reset: 'success' },
          });
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
