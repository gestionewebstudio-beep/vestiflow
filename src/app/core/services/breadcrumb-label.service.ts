import { DestroyRef, effect, inject, Injectable, signal } from '@angular/core';

/**
 * Etichette dinamiche per le tappe id del breadcrumb: una pagina di dettaglio
 * registra il "numero" leggibile dell'entità aperta (es. ordine cliente o
 * arrivo merce), così il breadcrumb mostra quello invece del generico
 * «Dettaglio». Chiave = id (uuid) presente nell'URL.
 */
@Injectable({ providedIn: 'root' })
export class BreadcrumbLabelService {
  private readonly labelsById = signal<ReadonlyMap<string, string>>(new Map());

  /** Sola lettura per il breadcrumb (reattivo). */
  readonly labels = this.labelsById.asReadonly();

  set(entityId: string, label: string): void {
    const trimmed = label.trim();
    if (!entityId || !trimmed) {
      return;
    }
    this.labelsById.update((current) => {
      if (current.get(entityId) === trimmed) {
        return current;
      }
      const next = new Map(current);
      next.set(entityId, trimmed);
      return next;
    });
  }

  clear(entityId: string): void {
    this.labelsById.update((current) => {
      if (!current.has(entityId)) {
        return current;
      }
      const next = new Map(current);
      next.delete(entityId);
      return next;
    });
  }
}

/**
 * Registra il numero leggibile del documento aperto come etichetta della tappa
 * id nel breadcrumb (al posto del generico «Dettaglio»), con pulizia automatica
 * al cambio entità e alla distruzione del componente. Da chiamare nel
 * costruttore (contesto di iniezione). `source` restituisce l'id presente
 * nell'URL e la relativa etichetta (es. «CAR-2026-0008»); finché l'etichetta è
 * nulla non registra nulla (il breadcrumb resta sul fallback).
 */
export function bindBreadcrumbEntityLabel(
  source: () => { readonly id: string | null; readonly label: string | null },
): void {
  const service = inject(BreadcrumbLabelService);
  const destroyRef = inject(DestroyRef);
  const registered: { id: string | null } = { id: null };
  effect(() => {
    const { id, label } = source();
    if (registered.id && registered.id !== id) {
      service.clear(registered.id);
      registered.id = null;
    }
    if (id && label?.trim()) {
      service.set(id, label);
      registered.id = id;
    }
  });
  destroyRef.onDestroy(() => {
    if (registered.id) {
      service.clear(registered.id);
    }
  });
}
