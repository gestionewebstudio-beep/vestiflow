import type { EntityId, IsoDateString } from './common.model';

/**
 * Voce pagamento gestibile (logica Danea): modalità ("Contanti",
 * "Bonifico bancario"…) e condizioni ("Vista fattura", "30 gg d.f."…)
 * sono due elenchi separati, preimpostati e ampliabili dalle Impostazioni.
 * Le anagrafiche salvano il NOME della voce (snapshot).
 */
export type PaymentOptionKind = 'method' | 'terms';

export interface PaymentOption {
  readonly id: EntityId;
  readonly tenantId: EntityId;
  readonly kind: PaymentOptionKind;
  readonly name: string;
  readonly sortOrder: number;
  readonly isSystem: boolean;
  readonly isActive: boolean;
  readonly createdAt: IsoDateString;
  readonly updatedAt: IsoDateString;
}

export function paymentOptionKindLabel(kind: PaymentOptionKind): string {
  return kind === 'method' ? 'Modalità di pagamento' : 'Condizioni di pagamento';
}
