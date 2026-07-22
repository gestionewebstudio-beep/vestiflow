import { Injectable, signal } from '@angular/core';

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
