import type { IsActiveMatchOptions, Router } from '@angular/router';

import type { NavItem } from '@shared/models/nav-item.model';

export const NAV_LINK_SUBSET_MATCH: IsActiveMatchOptions = {
  paths: 'subset',
  queryParams: 'ignored',
  matrixParams: 'ignored',
  fragment: 'ignored',
};

/** Evidenzia la voce sidebar su tutte le pagine della stessa sezione. */
export function isNavItemActive(router: Router, item: NavItem): boolean {
  if (item.linkActiveOptions) {
    return router.isActive(item.route, item.linkActiveOptions);
  }

  const prefix = item.activeRoutePrefix ?? item.route;
  if (!router.isActive(prefix, NAV_LINK_SUBSET_MATCH)) {
    return false;
  }

  const excludes = item.activeRouteExclude ?? [];
  return !excludes.some((exclude) => router.isActive(exclude, NAV_LINK_SUBSET_MATCH));
}
