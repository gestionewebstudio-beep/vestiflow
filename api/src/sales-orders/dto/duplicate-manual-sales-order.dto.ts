import { IsUUID } from 'class-validator';

/** Corpo di "Duplica ordine": cliente da assegnare al nuovo ordine manuale. */
export class DuplicateManualSalesOrderDto {
  @IsUUID()
  customerId!: string;
}
