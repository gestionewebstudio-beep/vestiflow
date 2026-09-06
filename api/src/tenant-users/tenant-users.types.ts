import type { UserProfileDto } from '../auth/dto/user-profile.dto';

/**
 * Chi sta agendo su un account utente tenant, snapshot per l'audit: vale sia
 * per il titolare (Impostazioni → Utenti) sia per l'admin piattaforma (pannello
 * clienti, anche in sessione assistenza).
 */
export interface TenantUserActionActor {
  readonly userId: string | null;
  readonly email: string;
  readonly name: string;
  readonly isPlatformAdmin: boolean;
}

export function actorFromProfile(user: UserProfileDto): TenantUserActionActor {
  return {
    userId: user.id,
    email: user.email,
    name: user.displayName,
    isPlatformAdmin: user.isPlatformAdmin,
  };
}
