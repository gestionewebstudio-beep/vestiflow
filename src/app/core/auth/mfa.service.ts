import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import type { Factor } from '@supabase/supabase-js';
import { firstValueFrom } from 'rxjs';

import { SupabaseClientService } from '@core/auth/supabase-client.service';
import { APP_CONFIG } from '@core/config/app-config.token';

export interface MfaEnrollmentStart {
  readonly factorId: string;
  readonly qrCodeSrc: SafeResourceUrl;
  readonly secret: string;
}

/** Operazioni MFA TOTP lato client Supabase (enrollment e stato). */
@Injectable({ providedIn: 'root' })
export class MfaService {
  private readonly supabaseClient = inject(SupabaseClientService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);

  private get supabase() {
    return this.supabaseClient.client;
  }

  isAvailable(): boolean {
    return this.supabaseClient.isConfigured;
  }

  async listVerifiedTotpFactors(): Promise<readonly Factor[]> {
    const factors = await this.listTotpFactors();
    return factors.filter((factor) => factor.status === 'verified');
  }

  /** Rimuove fattori TOTP non completati (API server + fallback client). */
  async cleanupUnverifiedTotpFactors(): Promise<void> {
    try {
      await firstValueFrom(
        this.http.post<{ readonly removed: number }>(
          `${this.config.apiBaseUrl}/auth/mfa/cleanup-pending`,
          {},
        ),
      );
      return;
    } catch {
      // Fallback se l'API non è raggiungibile: tentativo lato client Supabase.
    }

    const factors = await this.listTotpFactors();
    const pending = factors.filter((factor) => factor.status !== 'verified');

    for (const factor of pending) {
      const { error } = await this.supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (error) {
        throw error;
      }
    }
  }

  async startEnrollment(): Promise<MfaEnrollmentStart> {
    await this.cleanupUnverifiedTotpFactors();

    const { data, error } = await this.supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'VestiFlow',
      issuer: 'VestiFlow',
    });
    if (error || !data.totp) {
      throw error ?? new Error('Impossibile avviare la configurazione MFA.');
    }

    const qrCodeSrc = this.toTrustedQrCodeSrc(data.totp.qr_code);

    return {
      factorId: data.id,
      qrCodeSrc,
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

  mapErrorMessage(err: unknown): string {
    const raw = this.readErrorMessage(err);
    if (!raw) {
      return 'Operazione MFA non riuscita. Riprova.';
    }

    const normalized = raw.toLowerCase();
    if (normalized.includes('already exists')) {
      return 'Configurazione MFA già avviata. Ricarica la pagina e riprova.';
    }
    if (normalized.includes('invalid') || normalized.includes('expired')) {
      return 'Codice non valido o scaduto. Controlla l’app di autenticazione e riprova.';
    }

    return raw;
  }

  private async listTotpFactors(): Promise<readonly Factor[]> {
    const { data, error } = await this.supabase.auth.mfa.listFactors();
    if (error) {
      throw error;
    }

    return data.totp;
  }

  private toTrustedQrCodeSrc(qrCode: string): SafeResourceUrl {
    const trimmed = qrCode.trim();

    if (trimmed.startsWith('data:image/')) {
      // REASON: data URI QR dalla risposta Supabase Auth SDK (origine fidata), non input utente.
      return this.sanitizer.bypassSecurityTrustResourceUrl(trimmed);
    }

    if (trimmed.startsWith('<svg')) {
      const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(trimmed)}`;
      return this.sanitizer.bypassSecurityTrustResourceUrl(dataUri);
    }

    throw new Error('Formato QR code non supportato.');
  }

  private readErrorMessage(error: unknown): string | null {
    if (typeof error === 'object' && error !== null && 'message' in error) {
      const candidate = (error as { message?: unknown }).message;
      return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate : null;
    }
    return null;
  }
}
