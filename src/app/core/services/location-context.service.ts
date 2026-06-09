import { DOCUMENT, Injectable, inject, signal } from '@angular/core';

import type { EntityId } from '@core/models/common.model';

const STORAGE_KEY = 'vestiflow-active-location';

/**
 * Contesto globale "location attiva" (topbar). `null` = tutte le location.
 * Le pagine che mostrano stock lo usano come filtro di default; un filtro
 * esplicito di pagina (query param) ha la precedenza. Persistito in
 * localStorage: e' una preferenza UI, non un dato di sicurezza.
 */
@Injectable({ providedIn: 'root' })
export class LocationContextService {
  private readonly document = inject(DOCUMENT);

  private readonly _activeLocationId = signal<EntityId | null>(this.readStored());
  /** Location attiva corrente; `null` = tutte. */
  readonly activeLocationId = this._activeLocationId.asReadonly();

  setActiveLocation(locationId: EntityId | null): void {
    this._activeLocationId.set(locationId);
    this.persist(locationId);
  }

  private readStored(): EntityId | null {
    try {
      return this.document.defaultView?.localStorage.getItem(STORAGE_KEY) || null;
    } catch {
      // localStorage non disponibile (private mode / blocco cookie): nessuna preferenza.
      return null;
    }
  }

  private persist(locationId: EntityId | null): void {
    try {
      const storage = this.document.defaultView?.localStorage;
      if (!storage) {
        return;
      }
      if (locationId) {
        storage.setItem(STORAGE_KEY, locationId);
      } else {
        storage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Fallback silenzioso: la selezione vale per la sessione corrente.
    }
  }
}
