import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import type { Factor } from '@supabase/supabase-js';
import type { SafeHtml } from '@angular/platform-browser';

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
    readonly qrCodeSvg: SafeHtml;
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
        qrCodeSvg: started.qrCodeSvg,
        secret: started.secret,
      });
      this.verifyForm.reset();
    } catch (err: unknown) {
      this.error.set(this.extractMessage(err));
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
      this.error.set(this.extractMessage(err));
    } finally {
      this.actionLoading.set(false);
    }
  }

  protected cancelEnrollment(): void {
    this.enrollment.set(null);
    this.verifyForm.reset();
    this.error.set(null);
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
      .catch((err: unknown) => this.error.set(this.extractMessage(err)))
      .finally(() => this.actionLoading.set(false));
  }

  private async reloadFactors(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const factors = await this.mfaService.listVerifiedTotpFactors();
      this.verifiedFactors.set(factors);
    } catch (err: unknown) {
      this.error.set(this.extractMessage(err));
      this.verifiedFactors.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  private extractMessage(err: unknown): string {
    if (typeof err === 'object' && err !== null && 'message' in err) {
      const candidate = (err as { message?: unknown }).message;
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate;
      }
    }
    return 'Operazione MFA non riuscita. Riprova.';
  }
}
