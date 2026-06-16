import { SecurityContext, inject, Injectable } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import type { Factor } from '@supabase/supabase-js';

import { SupabaseClientService } from '@core/auth/supabase-client.service';

export interface MfaEnrollmentStart {
  readonly factorId: string;
  readonly qrCodeSvg: SafeHtml;
  readonly secret: string;
}

/** Operazioni MFA TOTP lato client Supabase (enrollment e stato). */
@Injectable({ providedIn: 'root' })
export class MfaService {
  private readonly supabaseClient = inject(SupabaseClientService);
  private readonly sanitizer = inject(DomSanitizer);

  private get supabase() {
    return this.supabaseClient.client;
  }

  isAvailable(): boolean {
    return this.supabaseClient.isConfigured;
  }

  async listVerifiedTotpFactors(): Promise<readonly Factor[]> {
    const { data, error } = await this.supabase.auth.mfa.listFactors();
    if (error) {
      throw error;
    }

    return data.totp.filter((factor) => factor.status === 'verified');
  }

  async startEnrollment(): Promise<MfaEnrollmentStart> {
    const { data, error } = await this.supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'VestiFlow',
      issuer: 'VestiFlow',
    });
    if (error || !data.totp) {
      throw error ?? new Error('Impossibile avviare la configurazione MFA.');
    }

    const qrCodeSvg = this.sanitizer.sanitize(SecurityContext.HTML, data.totp.qr_code) ?? '';

    return {
      factorId: data.id,
      qrCodeSvg,
      secret: data.totp.secret,
    };
  }

  async completeEnrollment(factorId: string, code: string): Promise<void> {
    const { error } = await this.supabase.auth.mfa.challengeAndVerify({
      factorId,
      code: code.trim(),
    });
    if (error) {
      throw error;
    }
  }

  async unenroll(factorId: string): Promise<void> {
    const { error } = await this.supabase.auth.mfa.unenroll({ factorId });
    if (error) {
      throw error;
    }
  }
}
