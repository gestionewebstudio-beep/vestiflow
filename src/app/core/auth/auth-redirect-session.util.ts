import type { SupabaseClient } from '@supabase/supabase-js';

export type AuthRedirectFlowType = 'invite' | 'recovery' | 'unknown';

export interface AuthRedirectSessionResult {
  readonly ok: boolean;
  readonly flowType: AuthRedirectFlowType | null;
}

/** Mappa il parametro `type` del redirect Supabase (hash o query). */
export function parseAuthRedirectFlowType(type: string | null): AuthRedirectFlowType | null {
  if (type === 'invite') {
    return 'invite';
  }
  if (type === 'recovery') {
    return 'recovery';
  }
  return type ? 'unknown' : null;
}

/**
 * Stabilisce la sessione temporanea da link email Supabase (invito o recupero password).
 * Necessario perché il client ha `detectSessionInUrl: false` per evitare side effect globali.
 */
export async function establishSessionFromAuthRedirect(
  client: SupabaseClient,
): Promise<AuthRedirectSessionResult> {
  if (typeof window === 'undefined') {
    const { data } = await client.auth.getSession();
    return { ok: Boolean(data.session), flowType: null };
  }

  const url = new URL(window.location.href);

  const code = url.searchParams.get('code');
  if (code) {
    const flowType = parseAuthRedirectFlowType(url.searchParams.get('type'));
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    stripAuthQueryFromUrl(url);
    return { ok: !error && Boolean(data.session), flowType };
  }

  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : '';
  if (hash) {
    const hashParams = new URLSearchParams(hash);
    const flowType = parseAuthRedirectFlowType(hashParams.get('type'));
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');
    if (accessToken && refreshToken) {
      const { data, error } = await client.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      stripUrlHash();
      return { ok: !error && Boolean(data.session), flowType };
    }
  }

  const { data } = await client.auth.getSession();
  return { ok: Boolean(data.session), flowType: null };
}

function stripAuthQueryFromUrl(url: URL): void {
  url.searchParams.delete('code');
  url.searchParams.delete('type');
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, document.title, next);
}

function stripUrlHash(): void {
  window.history.replaceState(
    {},
    document.title,
    window.location.pathname + window.location.search,
  );
}
