import type { Address, EntityId, IsoDateString } from '@core/models/common.model';
import type { Customer } from '@core/models/customer.model';

/** Riga API NestJS (indirizzo flat, allineato a Prisma). */
export interface CustomerApiRow {
  readonly id: EntityId;
  readonly tenantId: EntityId;
  readonly firstName: string;
  readonly lastName: string;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly notes?: string | null;
  readonly addressLine1?: string | null;
  readonly addressLine2?: string | null;
  readonly city?: string | null;
  readonly province?: string | null;
  readonly postalCode?: string | null;
  readonly countryCode?: string | null;
  readonly shopifyCustomerId?: string | null;
  readonly createdAt: IsoDateString;
  readonly updatedAt: IsoDateString;
}

function mapAddress(row: CustomerApiRow): Address | undefined {
  if (!row.addressLine1 && !row.city && !row.postalCode) {
    return undefined;
  }
  return {
    line1: row.addressLine1 ?? '',
    line2: row.addressLine2 ?? undefined,
    city: row.city ?? '',
    province: row.province ?? undefined,
    postalCode: row.postalCode ?? '',
    country: row.countryCode ?? 'IT',
  };
}

export function mapCustomerApiRow(row: CustomerApiRow): Customer {
  return {
    tenantId: row.tenantId,
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    notes: row.notes ?? undefined,
    address: mapAddress(row),
    shopifyCustomerId: row.shopifyCustomerId ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
