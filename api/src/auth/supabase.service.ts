import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createClient,
  type SupabaseClient,
  type User as SupabaseAuthUser,
} from '@supabase/supabase-js';

/**
 * Client Supabase con service role (solo backend). Usato per validare i JWT
 * emessi da Supabase Auth — mai esporre la service role al frontend.
 */
@Injectable()
export class SupabaseService {
  private readonly client: SupabaseClient | null;

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('SUPABASE_URL');
    const serviceRoleKey = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
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
}
