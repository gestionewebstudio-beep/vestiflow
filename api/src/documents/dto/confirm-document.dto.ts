import { IsBoolean, IsOptional } from 'class-validator';

export class ConfirmDocumentDto {
  /** Se true, aggiorna i prezzi fornitore quando la policy tenant è `ask`. */
  @IsOptional()
  @IsBoolean()
  applySupplierPriceUpdates?: boolean;

  /** Se true, chiude l'ordine fornitore collegato anche con quantità residue. */
  @IsOptional()
  @IsBoolean()
  closeLinkedSupplierOrder?: boolean;
}
