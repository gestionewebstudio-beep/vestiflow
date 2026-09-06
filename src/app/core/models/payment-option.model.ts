import type { EntityId, IsoDateString } from './common.model';

/**
 * Voce pagamento gestibile (logica Danea): modalità ("Contanti",
 * "Bonifico bancario"…) e condizioni ("Vista fattura", "30 gg d.f."…)
 * sono due elenchi separati, preimpostati e ampliabili dalle Impostazioni.
 * Le anagrafiche salvano il NOME della voce (snapshot).
 */
export type PaymentOptionKind = 'method' | 'terms';

/**
 * Come un Tipo pagamento si incassa AL BANCO (`docs/25` §7).
 *
 * ⭐ È una classificazione **operativa**, non fiscale: dice se il Tipo si può
 * incassare alla Cassa e come si comporta la maschera — i contanti chiedono il
 * consegnato e calcolano il resto, l'elettronico no.
 *
 * ⛔ Non è la Modalità normativa FatturaPA (MP01–MP23), che è un catalogo
 * globale: MP01 e MP04 sono entrambi «contanti» per la normativa, ma solo uno
 * si incassa a un banco di negozio.
 */
export type PaymentTenderKind = 'cash' | 'electronic' | 'voucher';

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
  /**
   * ⭐ `null` è uno stato PIENO: «non utilizzabile nella Cassa», ed è quello di
   * quasi tutti i Tipi — bonifico, RIBA, MAV e ogni condizione.
   */
  readonly tenderKind: PaymentTenderKind | null;
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

/**
 * Le quattro scelte offerte al titolare, `null` compreso: «non utilizzabile in
 * Cassa» è una scelta, non l'assenza di una scelta.
 */
export const PAYMENT_TENDER_KIND_OPTIONS: readonly {
  readonly value: PaymentTenderKind | null;
  readonly label: string;
}[] = [
  { value: null, label: 'Non utilizzabile in Cassa' },
  { value: 'cash', label: 'Contanti' },
  { value: 'electronic', label: 'Elettronico' },
  { value: 'voucher', label: 'Buono/ticket' },
];

export function paymentTenderKindLabel(kind: PaymentTenderKind | null): string {
  return (
    PAYMENT_TENDER_KIND_OPTIONS.find((o) => o.value === kind)?.label ?? 'Non utilizzabile in Cassa'
  );
}

/**
 * ⚠️ `method` si mostra come «Tipi pagamento», non «Modalità di pagamento»:
 * dopo C2A i due livelli sono distinti — il Tipo è il preset aziendale, la
 * Modalità è il codice normativo del catalogo globale (`docs/25` §7). Il
 * valore interno resta `method` per compatibilità: a cambiare è la parola
 * che l'operatore legge, non l'enum.
 */
export function paymentOptionKindLabel(kind: PaymentOptionKind): string {
  return kind === 'method' ? 'Tipi pagamento' : 'Condizioni di pagamento';
}
