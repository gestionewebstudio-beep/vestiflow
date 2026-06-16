import type { SupabaseClient } from '@supabase/supabase-js';

/** True se la sessione corrente richiede verifica TOTP prima dell'accesso completo. */
export async function sessionNeedsMfaVerification(client: SupabaseClient): Promise<boolean> {
  const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) {
    return false;
  }

  return data.currentLevel === 'aal1' && data.nextLevel === 'aal2';
}

/** Completa il login MFA con codice TOTP a 6 cifre. */
export async function verifyMfaChallenge(
  client: SupabaseClient,
  code: string,
): Promise<{ readonly accessToken: string }> {
  const normalizedCode = code.trim();
  const { data: factors, error: factorsError } = await client.auth.mfa.listFactors();
  if (factorsError) {
    throw factorsError;
  }

  const totpFactor = factors.totp.find((factor) => factor.status === 'verified');
  if (!totpFactor) {
    throw new Error('Nessun fattore TOTP attivo.');
  }

  const { data: challenge, error: challengeError } = await client.auth.mfa.challenge({
    factorId: totpFactor.id,
  });
  if (challengeError || !challenge) {
    throw challengeError ?? new Error('Impossibile avviare la verifica MFA.');
  }

  const { data: verified, error: verifyError } = await client.auth.mfa.verify({
    factorId: totpFactor.id,
    challengeId: challenge.id,
    code: normalizedCode,
  });
  if (verifyError || !verified) {
    throw verifyError ?? new Error('Codice non valido.');
  }

  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError || !sessionData.session) {
    throw sessionError ?? new Error('Sessione non disponibile dopo la verifica MFA.');
  }

  return { accessToken: sessionData.session.access_token };
}
