export interface TenantProfileDto {
  readonly legalName: string | null;
  readonly vatNumber: string | null;
  readonly fiscalCode: string | null;
  readonly phone: string | null;
  readonly pec: string | null;
  readonly sdiCode: string | null;
  readonly addressLine1: string | null;
  readonly addressLine2: string | null;
  readonly city: string | null;
  readonly province: string | null;
  readonly postalCode: string | null;
  readonly countryCode: string | null;
}

export interface TenantDetailDto {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly profile: TenantProfileDto;
  readonly owner: {
    readonly id: string;
    readonly email: string;
    readonly displayName: string;
  } | null;
  readonly store: {
    readonly id: string;
    readonly name: string;
  } | null;
  readonly location: {
    readonly id: string;
    readonly name: string;
    readonly addressLine1: string | null;
    readonly addressLine2: string | null;
    readonly city: string | null;
    readonly province: string | null;
    readonly postalCode: string | null;
    readonly countryCode: string | null;
  } | null;
}
