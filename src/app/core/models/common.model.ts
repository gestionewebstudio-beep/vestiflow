// Primitive e basi condivise dal dominio VestiFlow.
// Pensate per mappare 1:1 su un backend relazionale (NestJS/PostgreSQL).

/** Identificativo di entita' (UUID lato backend). */
export type EntityId = string;

/** Data/ora in formato ISO 8601 (es. '2026-06-05T08:30:00.000Z'). */
export type IsoDateString = string;

/** Codice valuta ISO 4217 (es. 'EUR'). */
export type CurrencyCode = string;

// Ponte di compatibilità: `Money` è ora un value object (unità minori intere)
// definito in money.model.ts. Lo re-export da qui mantiene validi tutti gli
// import esistenti `from '@core/models/common.model'` senza churn.
export type { Money } from './money.model';

/** Entita' appartenente a un tenant (multi-tenant obbligatorio). */
export interface TenantScoped {
  readonly tenantId: EntityId;
}

/** Entita' con tracciamento temporale di creazione/aggiornamento. */
export interface Timestamped {
  readonly createdAt: IsoDateString;
  readonly updatedAt: IsoDateString;
}

/** Indirizzo postale riutilizzabile (store, cliente). */
export interface Address {
  readonly line1: string;
  readonly line2?: string;
  readonly city: string;
  readonly province?: string;
  readonly postalCode: string;
  /** ISO 3166-1 alpha-2 (es. 'IT'). */
  readonly country: string;
}
