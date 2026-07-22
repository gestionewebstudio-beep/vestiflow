import { IsOptional, IsUUID } from 'class-validator';

/**
 * Corpo di POST :id/duplicate. Il duplicato può cambiare controparte
 * (modale «scelta soggetto»): con `supplierId` la testata del nuovo documento
 * si riallinea al fornitore scelto (Arrivi merce), con `customerId` al cliente
 * scelto (documenti di vendita, es. Preventivi); assenti = stessa controparte.
 */
export class DuplicateDocumentDto {
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;
}
