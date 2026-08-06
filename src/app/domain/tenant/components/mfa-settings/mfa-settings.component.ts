import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import type { Factor } from '@supabase/supabase-js';
import type { SafeResourceUrl } from '@angular/platform-browser';

import { MfaService } from '@core/auth/mfa.service';
import { ButtonComponent } from '@shared/components/button/button.component';

/**
 * Configurazione MFA TOTP (Google Authenticator, Authy, ecc.) per account sensibili.
 */
@Component({
  selector: 'app-mfa-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ButtonComponent],
  templateUrl: './mfa-settings.component.html',
  styleUrl: './mfa-settings.component.scss',
})
export class MfaSettingsComponent {
  private readonly mfaService = inject(MfaService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly loading = signal(true);
  protected readonly actionLoading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly verifiedFactors = signal<readonly Factor[]>([]);
  protected readonly enrollment = signal<{
    readonly factorId: string;
    readonly qrCodeSrc: SafeResourceUrl;
    readonly secret: string;
  } | null>(null);

  protected readonly verifyForm = this.fb.group({
    code: this.fb.control('', {
      validators: [Validators.required, Validators.pattern(/^\d{6}$/)],
    }),
  });

  constructor() {
    void this.reloadFactors();
  }

  protected async startEnrollment(): Promise<void> {
    this.actionLoading.set(true);
    this.error.set(null);

    try {
      const started = await this.mfaService.startEnrollment();
      this.enrollment.set({
        factorId: started.factorId,
        qrCodeSrc: started.qrCodeSrc,
        secret: started.secret,
      });
      this.verifyForm.reset();
    } catch (err: unknown) {
      this.error.set(this.mfaService.mapErrorMessage(err));
    } finally {
      this.actionLoading.set(false);
    }
  }

  protected async completeEnrollment(): Promise<void> {
    this.verifyForm.markAllAsTouched();
    const enrollmentState = this.enrollment();
    if (this.verifyForm.invalid || !enrollmentState || this.actionLoading()) {
      return;
    }

    this.actionLoading.set(true);
    this.error.set(null);

    try {
      await this.mfaService.completeEnrollment(
        enrollmentState.factorId,
        this.verifyForm.controls.code.value,
      );
      this.enrollment.set(null);
      await this.reloadFactors();
    } catch (err: unknown) {
      this.error.set(this.mfaService.mapErrorMessage(err));
    } finally {
      this.actionLoading.set(false);
    }
  }

  protected async cancelEnrollment(): Promise<void> {
    const pending = this.enrollment();
    this.enrollment.set(null);
    this.verifyForm.reset();
    this.error.set(null);

    if (!pending) {
      return;
    }

    this.actionLoading.set(true);
    try {
      await this.mfaService.unenroll(pending.factorId);
    } catch (err: unknown) {
      this.error.set(this.mfaService.mapErrorMessage(err));
    } finally {
      this.actionLoading.set(false);
    }
  }

  protected unenroll(factorId: string): void {
    if (this.actionLoading()) {
      return;
    }

    this.actionLoading.set(true);
    this.error.set(null);

    this.mfaService
      .unenroll(factorId)
      .then(() => this.reloadFactors())
      .catch((err: unknown) => this.error.set(this.mfaService.mapErrorMessage(err)))
      .finally(() => this.actionLoading.set(false));
  }

  private async reloadFactors(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      try {
        await this.mfaService.cleanupUnverifiedTotpFactors();
      } catch {
        // Non bloccare la pagina al refresh: l'utente può riprovare dal pulsante.
      }

      const factors = await this.mfaService.listVerifiedTotpFactors();
      this.verifiedFactors.set(factors);
    } catch (err: unknown) {
      this.error.set(this.mfaService.mapErrorMessage(err));
      this.verifiedFactors.set([]);
    } finally {
      this.loading.set(false);
    }
  }
}
