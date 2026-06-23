import { Injectable, Logger } from '@nestjs/common';
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
export interface ProvisionAuthUserResult {
  readonly authUserId: string;
  readonly inviteSent: boolean;
}

@Injectable()
export class SupabaseService {
  private readonly logger = new Logger(SupabaseService.name);
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

  /** Client Supabase per Storage (service role). */
  getStorageClient(): SupabaseClient | null {
    return this.client;
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
   * Crea utente Auth + invito email, oppure riusa un utente Auth orfano (test falliti)
   * e reinvia il link di accesso.
   */
  async provisionAuthUserForInvite(
    email: string,
    redirectTo: string,
  ): Promise<ProvisionAuthUserResult> {
    if (!this.client) {
      throw new Error('Supabase non configurato');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingAuthUserId = await this.findAuthUserIdByEmail(normalizedEmail);
    if (existingAuthUserId) {
      await this.resendAuthInvite(normalizedEmail, redirectTo);
      return { authUserId: existingAuthUserId, inviteSent: true };
    }

    const { data, error } = await this.client.auth.admin.inviteUserByEmail(normalizedEmail, {
      redirectTo,
    });
    if (error || !data.user) {
      throw this.mapAuthInviteError(error?.message);
    }

    return { authUserId: data.user.id, inviteSent: true };
  }

  /** @deprecated Usa provisionAuthUserForInvite. */
  async inviteAuthUser(email: string, redirectTo: string): Promise<string> {
    const result = await this.provisionAuthUserForInvite(email, redirectTo);
    return result.authUserId;
  }

  async findAuthUserIdByEmail(email: string): Promise<string | null> {
    if (!this.client) {
      return null;
    }

    const normalizedEmail = email.trim().toLowerCase();
    let page = 1;
    const perPage = 200;

    while (page <= 10) {
      const { data, error } = await this.client.auth.admin.listUsers({ page, perPage });
      if (error) {
        this.logger.warn(`listUsers pagina ${page} fallita: ${error.message}`);
        return null;
      }
      if (!data.users.length) {
        return null;
      }

      const existing = data.users.find((user) => user.email?.toLowerCase() === normalizedEmail);
      if (existing) {
        return existing.id;
      }

      if (data.users.length < perPage) {
        return null;
      }
      page += 1;
    }

    return null;
  }

  private mapAuthInviteError(message?: string): Error {
    const normalized = (message ?? 'INVITE_FAILED').toLowerCase();
    if (normalized.includes('rate limit') || normalized.includes('too many')) {
      return new Error('EMAIL_RATE_LIMIT');
    }
    if (normalized.includes('redirect')) {
      return new Error('REDIRECT_NOT_ALLOWED');
    }
    if (
      normalized.includes('already registered') ||
      normalized.includes('already exists') ||
      normalized.includes('duplicate')
    ) {
      return new Error('EMAIL_ALREADY_REGISTERED');
    }
    this.logger.error(`inviteUserByEmail fallito: ${message ?? 'INVITE_FAILED'}`);
    return new Error(message ?? 'INVITE_FAILED');
  }

  /**
   * Reinvia link per impostare/reimpostare la password (utente Auth già creato).
   * inviteUserByEmail fallisce se l'email esiste già: GoTrue /recover verso la stessa pagina.
   */
  async resendAuthInvite(email: string, redirectTo: string): Promise<void> {
    if (!this.supabaseUrl || !this.serviceRoleKey) {
      throw new Error('Supabase non configurato');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const response = await fetch(`${this.supabaseUrl}/auth/v1/recover`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: this.serviceRoleKey,
        Authorization: `Bearer ${this.serviceRoleKey}`,
      },
      body: JSON.stringify({
        email: normalizedEmail,
        redirect_to: redirectTo,
      }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        msg?: string;
        message?: string;
      };
      throw this.mapAuthInviteError(body.msg ?? body.message);
    }
  }

  /** Crea un utente Supabase Auth con password (seed dev / casi legacy). */
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
