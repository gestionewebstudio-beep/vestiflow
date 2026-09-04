import { DocumentType } from '@core/models/document.model';
import { SalesOrderSource } from '@core/models/sales-order.model';
import type { SalesOrderSource as SalesOrderSourceValue } from '@core/models/sales-order.model';
import type { User } from '@core/models/user.model';
import { documentRowPath } from '@domain/documents/utils/document-routing.util';

/**
 * Dove porta la riga di un Ordine cliente.
 *
 * ```text
 * manual        → /app/sales/:id/edit    la Modifica del gestionale
 * online · pos  → /app/sales/:id         consultazione in sola lettura
 * ```
 *
 * ⛔ **Un `SalesOrder` non è sempre un `DocumentType.CustomerOrder`**, ed è la
 * ragione per cui questa funzione esiste. Le origini sono tre e solo `manual` è
 * l'Ordine cliente del gestionale: `online` e `pos` sono **posseduti dal
 * canale**, che `regole-gestionale` dichiara «sempre read-only nel gestionale».
 * La destinazione dipende quindi dall'ORIGINE, non dal tipo e non dallo stato.
 *
 * ⚠️ **`/app/sales/online/:id` NON è la risposta**, ed è l'errore vicino: quel
 * percorso appartiene alla **Vendita online** (entità `OnlineSale`, documento
 * interno generato dall'evasione), che è un'altra cosa da un Ordine di canale.
 */
export function salesOrderRowPath(
  order: { readonly id: string; readonly source: SalesOrderSourceValue },
  user: User | null | undefined,
): string {
  if (order.source !== SalesOrderSource.Manual) {
    // Ordine di canale: la sua sola vista è la maschera in lettura, montata su
    // `:id` — lo stesso componente di `:id/edit`, ma senza promettere modifica.
    return `/app/sales/${order.id}`;
  }
  return documentRowPath({ id: order.id, type: DocumentType.CustomerOrder }, user);
}
