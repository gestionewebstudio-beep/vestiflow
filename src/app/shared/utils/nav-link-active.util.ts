import type { IsActiveMatchOptions, Router } from '@angular/router';

import type { NavItem } from '@shared/models/nav-item.model';

export const NAV_LINK_SUBSET_MATCH: IsActiveMatchOptions = {
  paths: 'subset',
  queryParams: 'ignored',
  matrixParams: 'ignored',
  fragment: 'ignored',
};

/** URL della voce comprensivo di query params (per il matching attivo). */
function navItemUrl(item: NavItem): string {
  const params = item.queryParams;
  if (!params || Object.keys(params).length === 0) {
    return item.route;
  }
  const query = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  return `${item.route}?${query}`;
}

/** Evidenzia la voce sidebar su tutte le pagine della stessa sezione. */
export function isNavItemActive(router: Router, item: NavItem): boolean {
  if (item.linkActiveOptions) {
    return router.isActive(navItemUrl(item), item.linkActiveOptions);
  }

  const prefix = item.activeRoutePrefix ?? item.route;
  if (!router.isActive(prefix, NAV_LINK_SUBSET_MATCH)) {
    return false;
  }

  const excludes = item.activeRouteExclude ?? [];
  return !excludes.some((exclude) => router.isActive(exclude, NAV_LINK_SUBSET_MATCH));
}
