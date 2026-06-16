export interface ProvisionedTenantDto {
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
