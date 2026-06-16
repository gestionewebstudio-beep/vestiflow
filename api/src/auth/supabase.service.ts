import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createClient,
  type SupabaseClient,
  type User as SupabaseAuthUser,
} from '@supabase/supabase-js';

interface AdminMfaFactor {
  readonly id?: string;
  readonly factor_type?: string;
  readonly status?: string;
  readonly friendly_name?: string;
}

/**
 * Client Supabase con service role (solo backend). Usato per validare i JWT
 * emessi da Supabase Auth — mai esporre la service role al frontend.
 */
@Injectable()
export class SupabaseService {
  private readonly client: SupabaseClient | null;
  private readonly supabaseUrl: string | undefined;
  private readonly serviceRoleKey: string | undefined;

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('SUPABASE_URL');
    const serviceRoleKey = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    this.supabaseUrl = url?.replace(/\/$/, '');
    this.serviceRoleKey = serviceRoleKey;
    this.client =
      url && serviceRoleKey
        ? createClient(url, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false },
          })
        : null;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async getUserFromAccessToken(accessToken: string): Promise<SupabaseAuthUser | null> {
    if (!this.client) {
      return null;
    }
    const { data, error } = await this.client.auth.getUser(accessToken);
    if (error || !data.user) {
      return null;
    }
    return data.user;
  }

  /** Crea o recupera un utente Auth per il seed di sviluppo. */
  async ensureAuthUser(email: string, password: string): Promise<string | null> {
    if (!this.client) {
      return null;
    }

    const { data: listed, error: listError } = await this.client.auth.admin.listUsers();
    if (!listError) {
      const existing = listed.users.find(
        (user) => user.email?.toLowerCase() === email.toLowerCase(),
      );
      if (existing) {
        return existing.id;
      }
    }

    const { data, error } = await this.client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) {
      console.warn(
        `Seed auth: impossibile creare ${email} — ${error?.message ?? 'errore sconosciuto'}`,
      );
      return null;
    }
    return data.user.id;
  }

  /**
   * Crea un utente Supabase Auth per onboarding cliente. Fallisce se l'email esiste.
   */
  async createAuthUser(email: string, password: string): Promise<string> {
    if (!this.client) {
      throw new Error('Supabase non configurato');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const { data: listed, error: listError } = await this.client.auth.admin.listUsers();
    if (!listError) {
      const existing = listed.users.find((user) => user.email?.toLowerCase() === normalizedEmail);
      if (existing) {
        throw new Error('EMAIL_ALREADY_REGISTERED');
      }
    }

    const { data, error } = await this.client.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
    });
    if (error || !data.user) {
      throw new Error(error?.message ?? 'CREATION_FAILED');
    }
    return data.user.id;
  }

  /** Rollback onboarding se la transazione Prisma fallisce dopo la creazione Auth. */
  async deleteAuthUser(authUserId: string): Promise<void> {
    if (!this.client) {
      return;
    }
    await this.client.auth.admin.deleteUser(authUserId);
  }

  /** True se l'utente Auth ha almeno un fattore TOTP verificato (MFA attivo). */
  async userHasVerifiedTotpFactor(authUserId: string): Promise<boolean> {
    const factors = await this.listAdminMfaFactors(authUserId);
    return factors.some((factor) => factor.factor_type === 'totp' && factor.status === 'verified');
  }

  /** Elimina fattori TOTP non verificati (registrazione MFA abbandonata). */
  async cleanupUnverifiedTotpFactors(authUserId: string): Promise<number> {
    const factors = await this.listAdminMfaFactors(authUserId);
    let removed = 0;

    for (const factor of factors) {
      if (factor.factor_type !== 'totp' || factor.status === 'verified' || !factor.id) {
        continue;
      }
      await this.deleteAdminMfaFactor(authUserId, factor.id);
      removed += 1;
    }

    return removed;
  }

  private async listAdminMfaFactors(authUserId: string): Promise<readonly AdminMfaFactor[]> {
    if (!this.supabaseUrl || !this.serviceRoleKey) {
      return [];
    }

    const response = await fetch(`${this.supabaseUrl}/auth/v1/admin/users/${authUserId}/factors`, {
      headers: {
        Authorization: `Bearer ${this.serviceRoleKey}`,
        apikey: this.serviceRoleKey,
      },
    });

    if (!response.ok) {
      return [];
    }

    const body: unknown = await response.json();
    return this.extractAdminFactors(body);
  }

  private async deleteAdminMfaFactor(authUserId: string, factorId: string): Promise<void> {
    if (!this.supabaseUrl || !this.serviceRoleKey) {
      throw new Error('Supabase non configurato');
    }

    const response = await fetch(
      `${this.supabaseUrl}/auth/v1/admin/users/${authUserId}/factors/${factorId}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${this.serviceRoleKey}`,
          apikey: this.serviceRoleKey,
        },
      },
    );

    if (!response.ok) {
      throw new Error('Impossibile rimuovere il fattore MFA incompleto.');
    }
  }

  private extractAdminFactors(body: unknown): readonly AdminMfaFactor[] {
    if (Array.isArray(body)) {
      return body as AdminMfaFactor[];
    }
    if (typeof body === 'object' && body !== null && 'factors' in body) {
      const nested = (body as { factors: unknown }).factors;
      return Array.isArray(nested) ? (nested as AdminMfaFactor[]) : [];
    }
    return [];
  }
}
