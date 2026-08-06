import { IsUUID } from 'class-validator';

/** Drill-down Impegnata: impegni attivi di una variante × location (§10 fase 1). */
export class ListReservationsQueryDto {
  @IsUUID()
  variantId!: string;

  @IsUUID()
  locationId!: string;
}
