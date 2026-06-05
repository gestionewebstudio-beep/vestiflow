import type { EntityId, Timestamped } from './common.model';

/** Tenant = cliente/azienda che usa VestiFlow (multi-tenant). */
export interface Tenant extends Timestamped {
  readonly id: EntityId;
  readonly name: string;
  /** Slug univoco (es. usato in URL/identificazione). */
  readonly slug: string;
  readonly plan?: string;
}
