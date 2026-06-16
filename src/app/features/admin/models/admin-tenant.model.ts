export interface CreateTenantPayload {
  readonly tenantName: string;
  readonly ownerDisplayName: string;
  readonly ownerEmail: string;
  readonly ownerPassword: string;
  readonly storeName?: string;
  readonly locationName?: string;
}

export interface ProvisionedTenant {
  readonly tenantId: string;
  readonly tenantName: string;
  readonly ownerUserId: string;
  readonly ownerEmail: string;
  readonly ownerDisplayName: string;
  readonly storeId: string;
  readonly storeName: string;
  readonly locationId: string;
  readonly locationName: string;
}

export interface TenantSummary {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly ownerEmail: string | null;
  readonly ownerDisplayName: string | null;
}
