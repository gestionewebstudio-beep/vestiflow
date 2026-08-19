/**
 * @vitest-environment jsdom
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import {
  establishSessionFromAuthRedirect,
  parseAuthRedirectFlowType,
  type AuthRedirectClientConfig,
} from './auth-redirect-session.util';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));

const SUPABASE_URL = 'https://progetto.supabase.co';
const ANON_KEY = 'anon-key-pubblica';
const BASE_PATH = '/auth/callback';

interface SessionLike {
  readonly access_token: string;
  readonly refresh_token: string;
}

const SESSION: SessionLike = { access_token: 'at-sessione', refresh_token: 'rt-sessione' };

interface AuthDouble {
  readonly getSession: Mock;
  readonly verifyOtp: Mock;
  readonly setSession: Mock;
  readonly exchangeCodeForSession: Mock;
}

interface AuthClientOverrides {
  readonly session?: SessionLike | null;
  readonly verifyOtpSession?: SessionLike | null;
  readonly verifyOtpError?: Error | null;
  readonly setSessionSession?: SessionLike | null;
  readonly setSessionError?: Error | null;
  readonly exchangeSession?: SessionLike | null;
  readonly exchangeError?: Error | null;
}

function createAuthClient(overrides: AuthClientOverrides = {}): {
  auth: AuthDouble;
  client: SupabaseClient;
} {
  const auth: AuthDouble = {
    getSession: vi.fn().mockResolvedValue({
      data: { session: overrides.session ?? null },
      error: null,
    }),
    verifyOtp: vi.fn().mockResolvedValue({
      data: { session: overrides.verifyOtpSession ?? null, user: null },
      error: overrides.verifyOtpError ?? null,
    }),
    setSession: vi.fn().mockResolvedValue({
      data: { session: overrides.setSessionSession ?? null, user: null },
      error: overrides.setSessionError ?? null,
    }),
    exchangeCodeForSession: vi.fn().mockResolvedValue({
      data: { session: overrides.exchangeSession ?? null, user: null },
      error: overrides.exchangeError ?? null,
    }),
  };

  return { auth, client: { auth } as unknown as SupabaseClient };
}

function configFor(client: SupabaseClient): AuthRedirectClientConfig {
  return { client, supabaseUrl: SUPABASE_URL, anonKey: ANON_KEY };
}

/** Sessione vista dal client effimero che Supabase crea per leggere l'URL. */
function stubEphemeralSession(session: Partial<SessionLike> | null): void {
  (createClient as unknown as Mock).mockReturnValue({
    auth: {
      initialize: vi.fn().mockResolvedValue({ error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
    },
  });
}

function setLocation(query = '', hash = ''): void {
  window.history.replaceState({}, '', `${BASE_PATH}${query}${hash}`);
}

describe('auth-redirect-session.util', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubEphemeralSession(null);
    setLocation();
  });

  describe('parseAuthRedirectFlowType', () => {
    it('riconosce invito e recupero password', () => {
      expect(parseAuthRedirectFlowType('invite')).toBe('invite');
      expect(parseAuthRedirectFlowType('recovery')).toBe('recovery');
      expect(parseAuthRedirectFlowType('signup')).toBe('unknown');
      expect(parseAuthRedirectFlowType(null)).toBeNull();
    });

    it('considera sconosciuto ogni altro tipo valorizzato e nullo quello vuoto', () => {
      expect(parseAuthRedirectFlowType('magiclink')).toBe('unknown');
      expect(parseAuthRedirectFlowType('email_change')).toBe('unknown');
      expect(parseAuthRedirectFlowType('')).toBeNull();
    });
  });

  describe('establishSessionFromAuthRedirect', () => {
    it('fuori dal browser si limita a leggere la sessione esistente, senza dichiarare un flusso', async () => {
      const conSessione = createAuthClient({ session: SESSION });
      const senzaSessione = createAuthClient({ session: null });

      vi.stubGlobal('window', undefined);
      const risultatoConSessione = await establishSessionFromAuthRedirect(
        configFor(conSessione.client),
      );
      const risultatoSenzaSessione = await establishSessionFromAuthRedirect(
        configFor(senzaSessione.client),
      );
      vi.unstubAllGlobals();

      expect(risultatoConSessione).toEqual({ ok: true, flowType: null });
      expect(risultatoSenzaSessione).toEqual({ ok: false, flowType: null });
      expect(conSessione.auth.getSession).toHaveBeenCalledTimes(1);
    });

    it('fallisce senza toccare il client quando la query porta un errore, conservando il tipo di flusso', async () => {
      setLocation('?error=access_denied&error_description=scaduto&type=invite');
      const { auth, client } = createAuthClient({ session: SESSION });

      await expect(establishSessionFromAuthRedirect(configFor(client))).resolves.toEqual({
        ok: false,
        flowType: 'invite',
      });
      expect(auth.getSession).not.toHaveBeenCalled();
      expect(auth.verifyOtp).not.toHaveBeenCalled();
    });

    it('riconosce error_code in query anche senza tipo di flusso', async () => {
      setLocation('?error_code=otp_expired');
      const { client } = createAuthClient();

      await expect(establishSessionFromAuthRedirect(configFor(client))).resolves.toEqual({
        ok: false,
        flowType: null,
      });
    });

    it('riconosce l errore quando arriva nel frammento e legge il tipo dal frammento', async () => {
      setLocation('', '#error=access_denied&type=recovery');
      const { client } = createAuthClient();

      await expect(establishSessionFromAuthRedirect(configFor(client))).resolves.toEqual({
        ok: false,
        flowType: 'recovery',
      });
    });

    it('riconosce error_code nel frammento', async () => {
      setLocation('', '#error_code=otp_expired&type=invite');
      const { client } = createAuthClient();

      await expect(establishSessionFromAuthRedirect(configFor(client))).resolves.toEqual({
        ok: false,
        flowType: 'invite',
      });
    });

    it('verifica il token_hash del link e ripulisce la query dai parametri di autenticazione', async () => {
      setLocation('?token_hash=hash-1&type=invite&next=dashboard');
      const { auth, client } = createAuthClient({ verifyOtpSession: SESSION });

      const risultato = await establishSessionFromAuthRedirect(configFor(client));

      expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'hash-1', type: 'invite' });
      expect(risultato).toEqual({ ok: true, flowType: 'invite' });
      expect(window.location.search).toBe('?next=dashboard');
    });

    it('accetta token come alias di token_hash', async () => {
      setLocation('?token=tok-9&type=recovery');
      const { auth, client } = createAuthClient({ verifyOtpSession: SESSION });

      const risultato = await establishSessionFromAuthRedirect(configFor(client));

      expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'tok-9', type: 'recovery' });
      expect(risultato).toEqual({ ok: true, flowType: 'recovery' });
      expect(window.location.search).toBe('');
    });

    it('non stabilisce la sessione se verifyOtp fallisce o non restituisce una sessione', async () => {
      setLocation('?token_hash=hash-2&type=recovery');
      const conErrore = createAuthClient({
        verifyOtpError: new Error('link scaduto'),
        verifyOtpSession: SESSION,
      });
      await expect(establishSessionFromAuthRedirect(configFor(conErrore.client))).resolves.toEqual({
        ok: false,
        flowType: 'recovery',
      });

      setLocation('?token_hash=hash-2&type=recovery');
      const senzaSessione = createAuthClient({ verifyOtpSession: null });
      await expect(
        establishSessionFromAuthRedirect(configFor(senzaSessione.client)),
      ).resolves.toEqual({ ok: false, flowType: 'recovery' });
    });

    it('traduce ogni tipo di link nel tipo OTP corrispondente, con email come ripiego', async () => {
      const casi: readonly (readonly [string, string])[] = [
        ['invite', 'invite'],
        ['recovery', 'recovery'],
        ['signup', 'signup'],
        ['magiclink', 'magiclink'],
        ['email_change', 'email_change'],
        ['tipo_mai_visto', 'email'],
      ];

      for (const [parametro, atteso] of casi) {
        setLocation(`?token_hash=hash-3&type=${parametro}`);
        const { auth, client } = createAuthClient({ verifyOtpSession: SESSION });

        await establishSessionFromAuthRedirect(configFor(client));

        expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'hash-3', type: atteso });
      }
    });

    it('stabilisce la sessione dai token del frammento e rimuove il frammento dall URL', async () => {
      setLocation('', '#access_token=at-1&refresh_token=rt-1&type=recovery');
      const { auth, client } = createAuthClient({ setSessionSession: SESSION });

      const risultato = await establishSessionFromAuthRedirect(configFor(client));

      expect(auth.setSession).toHaveBeenCalledWith({
        access_token: 'at-1',
        refresh_token: 'rt-1',
      });
      expect(risultato).toEqual({ ok: true, flowType: 'recovery' });
      expect(window.location.hash).toBe('');
    });

    it('ricade sul tipo della query quando il frammento non lo porta', async () => {
      setLocation('?type=invite', '#access_token=at-2&refresh_token=rt-2');
      const { client } = createAuthClient({ setSessionSession: SESSION });

      await expect(establishSessionFromAuthRedirect(configFor(client))).resolves.toEqual({
        ok: true,
        flowType: 'invite',
      });
    });

    it('segnala il fallimento se setSession rifiuta i token del frammento', async () => {
      setLocation('', '#access_token=at-3&refresh_token=rt-3&type=invite');
      const { client } = createAuthClient({
        setSessionError: new Error('token non valido'),
        setSessionSession: SESSION,
      });

      await expect(establishSessionFromAuthRedirect(configFor(client))).resolves.toEqual({
        ok: false,
        flowType: 'invite',
      });
    });

    it('scambia il code con una sessione e ripulisce la query', async () => {
      setLocation('?code=code-1&type=invite');
      const { auth, client } = createAuthClient({ exchangeSession: SESSION });

      const risultato = await establishSessionFromAuthRedirect(configFor(client));

      expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('code-1');
      expect(risultato).toEqual({ ok: true, flowType: 'invite' });
      expect(window.location.search).toBe('');
    });

    it('se lo scambio del code fallisce tenta il rilevamento automatico con un client effimero', async () => {
      setLocation('?code=code-2&type=recovery');
      const { auth, client } = createAuthClient({
        exchangeError: new Error('code non valido'),
        setSessionSession: SESSION,
      });
      stubEphemeralSession({ access_token: 'auto-at', refresh_token: 'auto-rt' });

      const risultato = await establishSessionFromAuthRedirect(configFor(client));

      expect(createClient).toHaveBeenCalledWith(SUPABASE_URL, ANON_KEY, {
        auth: { detectSessionInUrl: true, persistSession: false, autoRefreshToken: false },
      });
      expect(auth.setSession).toHaveBeenCalledWith({
        access_token: 'auto-at',
        refresh_token: 'auto-rt',
      });
      expect(risultato).toEqual({ ok: true, flowType: 'recovery' });
      expect(window.location.search).toBe('');
      expect(window.location.hash).toBe('');
    });

    it('rileva la sessione dal frammento anche quando manca il refresh token esplicito', async () => {
      setLocation('', '#access_token=solo-at&type=invite');
      const { auth, client } = createAuthClient({ setSessionSession: SESSION });
      stubEphemeralSession({ access_token: 'auto-at', refresh_token: 'auto-rt' });

      const risultato = await establishSessionFromAuthRedirect(configFor(client));

      expect(auth.setSession).toHaveBeenCalledTimes(1);
      expect(risultato).toEqual({ ok: true, flowType: 'invite' });
    });

    it('non dichiara alcun flusso quando né URL né rilevamento automatico ne portano uno', async () => {
      setLocation('?token_hash=orfano');
      const { client } = createAuthClient({ setSessionSession: SESSION });
      stubEphemeralSession({ access_token: 'auto-at', refresh_token: 'auto-rt' });

      await expect(establishSessionFromAuthRedirect(configFor(client))).resolves.toEqual({
        ok: true,
        flowType: null,
      });
    });

    it('segnala il fallimento se setSession rifiuta i token rilevati automaticamente', async () => {
      setLocation('?token_hash=orfano&type=');
      const { client } = createAuthClient({
        setSessionError: new Error('rifiutato'),
        setSessionSession: SESSION,
      });
      stubEphemeralSession({ access_token: 'auto-at', refresh_token: 'auto-rt' });

      await expect(establishSessionFromAuthRedirect(configFor(client))).resolves.toEqual({
        ok: false,
        flowType: null,
      });
    });

    it('ignora una sessione effimera priva di uno dei due token e ricade sulla sessione corrente', async () => {
      setLocation('?token=orfano');
      const senzaRefresh = createAuthClient({ session: SESSION });
      stubEphemeralSession({ access_token: 'auto-at' });
      await expect(
        establishSessionFromAuthRedirect(configFor(senzaRefresh.client)),
      ).resolves.toEqual({ ok: true, flowType: null });
      expect(senzaRefresh.auth.setSession).not.toHaveBeenCalled();

      setLocation('?token=orfano');
      const senzaAccess = createAuthClient({ session: SESSION });
      stubEphemeralSession({ refresh_token: 'auto-rt' });
      await expect(
        establishSessionFromAuthRedirect(configFor(senzaAccess.client)),
      ).resolves.toEqual({ ok: true, flowType: null });
      expect(senzaAccess.auth.setSession).not.toHaveBeenCalled();
    });

    it('tratta come redirect da risolvere un frammento con error o error_code senza valore', async () => {
      setLocation('', '#error=');
      const conError = createAuthClient({ setSessionSession: SESSION });
      stubEphemeralSession({ access_token: 'auto-at', refresh_token: 'auto-rt' });
      await expect(establishSessionFromAuthRedirect(configFor(conError.client))).resolves.toEqual({
        ok: true,
        flowType: null,
      });
      expect(conError.auth.setSession).toHaveBeenCalledTimes(1);

      setLocation('', '#error_code=');
      const conErrorCode = createAuthClient({ setSessionSession: SESSION });
      stubEphemeralSession({ access_token: 'auto-at', refresh_token: 'auto-rt' });
      await expect(
        establishSessionFromAuthRedirect(configFor(conErrorCode.client)),
      ).resolves.toEqual({ ok: true, flowType: null });
      expect(conErrorCode.auth.setSession).toHaveBeenCalledTimes(1);
    });

    it('ignora un frammento che non riguarda l autenticazione', async () => {
      setLocation('', '#sezione=totali');
      const { auth, client } = createAuthClient({ session: SESSION });

      await expect(establishSessionFromAuthRedirect(configFor(client))).resolves.toEqual({
        ok: true,
        flowType: null,
      });
      expect(createClient).not.toHaveBeenCalled();
      expect(auth.getSession).toHaveBeenCalledTimes(1);
    });

    it('senza parametri di redirect si limita alla sessione corrente', async () => {
      const { auth, client } = createAuthClient({ session: SESSION });

      await expect(establishSessionFromAuthRedirect(configFor(client))).resolves.toEqual({
        ok: true,
        flowType: null,
      });
      expect(auth.getSession).toHaveBeenCalledTimes(1);
      expect(createClient).not.toHaveBeenCalled();
    });

    it('conserva il tipo di flusso quando la sessione esiste già', async () => {
      setLocation('?type=recovery');
      const { client } = createAuthClient({ session: SESSION });

      await expect(establishSessionFromAuthRedirect(configFor(client))).resolves.toEqual({
        ok: true,
        flowType: 'recovery',
      });
    });

    it('azzera il tipo di flusso quando non esiste alcuna sessione', async () => {
      setLocation('?type=invite');
      const { client } = createAuthClient({ session: null });

      await expect(establishSessionFromAuthRedirect(configFor(client))).resolves.toEqual({
        ok: false,
        flowType: null,
      });
    });
  });
});
