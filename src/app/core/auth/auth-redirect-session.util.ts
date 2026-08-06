import { createClient, type EmailOtpType, type SupabaseClient } from '@supabase/supabase-js';

export type AuthRedirectFlowType = 'invite' | 'recovery' | 'unknown';

export interface AuthRedirectSessionResult {
  readonly ok: boolean;
  readonly flowType: AuthRedirectFlowType | null;
}

export interface AuthRedirectClientConfig {
  readonly client: SupabaseClient;
  readonly supabaseUrl: string;
  readonly anonKey: string;
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

function mapVerifyOtpType(type: string): EmailOtpType {
  switch (type) {
    case 'invite':
      return 'invite';
    case 'recovery':
      return 'recovery';
    case 'signup':
      return 'signup';
    case 'magiclink':
      return 'magiclink';
    case 'email_change':
      return 'email_change';
    default:
      return 'email';
  }
}

function readFlowTypeFromUrl(url: URL): AuthRedirectFlowType | null {
  const fromQuery = parseAuthRedirectFlowType(url.searchParams.get('type'));
  if (fromQuery) {
    return fromQuery;
  }

  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : '';
  if (!hash) {
    return null;
  }

  return parseAuthRedirectFlowType(new URLSearchParams(hash).get('type'));
}

function hasAuthRedirectParams(url: URL): boolean {
  if (
    url.searchParams.has('code') ||
    url.searchParams.has('token_hash') ||
    url.searchParams.has('token')
  ) {
    return true;
  }

  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : '';
  if (!hash) {
    return false;
  }

  return hash.includes('access_token=') || hash.includes('error=') || hash.includes('error_code=');
}

function hasAuthRedirectError(url: URL): boolean {
  if (url.searchParams.get('error') || url.searchParams.get('error_code')) {
    return true;
  }

  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : '';
  if (!hash) {
    return false;
  }

  const hashParams = new URLSearchParams(hash);
  return Boolean(hashParams.get('error') || hashParams.get('error_code'));
}

/**
 * Stabilisce la sessione temporanea da link email Supabase (invito o recupero password).
 * Necessario perché il client globale ha `detectSessionInUrl: false`.
 */
export async function establishSessionFromAuthRedirect(
  config: AuthRedirectClientConfig,
): Promise<AuthRedirectSessionResult> {
  const { client, supabaseUrl, anonKey } = config;

  if (typeof window === 'undefined') {
    const { data } = await client.auth.getSession();
    return { ok: Boolean(data.session), flowType: null };
  }

  const url = new URL(window.location.href);
  const flowType = readFlowTypeFromUrl(url);

  if (hasAuthRedirectError(url)) {
    return { ok: false, flowType };
  }

  const tokenHash = url.searchParams.get('token_hash') ?? url.searchParams.get('token');
  const typeParam = url.searchParams.get('type');
  if (tokenHash && typeParam) {
    const { data, error } = await client.auth.verifyOtp({
      token_hash: tokenHash,
      type: mapVerifyOtpType(typeParam),
    });
    stripAuthQueryFromUrl(url);
    return { ok: !error && Boolean(data.session), flowType: parseAuthRedirectFlowType(typeParam) };
  }

  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : '';
  if (hash) {
    const hashParams = new URLSearchParams(hash);
    const hashFlowType = parseAuthRedirectFlowType(hashParams.get('type')) ?? flowType;
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');
    if (accessToken && refreshToken) {
      const { data, error } = await client.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      stripUrlHash();
      return { ok: !error && Boolean(data.session), flowType: hashFlowType };
    }
  }

  const code = url.searchParams.get('code');
  if (code) {
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (!error && data.session) {
      stripAuthQueryFromUrl(url);
      return { ok: true, flowType };
    }
  }

  if (hasAuthRedirectParams(url)) {
    const detected = await tryAutoDetectSession(supabaseUrl, anonKey);
    if (detected.session) {
      const { data, error } = await client.auth.setSession({
        access_token: detected.session.access_token,
        refresh_token: detected.session.refresh_token,
      });
      stripUrlHash();
      stripAuthQueryFromUrl(url);
      return {
        ok: !error && Boolean(data.session),
        flowType: detected.flowType ?? flowType,
      };
    }
  }

  const { data } = await client.auth.getSession();
  return { ok: Boolean(data.session), flowType: data.session ? flowType : null };
}

async function tryAutoDetectSession(
  supabaseUrl: string,
  anonKey: string,
): Promise<{
  session: { access_token: string; refresh_token: string } | null;
  flowType: AuthRedirectFlowType | null;
}> {
  const url = new URL(window.location.href);
  const flowType = readFlowTypeFromUrl(url);

  const ephemeral = createClient(supabaseUrl, anonKey, {
    auth: {
      detectSessionInUrl: true,
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  await ephemeral.auth.initialize();
  const { data } = await ephemeral.auth.getSession();
  const session = data.session;

  if (!session?.access_token || !session.refresh_token) {
    return { session: null, flowType };
  }

  return {
    session: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    },
    flowType,
  };
}

function stripAuthQueryFromUrl(url: URL): void {
  url.searchParams.delete('code');
  url.searchParams.delete('type');
  url.searchParams.delete('token_hash');
  url.searchParams.delete('token');
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
