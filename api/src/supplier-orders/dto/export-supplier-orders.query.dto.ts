import { Transform } from 'class-transformer';
import { IsOptional, IsUUID } from 'class-validator';

import { ListSupplierOrdersQueryDto } from './list-supplier-orders.query.dto';

/**
 * Query dell'export elenco Ordini fornitore.
 *
 * ⛔ **Estende quella dell'elenco, e non è un dettaglio**: l'export deve
 * ricevere gli stessi filtri della vista, o l'operatore che esporta «il
 * risultato filtrato» (`14` §5.3) riceve righe diverse da quelle che sta
 * guardando — e se ne accorge solo aprendo il file.
 *
 * ⚠️ La paginazione ereditata **non si applica**: l'export non ha pagine. Resta
 * nel tipo perché la classe base la porta, e ignorarla è la scelta giusta —
 * esportare solo la pagina corrente sarebbe il difetto, non la funzione.
 */
export class ExportSupplierOrdersQueryDto extends ListSupplierOrdersQueryDto {
  /**
   * Gli ordini selezionati. Assente = tutto il risultato filtrato.
   *
   * ⛔ **Non scavalcano i filtri di sicurezza**: il servizio li combina in AND
   * con tenant e sedi leggibili. Arrivano dal client, e un client può mandare
   * id di qualunque tenant.
   */
  @IsOptional()
  @Transform(({ value }) => {
    if (value == null || value === '') {
      return undefined;
    }
    const raw = Array.isArray(value) ? value : String(value).split(',');
    return raw.map((entry) => String(entry).trim()).filter(Boolean);
  })
  @IsUUID('4', { each: true })
  ids?: string[];
}
