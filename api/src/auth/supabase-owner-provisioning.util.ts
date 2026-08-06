import type { ConfigService } from '@nestjs/config';

/**
 * Invito email Supabase al titolare (primo accesso senza password admin).
 * Disabilitato di default: piano free limita ~2 email/ora.
 * Riattivare con SUPABASE_OWNER_EMAIL_INVITE=true (+ SMTP custom consigliato).
 */
export function isSupabaseOwnerEmailInviteEnabled(config: ConfigService): boolean {
  return config.get<string>('SUPABASE_OWNER_EMAIL_INVITE')?.trim().toLowerCase() === 'true';
}
