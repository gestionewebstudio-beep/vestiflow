export interface TenantSummaryDto {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly ownerEmail: string | null;
  readonly ownerDisplayName: string | null;
  readonly vatNumber: string | null;
}
