import { inject, Injectable } from '@angular/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { APP_CONFIG } from '@core/config/app-config.token';

/** Client Supabase con anon key (solo frontend). Condiviso da auth e MFA. */
@Injectable({ providedIn: 'root' })
export class SupabaseClientService {
  private readonly _client: SupabaseClient | null;

  constructor() {
    const config = inject(APP_CONFIG);
    const supabaseConfig = config.supabase;
    if (!supabaseConfig?.url || !supabaseConfig.anonKey) {
      this._client = null;
      return;
    }

    this._client = createClient(supabaseConfig.url, supabaseConfig.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }

  get isConfigured(): boolean {
    return this._client !== null;
  }

  get client(): SupabaseClient {
    if (!this._client) {
      throw new Error('Configurazione Supabase incompleta (url / anonKey).');
    }
    return this._client;
  }
}
