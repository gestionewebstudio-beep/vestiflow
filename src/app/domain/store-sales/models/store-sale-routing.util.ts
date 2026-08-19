import { DocumentType } from '@core/models/document.model';

/**
 * Che cosa si sta compilando al banco: una vendita o un reso.
 *
 * ⚠️ Non è `DocumentType`: quello è il tipo del DOCUMENTO che nascerà, questo è
 * il modo della maschera. Coincidono uno a uno, e la mappa qui sotto è ciò che
 * tiene ferma la corrispondenza.
 */
export type StoreSaleMode = 'sale' | 'return';

/** I due tipi documento che la maschera del banco sa creare. */
export type StoreSaleDocumentType = typeof DocumentType.StoreSale | typeof DocumentType.StoreReturn;

/**
 * Segmento di indirizzo della maschera del banco, per modo. **Fonte unica**: da
 * qui nascono le due rotte di creazione e i percorsi che ci portano.
 *
 * ⚠️ **È un `Record` esaustivo, non un elenco** — come
 * `SALES_FORM_ROUTE_SEGMENT` per la famiglia Fattura, e per la stessa ragione:
 * aggiungere un modo senza dargli un indirizzo **non compila**. Un elenco
 * avrebbe lasciato passare il modo senza rotta, e il sintomo sarebbe arrivato
 * molto dopo — un pulsante che porta a una pagina che non esiste.
 *
 * ⛔ **Non si allarga `SALES_FORM_ROUTE_SEGMENT`**: quello indirizza la maschera
 * VENDITA (proforma, fatture, nota di credito), che è un altro componente. Due
 * famiglie con due maschere hanno due registri; fonderli significherebbe che
 * aggiungere un tipo a una obbliga a dargli un indirizzo nell'altra.
 */
export const STORE_SALE_ROUTE_SEGMENT: Readonly<Record<StoreSaleMode, string>> = {
  sale: 'nuova-vendita-al-banco',
  return: 'nuovo-reso-al-banco',
};

/**
 * Segmento di MODIFICA, per modo.
 *
 * ⚠️ **Distinto da quello di creazione, e non è un doppione**: «Nuova vendita al
 * banco» descrive un'azione, e `nuova-vendita-al-banco/:id/edit` direbbe «nuova»
 * di un documento che nuovo non è. Qui il segmento nomina il **tipo**, che è ciò
 * che serve a chi legge l'indirizzo di un documento esistente.
 *
 * ⛔ Il tipo resta nella ROTTA anche in modifica, e non si deduce dal documento
 * caricato: è la regola comune, nata da un difetto misurato — finché la rotta di
 * modifica era una sola e senza tipo, la maschera vendita si comportava da
 * proforma fino alla risposta della lettura (`07` §18).
 */
export const STORE_SALE_EDIT_SEGMENT: Readonly<Record<StoreSaleMode, string>> = {
  sale: 'vendita',
  return: 'reso',
};

/** La radice del modulo: elenco, dettaglio e le due creazioni stanno qui sotto. */
export const STORE_SALE_ROOT_PATH = '/app/vendita-al-banco';

/** Il documento che nasce da ciascun modo. */
export const STORE_SALE_MODE_DOCUMENT_TYPE: Readonly<Record<StoreSaleMode, StoreSaleDocumentType>> =
  {
    sale: DocumentType.StoreSale,
    return: DocumentType.StoreReturn,
  };

/** Percorso di creazione per modo, costruito dalla fonte unica. */
export function storeSaleCreatePath(mode: StoreSaleMode): string {
  return `${STORE_SALE_ROOT_PATH}/${STORE_SALE_ROUTE_SEGMENT[mode]}`;
}

/** Percorso di modifica di un documento del banco, per modo. */
export function storeSaleEditPath(mode: StoreSaleMode, id: string): string {
  return `${STORE_SALE_ROOT_PATH}/${STORE_SALE_EDIT_SEGMENT[mode]}/${id}/edit`;
}

/** Il modo che corrisponde a un tipo documento, o `null` se non è del banco. */
export function storeSaleModeOfDocumentType(type: string): StoreSaleMode | null {
  if (type === DocumentType.StoreSale) return 'sale';
  if (type === DocumentType.StoreReturn) return 'return';
  return null;
}

/** Chiave con cui la rotta dichiara il modo iniziale nei propri `data`. */
export const STORE_SALE_MODE_ROUTE_DATA_KEY = 'storeSaleMode';

function isStoreSaleMode(value: unknown): value is StoreSaleMode {
  return value === 'sale' || value === 'return';
}

/**
 * Il modo dichiarato dai `data` della rotta, o un errore se manca.
 *
 * ⛔ **Nessun fallback, ed è la decisione.** La maschera serve due tipi con
 * effetti di magazzino OPPOSTI — uno scarica, l'altro carica. Senza il modo
 * dovrebbe indovinarlo, e indovinando ricadrebbe su `sale`: aprire «Nuovo reso
 * al banco» e trovarsi a compilare una vendita che scarica la giacenza è un
 * difetto che nessuno noterebbe finché non guarda il magazzino.
 *
 * È la stessa scelta già fatta per `requireSalesDocumentType` nella famiglia
 * Fattura, dove l'assenza faceva ricadere su Proforma. Qui l'assenza smette di
 * essere un caso da gestire e diventa quello che è: una rotta scritta male, che
 * deve rompersi in modo visibile.
 */
export function requireStoreSaleMode(data: Record<string, unknown>): StoreSaleMode {
  const mode = data[STORE_SALE_MODE_ROUTE_DATA_KEY];
  if (isStoreSaleMode(mode)) {
    return mode;
  }
  throw new Error(
    `Rotta senza \`${STORE_SALE_MODE_ROUTE_DATA_KEY}\`: la maschera del banco non può dedurre ` +
      'se si sta creando una Vendita o un Reso. Aggiungilo ai `data` della rotta ' +
      '(vedi store-sales.routes.ts).',
  );
}
