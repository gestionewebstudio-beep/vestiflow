import { describe, expect, it, vi } from 'vitest';

import { sessionNeedsMfaVerification, verifyMfaChallenge } from './supabase-mfa.util';

function createMfaClient(overrides: {
  assuranceLevel?: { currentLevel: string; nextLevel: string } | null;
  assuranceError?: Error;
  factors?: { totp: { id: string; status: string }[] };
  factorsError?: Error;
  challenge?: { id: string } | null;
  challengeError?: Error;
  verifyError?: Error;
  session?: { access_token: string } | null;
  sessionError?: Error;
}) {
  return {
    auth: {
      mfa: {
        getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({
          data: overrides.assuranceLevel ?? null,
          error: overrides.assuranceError ?? null,
        }),
        listFactors: vi.fn().mockResolvedValue({
          data: { totp: overrides.factors?.totp ?? [] },
          error: overrides.factorsError ?? null,
        }),
        challenge: vi.fn().mockResolvedValue({
          data: overrides.challenge ?? null,
          error: overrides.challengeError ?? null,
        }),
        verify: vi.fn().mockResolvedValue({
          data: overrides.verifyError ? null : { id: 'verified' },
          error: overrides.verifyError ?? null,
        }),
      },
      getSession: vi.fn().mockResolvedValue({
        data: { session: overrides.session ?? null },
        error: overrides.sessionError ?? null,
      }),
    },
  } as unknown as import('@supabase/supabase-js').SupabaseClient;
}

describe('supabase-mfa.util', () => {
  describe('sessionNeedsMfaVerification', () => {
    it('ritorna true quando serve AAL2', async () => {
      const client = createMfaClient({
        assuranceLevel: { currentLevel: 'aal1', nextLevel: 'aal2' },
      });

      await expect(sessionNeedsMfaVerification(client)).resolves.toBe(true);
    });

    it('ritorna false in caso di errore o livelli allineati', async () => {
      const clientError = createMfaClient({ assuranceError: new Error('fail') });
      await expect(sessionNeedsMfaVerification(clientError)).resolves.toBe(false);

      const clientOk = createMfaClient({
        assuranceLevel: { currentLevel: 'aal2', nextLevel: 'aal2' },
      });
      await expect(sessionNeedsMfaVerification(clientOk)).resolves.toBe(false);
    });
  });

  describe('verifyMfaChallenge', () => {
    it('completa la verifica TOTP e restituisce accessToken', async () => {
      const client = createMfaClient({
        factors: { totp: [{ id: 'factor-1', status: 'verified' }] },
        challenge: { id: 'challenge-1' },
        session: { access_token: 'jwt-token' },
      });

      const result = await verifyMfaChallenge(client, ' 123456 ');
      expect(result.accessToken).toBe('jwt-token');
    });

    it('lancia se manca fattore TOTP verificato', async () => {
      const client = createMfaClient({ factors: { totp: [] } });
      await expect(verifyMfaChallenge(client, '123456')).rejects.toThrow(
        'Nessun fattore TOTP attivo.',
      );
    });

    it('propaga errori di challenge e verifica', async () => {
      const challengeErr = new Error('Challenge fallita');
      const clientChallenge = createMfaClient({
        factors: { totp: [{ id: 'factor-1', status: 'verified' }] },
        challengeError: challengeErr,
      });
      await expect(verifyMfaChallenge(clientChallenge, '123456')).rejects.toBe(challengeErr);

      const verifyErr = new Error('Codice errato');
      const clientVerify = createMfaClient({
        factors: { totp: [{ id: 'factor-1', status: 'verified' }] },
        challenge: { id: 'challenge-1' },
        verifyError: verifyErr,
      });
      await expect(verifyMfaChallenge(clientVerify, '000000')).rejects.toBe(verifyErr);
    });
  });
});
