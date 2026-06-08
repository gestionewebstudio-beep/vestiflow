import type { CanDeactivateFn } from '@angular/router';

/** Contratto per i componenti che proteggono l'uscita con modifiche non salvate. */
export interface CanComponentDeactivate {
  canDeactivate(): boolean;
}

/**
 * Guard generico riusabile: delega la decisione al componente, che può
 * consentire l'uscita o chiedere conferma all'utente. UX, non sicurezza.
 */
export const unsavedChangesGuard: CanDeactivateFn<CanComponentDeactivate> = (component) =>
  component.canDeactivate();
