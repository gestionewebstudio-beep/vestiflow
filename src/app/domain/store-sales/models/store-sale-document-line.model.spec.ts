import { describe, expect, it } from 'vitest';

import type { DocumentLine } from '@core/models/document.model';
import { DEFAULT_CURRENCY } from '@core/utils/money.util';

import {
  newStoreSaleLineUiId,
  storeReturnLinePayload,
  storeSaleLineFromDocumentLine,
  storeSaleLinePayload,
  type StoreSaleDocumentLine,
} from './store-sale-document-line.model';

const RIGA_DOCUMENTO: DocumentLine = {
  id: 'line-1',
  lineNumber: 1,
  variantId: 'var-1',
  sku: 'MAG-001',
  description: 'Maglietta Basic — M / Bianco',
  quantity: 2,
  // Coda decimale: è quella che fa tornare identico un prezzo digitato ivato.
  unitPrice: { amountMinor: 2049.180328, currencyCode: DEFAULT_CURRENCY },
  discountPercent: 10,
  vatCodeId: 'vat-22',
  // Lo snapshot è il fatto fiscale del documento: si scrive per intero, così il
  // test non passa su una forma più povera di quella vera.
  vatSnapshot: {
    code: '22',
    natureKey: 'imponibile',
    natureLabel: 'Imponibile',
    officialCode: null,
    ratePercent: 22,
    description: 'Imponibile 22%',
    nonDeductiblePercent: 0,
    calculationMode: 'standard',
    vatAffectsSupplierTotal: true,
  },
  lineTotal: { amountMinor: 3688, currencyCode: DEFAULT_CURRENCY },
  loadsStock: true,
};

/** Riga NUOVA: nessun id sul server, nessun valore persistito da conservare. */
function rigaNuova(patch: Partial<StoreSaleDocumentLine> = {}): StoreSaleDocumentLine {
  return {
    uiId: newStoreSaleLineUiId(),
    serverLineId: null,
    variantId: 'var-9',
    sku: 'NEW-001',
    description: 'Articolo nuovo',
    persistedDescription: null,
    quantity: 1,
    unitPriceMinor: 1000,
    discountPercent: 0,
    vatCodeId: 'vat-22',
    persistedVatCodeId: null,
    vatRatePercent: null,
    loadsStock: true,
    onHand: 0,
    committed: 0,
    available: 0,
    ...patch,
  };
}

describe('storeSaleLineFromDocumentLine', () => {
  it('conserva l’id del server, e non lo confonde con quello di maschera', () => {
    const line = storeSaleLineFromDocumentLine(RIGA_DOCUMENTO);

    expect(line.serverLineId).toBe('line-1');
    expect(line.uiId).toBe('line-1');
    // Sono due nozioni diverse anche quando partono dallo stesso valore: il
    // payload legge solo la prima.
    expect(storeSaleLinePayload(line).id).toBe('line-1');
  });

  it('prende i valori dal DOCUMENTO, coda decimale del prezzo compresa', () => {
    const line = storeSaleLineFromDocumentLine(RIGA_DOCUMENTO);

    expect(line.unitPriceMinor).toBe(2049.180328);
    expect(line.description).toBe('Maglietta Basic — M / Bianco');
    expect(line.discountPercent).toBe(10);
    expect(line.vatRatePercent).toBe(22);
  });

  it('fissa i riferimenti persistiti di IVA e descrizione', () => {
    const line = storeSaleLineFromDocumentLine(RIGA_DOCUMENTO);

    expect(line.persistedVatCodeId).toBe('vat-22');
    expect(line.persistedDescription).toBe('Maglietta Basic — M / Bianco');
  });

  it('lascia a zero la disponibilità: è un dato vivo, non documentale', () => {
    const line = storeSaleLineFromDocumentLine(RIGA_DOCUMENTO);

    expect([line.onHand, line.committed, line.available]).toEqual([0, 0, 0]);
  });
});

describe('storeSaleLinePayload', () => {
  it('riga nuova: nessun id, e i valori dichiarati viaggiano', () => {
    const payload = storeSaleLinePayload(rigaNuova({ discountPercent: 5 }));

    expect(payload.id).toBeUndefined();
    expect(payload.variantId).toBe('var-9');
    expect(payload.discountPercent).toBe(5);
    expect(payload.description).toBe('Articolo nuovo');
    expect(payload.vatCodeId).toBe('vat-22');
  });

  it('riga esistente non toccata: né IVA né descrizione entrano nel payload', () => {
    const payload = storeSaleLinePayload(storeSaleLineFromDocumentLine(RIGA_DOCUMENTO));

    expect(payload.id).toBe('line-1');
    // L'assenza della chiave È il messaggio «non modificata»: mandarla farebbe
    // rifotografare lo snapshot IVA e riscrivere la descrizione.
    expect(payload.vatCodeId).toBeUndefined();
    expect(payload.description).toBeUndefined();
    // Il prezzo si rimanda tale e quale, coda compresa.
    expect(payload.unitPriceMinor).toBe(2049.180328);
  });

  it('riga esistente con IVA cambiata: il codice nuovo viaggia', () => {
    const line = { ...storeSaleLineFromDocumentLine(RIGA_DOCUMENTO), vatCodeId: 'vat-10' };

    expect(storeSaleLinePayload(line).vatCodeId).toBe('vat-10');
  });

  it('riga esistente rimessa com’era: torna a non modificata', () => {
    const caricata = storeSaleLineFromDocumentLine(RIGA_DOCUMENTO);
    const cambiata = { ...caricata, vatCodeId: 'vat-10' };
    const rimessa = { ...cambiata, vatCodeId: caricata.persistedVatCodeId };

    expect(storeSaleLinePayload(rimessa).vatCodeId).toBeUndefined();
  });

  it('riga esistente con descrizione cambiata: la nuova viaggia', () => {
    const line = {
      ...storeSaleLineFromDocumentLine(RIGA_DOCUMENTO),
      description: 'Maglietta Basic — taglia M',
    };

    expect(storeSaleLinePayload(line).description).toBe('Maglietta Basic — taglia M');
  });

  it('sconto zero non viaggia: è l’assenza di sconto, non uno sconto', () => {
    expect(storeSaleLinePayload(rigaNuova({ discountPercent: 0 })).discountPercent).toBeUndefined();
  });
});

describe('storeReturnLinePayload', () => {
  it('«Carica giacenze» prende il nome del confine solo nel payload', () => {
    // Il concetto è uno: `loadsStock`, la spunta di riga comune a ogni documento
    // (`11` A11-ter). Nel DTO si chiama `restockable`, e quel nome non risale
    // dentro il modello.
    expect(storeReturnLinePayload(rigaNuova({ loadsStock: false })).restockable).toBe(false);
    expect(storeReturnLinePayload(rigaNuova({ loadsStock: true })).restockable).toBe(true);
  });

  it('un prezzo zero resta zero, e non diventa «assente»', () => {
    // T4: assente non è rappresentabile, e un prezzo mancante non deve mai
    // diventare zero in silenzio. Lo zero ESPLICITO invece è valido.
    expect(storeReturnLinePayload(rigaNuova({ unitPriceMinor: 0 })).unitPriceMinor).toBe(0);
  });

  it('porta gli stessi contratti binari della Vendita', () => {
    const caricata = storeSaleLineFromDocumentLine(RIGA_DOCUMENTO);

    const payload = storeReturnLinePayload(caricata);

    expect(payload.id).toBe('line-1');
    expect(payload.vatCodeId).toBeUndefined();
    expect(payload.description).toBeUndefined();
    expect(payload.discountPercent).toBe(10);
  });
});

/**
 * ⛔ La spunta «Scarica giacenze» NON viaggiava nel payload della Vendita, e il
 * server cablava `loadsStock: true`: l'operatore la toglieva e la merce usciva
 * lo stesso. Contratto comune §6.3 — «Carica/Scarica ON → OFF: viene
 * neutralizzato l'effetto di quella riga». Misurato il 23/08/2026.
 */
describe('storeSaleLinePayload — la spunta «Scarica giacenze» viaggia', () => {
  it('spunta accesa: parte true', () => {
    expect(storeSaleLinePayload(rigaNuova({ loadsStock: true })).loadsStock).toBe(true);
  });

  it('spunta spenta: parte false, e non sparisce dal payload', () => {
    const payload = storeSaleLinePayload(rigaNuova({ loadsStock: false }));

    expect(payload.loadsStock).toBe(false);
    expect('loadsStock' in payload).toBe(true);
  });

  /** Il Reso la manda col nome del confine: i due non devono divergere. */
  it('Vendita e Reso mandano lo stesso concetto', () => {
    const spenta = rigaNuova({ loadsStock: false });

    expect(storeSaleLinePayload(spenta).loadsStock).toBe(false);
    expect(storeReturnLinePayload(spenta).restockable).toBe(false);
  });
});
