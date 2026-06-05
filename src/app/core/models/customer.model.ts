import type { Address, EntityId, TenantScoped, Timestamped } from './common.model';

/** Cliente del tenant (anagrafica; storico acquisti arrivera' con ecommerce/POS). */
export interface Customer extends TenantScoped, Timestamped {
  readonly id: EntityId;
  readonly firstName: string;
  readonly lastName: string;
  readonly email?: string;
  readonly phone?: string;
  readonly address?: Address;
  readonly notes?: string;
}
