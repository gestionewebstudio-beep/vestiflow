import { inject, Injectable, Injector } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  DetachedRouteHandle,
  RouteReuseStrategy,
  Router,
} from '@angular/router';

import type { ComponentRef } from '@angular/core';

/** Pagine conservate al massimo: oltre, si distrugge la più vecchia. */
const MAX_HANDLES = 12;

/**
 * Mantiene in memoria le pagine lista marcate `data: { reuse: true }` quando
 * l'utente cambia tab nella sidebar: al ritorno i dati sono già lì, senza
 * refetch né skeleton.
 *
 * Regole del meccanismo:
 * - il flag vive sulle rotte FOGLIA con component (le pagine lista): il router
 *   interpella la strategy solo per le rotte con component, quindi su una rotta
 *   `loadChildren` componentless non verrebbe mai letto;
 * - si conserva solo al CAMBIO TAB (primi due segmenti URL diversi): dentro lo
 *   stesso tab, lista → dettaglio → lista ricarica fresco, così un ritorno
 *   dopo una modifica non mostra dati vecchi;
 * - qualunque scrittura HTTP non-GET svuota la cache (vedi
 *   `reuseInvalidationInterceptor`): la copia conservata è affidabile solo
 *   finché si sta soltanto consultando;
 * - uscire dalla shell `/app` (logout) svuota e distrugge tutto: nessuna
 *   pagina di un tenant sopravvive alla sessione.
 */
@Injectable()
export class TabRouteReuseStrategy implements RouteReuseStrategy {
  // Router via Injector, non con inject() diretto: il Router costruisce la
  // strategy, un'iniezione eager creerebbe un ciclo DI.
  private readonly injector = inject(Injector);
  private readonly handles = new Map<string, DetachedRouteHandle>();

  shouldDetach(route: ActivatedRouteSnapshot): boolean {
    const key = this.reuseKey(route);
    if (key === null) {
      return false;
    }
    const target = this.targetSegments();
    if (target === null) {
      return false;
    }
    if (target[0] !== 'app') {
      this.invalidate();
      return false;
    }
    const [keyRoot, keyTab] = key.split('/');
    return !(target[0] === keyRoot && target[1] === keyTab);
  }

  store(route: ActivatedRouteSnapshot, handle: DetachedRouteHandle | null): void {
    const key = this.reuseKey(route);
    if (key === null) {
      return;
    }
    const previous = this.handles.get(key);
    this.handles.delete(key);
    if (handle === null) {
      // Contratto del router: store(null) dopo il riattacco azzera lo slot.
      return;
    }
    if (previous && previous !== handle) {
      this.destroyHandle(previous);
    }
    this.handles.set(key, handle);
    if (this.handles.size > MAX_HANDLES) {
      const oldestKey = this.handles.keys().next().value;
      if (oldestKey !== undefined) {
        const evicted = this.handles.get(oldestKey);
        this.handles.delete(oldestKey);
        if (evicted) {
          this.destroyHandle(evicted);
        }
      }
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

  /** Svuota la cache distruggendo i sottoalberi conservati. */
  invalidate(): void {
    for (const handle of this.handles.values()) {
      this.destroyHandle(handle);
    }
    this.handles.clear();
  }

  /** URL completa della pagina flaggata, es. `app/products`. */
  private reuseKey(route: ActivatedRouteSnapshot): string | null {
    if (route.routeConfig?.data?.['reuse'] !== true) {
      return null;
    }
    return route.pathFromRoot.flatMap((snapshot) => snapshot.url.map((u) => u.path)).join('/');
  }

  /** Segmenti della destinazione della navigazione in corso (post-redirect). */
  private targetSegments(): string[] | null {
    const navigation = this.injector.get(Router).getCurrentNavigation();
    const tree = navigation?.finalUrl ?? navigation?.extractedUrl;
    if (!tree) {
      return null;
    }
    return tree.root.children['primary']?.segments.map((segment) => segment.path) ?? [];
  }

  // Un handle detachato non è nell'albero: la distruzione del componente va
  // fatta a mano, altrimenti il sottoalbero resta vivo in memoria per sempre.
  private destroyHandle(handle: DetachedRouteHandle): void {
    (handle as { componentRef?: ComponentRef<unknown> }).componentRef?.destroy();
  }
}
