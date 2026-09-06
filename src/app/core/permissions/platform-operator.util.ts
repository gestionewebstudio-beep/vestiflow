import type { User } from '@core/models/user.model';

/** Home dell'area operatore piattaforma (provisioning clienti). */
export const PLATFORM_OPERATOR_HOME = '/app/admin/clients';

export function isPlatformOperator(user: User | null | undefined): boolean {
  if (!user?.isPlatformAdmin) {
    return false;
  }
  return !hasActiveSupportSession(user);
}

/** Operatore piattaforma con sessione assistenza attiva nel gestionale cliente. */
export function hasActiveSupportSession(user: User | null | undefined): boolean {
  return Boolean(user?.supportSession);
}

export function resolvePlatformOperatorReturnUrl(
  user: User | null | undefined,
  returnUrl: string | null | undefined,
): string {
  if (!isPlatformOperator(user)) {
    return returnUrl?.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : '/app/dashboard';
  }

  if (
    returnUrl &&
    returnUrl.startsWith('/') &&
    !returnUrl.startsWith('//') &&
    returnUrl.startsWith('/app/admin')
  ) {
    return returnUrl;
  }

  return PLATFORM_OPERATOR_HOME;
}
