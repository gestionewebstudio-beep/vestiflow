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
}
