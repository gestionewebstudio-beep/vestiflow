import type { Address, CurrencyCode, EntityId, TenantScoped, Timestamped } from './common.model';
import type { ShopifyLink } from './shopify.model';

/** Negozio/punto vendita di un tenant (multi-store). */
export interface Store extends TenantScoped, Timestamped {
  readonly id: EntityId;
  readonly name: string;
  /** Codice breve identificativo (es. 'NA-01'). */
  readonly code?: string;
  readonly currency: CurrencyCode;
  readonly address?: Address;
  readonly isActive: boolean;
  readonly shopify?: ShopifyLink;
}
