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
  /**
   * Modalità normativa FatturaPA associata, se il titolare l'ha scelta.
   *
   * ⚠️ `null` è uno stato normale, non un dato mancante: le condizioni non ne
   * hanno mai una, e un Tipo può restare scollegato — «Contrassegno» e
   * «PayPal» lo sono di proposito (`docs/25` §7).
   */
  readonly methodCodeId: EntityId | null;
  readonly createdAt: IsoDateString;
  readonly updatedAt: IsoDateString;
}

/**
 * Voce del catalogo normativo FatturaPA (MP01–MP23).
 *
 * ⛔ È **globale e di sola lettura**: non appartiene al tenant e non si crea
 * dalle Impostazioni. Il titolare sceglie quale associare ai propri Tipi, non
 * quali codici esistono.
 */
export interface PaymentMethodCode {
  readonly id: EntityId;
  readonly code: string;
  readonly label: string;
  readonly sortOrder: number;
  readonly isActive: boolean;
}

/** «MP05 — Bonifico», la forma con cui la Modalità si mostra in elenco. */
export function paymentMethodCodeLabel(code: PaymentMethodCode): string {
  return `${code.code} — ${code.label}`;
}

export function paymentOptionKindLabel(kind: PaymentOptionKind): string {
  return kind === 'method' ? 'Modalità di pagamento' : 'Condizioni di pagamento';
}
