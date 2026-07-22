import { IsOptional, IsUUID } from 'class-validator';

/**
 * Corpo di POST :id/duplicate. Per gli Arrivi merce il duplicato può cambiare
 * fornitore (modale «scelta fornitore»): con `supplierId` la testata del nuovo
 * documento si riallinea al fornitore scelto; assente = stesso fornitore.
 */
export class DuplicateDocumentDto {
  @IsOptional()
  @IsUUID()
  supplierId?: string;
}
