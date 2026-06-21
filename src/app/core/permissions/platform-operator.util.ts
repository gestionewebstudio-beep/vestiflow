import type { User } from '@core/models/user.model';

/** Home dell'area operatore piattaforma (provisioning clienti). */
export const PLATFORM_OPERATOR_HOME = '/app/admin/clients';

const TENANT_WORKSPACE_PREFIXES = [
  '/app/dashboard',
  '/app/products',
  '/app/inventory',
  '/app/orders',
  '/app/sales',
  '/app/customers',
  '/app/reports',
  '/app/guide',
  '/app/settings',
] as const;

export function isPlatformOperator(user: User | null | undefined): boolean {
  return user?.isPlatformAdmin === true;
}

/** Route riservate al gestionale negozio (non all'operatore piattaforma). */
export function isTenantWorkspaceUrl(url: string): boolean {
  return TENANT_WORKSPACE_PREFIXES.some((prefix) => url === prefix || url.startsWith(`${prefix}/`));
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
