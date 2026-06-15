import type { EntityId, TenantScoped, Timestamped } from './common.model';

/** Anagrafica fornitore (owner: gestionale). */
export interface Supplier extends TenantScoped, Timestamped {
  readonly id: EntityId;
  readonly name: string;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly notes?: string | null;
}

/** Payload creazione fornitore. */
export interface CreateSupplierInput {
  readonly name: string;
  readonly email?: string;
  readonly phone?: string;
  readonly notes?: string;
}
