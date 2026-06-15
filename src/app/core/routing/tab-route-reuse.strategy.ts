import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, DetachedRouteHandle, RouteReuseStrategy } from '@angular/router';

/**
 * Mantiene in memoria le pagine lista principali (Dashboard, Prodotti, …)
 * quando l'utente cambia tab nella sidebar: al ritorno i dati sono già lì,
 * senza refetch né skeleton.
 */
@Injectable()
export class TabRouteReuseStrategy implements RouteReuseStrategy {
  private readonly handles = new Map<string, DetachedRouteHandle>();

  shouldDetach(route: ActivatedRouteSnapshot): boolean {
    return this.reuseKey(route) !== null;
  }

  store(route: ActivatedRouteSnapshot, handle: DetachedRouteHandle): void {
    const key = this.reuseKey(route);
    if (key) {
      this.handles.set(key, handle);
    }
  }

  shouldAttach(route: ActivatedRouteSnapshot): boolean {
    const key = this.reuseKey(route);
    return key !== null && this.handles.has(key);
  }

  retrieve(route: ActivatedRouteSnapshot): DetachedRouteHandle | null {
    const key = this.reuseKey(route);
    return key ? (this.handles.get(key) ?? null) : null;
  }

  shouldReuseRoute(future: ActivatedRouteSnapshot, curr: ActivatedRouteSnapshot): boolean {
    return future.routeConfig === curr.routeConfig;
  }

  /**
   * Chiave solo per la route che porta direttamente `data.reuse === true`
   * (la route feature lazy). Detacharla cattura l'intero sottoalbero, quindi
   * NON si risale ai genitori: così parent e child non collidono sulla stessa
   * chiave (bug che corrompeva l'albero e bloccava la navigazione).
   */
  private reuseKey(route: ActivatedRouteSnapshot): string | null {
    const config = route.routeConfig;
    if (config?.data?.['reuse'] === true && config.path) {
      return config.path;
    }
    return null;
  }
}
