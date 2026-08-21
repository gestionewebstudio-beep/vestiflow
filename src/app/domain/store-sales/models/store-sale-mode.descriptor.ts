import {
  STORE_SALE_MODE_DOCUMENT_TYPE,
  type StoreSaleDocumentType,
  type StoreSaleMode,
} from './store-sale-routing.util';

/**
 * Ciò che è UGUALE fra Vendita e Reso al banco resta fuori da qui.
 *
 * Il descrittore porta solo le differenze, e le porta **dichiarate in un posto
 * solo**: la maschera è una — un modello di riga, una collezione, un percorso
 * di salvataggio — e quello che cambia fra i due modi è un dato, non una
 * ramificazione sparsa nel componente.
 *
 * ⛔ **È un'unione discriminata su `mode`, non un sacco di booleani.** Con
 * l'unione, chi restringe su `mode === 'sale'` ottiene dal compilatore ciò che
 * quel modo espone; con i booleani sciolti nessuno impedisce la combinazione
 * che non esiste (un reso con il cliente, una vendita con la causale).
 */
interface StoreSaleModeDescriptorBase {
  /** Il documento che nasce da questo modo. */
  readonly documentType: StoreSaleDocumentType;
  /** Titolo della pagina in creazione, uguale a quello dichiarato dalla rotta. */
  readonly createTitle: string;
  /** Titolo della pagina in modifica di un documento esistente. */
  readonly editTitle: string;
  /**
   * La riga sotto il titolo: dice che cosa succede alla conclusione.
   *
   * ⚠️ Non è decorazione. Titolo e sottotestata erano FISSI sulla vendita, e
   * aprire «Nuovo reso al banco» mostrava una frase che dichiarava lo SCARICO
   * della giacenza — il contrario di quello che un reso fa (`11` C, UI 2).
   */
  readonly subtitle: string;
  /** Medaglione del pannello di testata su mobile. */
  readonly icon: string;
}

/**
 * Vendita al banco: scarico fisico, vendita economica positiva, pagamento.
 *
 * ⛔ **Il Cliente non sta qui**, e non è una dimenticanza: `11` A13 lo mette
 * nella testata come facoltativo **senza distinguere i due modi**, quindi non è
 * una differenza fra Vendita e Reso. Il contratto del Reso non lo accettava —
 * era un gap tecnico, corretto nello stesso passaggio, non una regola.
 */
export interface StoreSaleSaleDescriptor extends StoreSaleModeDescriptorBase {
  readonly mode: 'sale';
}

/** Reso al banco: rientro secondo la spunta di riga, rettifica negativa. */
export interface StoreSaleReturnDescriptor extends StoreSaleModeDescriptorBase {
  readonly mode: 'return';
}

export type StoreSaleModeDescriptor = StoreSaleSaleDescriptor | StoreSaleReturnDescriptor;

/**
 * ⚠️ Il tipo mappato tiene insieme due cose che una sola non terrebbe:
 * l'esaustività (un modo nuovo senza descrittore **non compila**) e la
 * precisione (la voce `sale` è il descrittore della vendita, non l'unione —
 * quindi ogni voce è già il descrittore del suo modo, senza restringere).
 */
type StoreSaleModeDescriptorMap = {
  readonly [M in StoreSaleMode]: Extract<StoreSaleModeDescriptor, { mode: M }>;
};

export const STORE_SALE_MODE_DESCRIPTOR: StoreSaleModeDescriptorMap = {
  sale: {
    mode: 'sale',
    documentType: STORE_SALE_MODE_DOCUMENT_TYPE.sale,
    createTitle: 'Nuova vendita al banco',
    editTitle: 'Modifica vendita al banco',
    subtitle:
      'Alla conclusione la giacenza e la disponibilità vengono scaricate; l’impegnata resta invariata. Non è un documento fiscale.',
    icon: 'pi-shopping-bag',
  },
  return: {
    mode: 'return',
    documentType: STORE_SALE_MODE_DOCUMENT_TYPE.return,
    createTitle: 'Nuovo reso al banco',
    editTitle: 'Modifica reso al banco',
    subtitle:
      'Alla conclusione la merce resa rientra in giacenza, riga per riga secondo la spunta «Carica giacenze». Non è un documento fiscale.',
    icon: 'pi-replay',
  },
};

/** Il descrittore del modo, che la maschera legge dalla rotta. */
export function storeSaleModeDescriptor(mode: StoreSaleMode): StoreSaleModeDescriptor {
  return STORE_SALE_MODE_DESCRIPTOR[mode];
}
