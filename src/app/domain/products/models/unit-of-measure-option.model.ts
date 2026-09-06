import type { EntityId } from '@core/models/common.model';

/**
 * Un'unità di misura **suggerita** al tenant (pz, conf, kg, m…).
 *
 * Suggerita, non imposta: righe documento e anagrafiche salvano la stringa e
 * nient'altro, quindi questo elenco non è un'autorità referenziale. Toglierne
 * una voce non tocca un solo dato salvato — smette solo di essere proposta.
 */
export interface UnitOfMeasureOption {
  readonly id: EntityId;
  readonly name: string;
  readonly sortOrder: number;
  readonly isSystem: boolean;
  readonly isActive: boolean;
  /**
   * Predefinita del tenant: precompila un ARTICOLO NUOVO, anche creato inline.
   *
   * ⛔ Non è il default della riga documento, che prende l’unità
   * DELL’ARTICOLO e la congela. Zero o una per tenant, e «nessuna» è uno
   * stato valido.
   */
  readonly isDefault: boolean;
}
