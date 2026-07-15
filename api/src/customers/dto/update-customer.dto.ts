import { CreateCustomerDto } from './create-customer.dto';

/**
 * Aggiornamento cliente: stessi campi della creazione (già tutti opzionali,
 * la denominazione minima è verificata nel service sul valore risultante).
 * `alsoSupplier: false` disattiva il ruolo fornitore del soggetto senza
 * eliminare dati, documenti o collegamenti storici.
 */
export class UpdateCustomerDto extends CreateCustomerDto {}
