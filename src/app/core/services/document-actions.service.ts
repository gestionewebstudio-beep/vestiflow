import { Injectable, signal } from '@angular/core';

/** Azioni del documento aperto, esposte alla topbar. */
export interface DocumentTopbarActions {
  readonly saveLabel: string;
  readonly saving: boolean;
  readonly canSave: boolean;
  readonly save: () => void;
  readonly cancel: () => void;
}

/**
 * Ponte tra un form documento e la topbar della shell: su mobile «Annulla» e
 * «Salva» vivono in alto (pattern admin mobile) invece che in una barra fissa in
 * basso. Il form registra le proprie azioni all'apertura e le rilascia alla
 * chiusura; la topbar mostra i pulsanti solo quando qualcuno le ha registrate.
 */
@Injectable({ providedIn: 'root' })
export class DocumentActionsService {
  private readonly _actions = signal<DocumentTopbarActions | null>(null);

  /** Sola lettura per la topbar (reattivo). */
  readonly actions = this._actions.asReadonly();

  set(actions: DocumentTopbarActions): void {
    this._actions.set(actions);
  }

  clear(): void {
    this._actions.set(null);
  }
}
