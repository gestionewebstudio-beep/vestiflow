import { describe, expect, it } from 'vitest';

import { DocumentType } from '@core/models/document.model';

import {
  STORE_SALE_MODE_DOCUMENT_TYPE,
  STORE_SALE_MODE_ROUTE_DATA_KEY,
  STORE_SALE_ROOT_PATH,
  STORE_SALE_ROUTE_SEGMENT,
  requireStoreSaleMode,
  storeSaleCreatePath,
  type StoreSaleMode,
} from './store-sale-routing.util';

describe('gli indirizzi del banco nascono da una fonte sola', () => {
  it('i due segmenti sono quelli decisi', () => {
    expect(STORE_SALE_ROUTE_SEGMENT.sale).toBe('nuova-vendita-al-banco');
    expect(STORE_SALE_ROUTE_SEGMENT.return).toBe('nuovo-reso-al-banco');
  });

  it('i percorsi di creazione si compongono dalla radice', () => {
    expect(storeSaleCreatePath('sale')).toBe('/app/vendita-al-banco/nuova-vendita-al-banco');
    expect(storeSaleCreatePath('return')).toBe('/app/vendita-al-banco/nuovo-reso-al-banco');
  });

  it('ogni modo ha il suo tipo documento, e sono opposti in magazzino', () => {
    expect(STORE_SALE_MODE_DOCUMENT_TYPE.sale).toBe(DocumentType.StoreSale);
    expect(STORE_SALE_MODE_DOCUMENT_TYPE.return).toBe(DocumentType.StoreReturn);
  });

  it('⛔ nessun segmento è vuoto o duplicato: due rotte uguali ne annullerebbero una', () => {
    const segmenti = Object.values(STORE_SALE_ROUTE_SEGMENT);
    expect(segmenti.every((s) => s.length > 0)).toBe(true);
    expect(new Set(segmenti).size).toBe(segmenti.length);
  });

  it('la radice non finisce con una barra: i percorsi la aggiungono', () => {
    expect(STORE_SALE_ROOT_PATH.endsWith('/')).toBe(false);
    expect(storeSaleCreatePath('sale').startsWith(`${STORE_SALE_ROOT_PATH}/`)).toBe(true);
  });
});

describe('il modo arriva dalla rotta, e senza rotta non arriva affatto', () => {
  it('legge il modo dichiarato nei data', () => {
    expect(requireStoreSaleMode({ [STORE_SALE_MODE_ROUTE_DATA_KEY]: 'sale' })).toBe('sale');
    expect(requireStoreSaleMode({ [STORE_SALE_MODE_ROUTE_DATA_KEY]: 'return' })).toBe('return');
  });

  /**
   * ⛔ È il cuore del contratto: nessun fallback.
   *
   * La maschera serve due tipi con effetti di magazzino OPPOSTI. Ricadendo su
   * `sale`, aprire «Nuovo reso al banco» compilerebbe una vendita che SCARICA
   * la giacenza invece di caricarla — e nessuno se ne accorgerebbe finché non
   * guarda il magazzino.
   */
  it('⛔ senza il dato la rotta è scritta male: lancia, non indovina', () => {
    expect(() => requireStoreSaleMode({})).toThrowError(/non può dedurre/i);
  });

  it('⛔ un valore non riconosciuto lancia: non degrada in silenzio', () => {
    for (const sbagliato of ['vendita', 'reso', 'Sale', '', null, undefined, 0, {}]) {
      expect(() => requireStoreSaleMode({ [STORE_SALE_MODE_ROUTE_DATA_KEY]: sbagliato })).toThrow();
    }
  });

  it('il messaggio dice DOVE si ripara, non solo che manca', () => {
    expect(() => requireStoreSaleMode({})).toThrowError(/store-sales\.routes\.ts/);
  });

  it('i data di un’altra rotta non lo soddisfano per caso', () => {
    // Chiave della famiglia Fattura: è un altro registro e un'altra maschera.
    expect(() => requireStoreSaleMode({ salesDocumentType: 'store_sale' })).toThrow();
  });
});

describe('il registro è esaustivo per costruzione', () => {
  it('ogni modo ha un segmento e un tipo, senza buchi', () => {
    const modi: readonly StoreSaleMode[] = ['sale', 'return'];
    for (const modo of modi) {
      expect(STORE_SALE_ROUTE_SEGMENT[modo]).toBeTruthy();
      expect(STORE_SALE_MODE_DOCUMENT_TYPE[modo]).toBeTruthy();
    }
    // Se un giorno si aggiungesse un terzo modo, il `Record` non compilerebbe
    // finché non gli si dà un indirizzo: è la rete, e sta nei tipi.
    expect(Object.keys(STORE_SALE_ROUTE_SEGMENT).sort()).toEqual(['return', 'sale']);
  });
});
