import { describe, expect, it } from 'vitest';

import { DocumentType } from '@core/models/document.model';

import { STORE_SALE_MODE_DESCRIPTOR, storeSaleModeDescriptor } from './store-sale-mode.descriptor';
import { STORE_SALE_ROUTE_SEGMENT, type StoreSaleMode } from './store-sale-routing.util';

const MODI = Object.keys(STORE_SALE_ROUTE_SEGMENT) as readonly StoreSaleMode[];

describe('descrittore di modalità del banco', () => {
  it('copre TUTTI i modi che hanno una rotta', () => {
    // Il registro delle rotte è la fonte dei modi: un modo con un indirizzo e
    // senza descrittore aprirebbe una maschera senza titolo né effetti noti.
    for (const mode of MODI) {
      expect(storeSaleModeDescriptor(mode)).toBeDefined();
    }
  });

  it('ogni modo nasce dal proprio tipo documento', () => {
    expect(STORE_SALE_MODE_DESCRIPTOR.sale.documentType).toBe(DocumentType.StoreSale);
    expect(STORE_SALE_MODE_DESCRIPTOR.return.documentType).toBe(DocumentType.StoreReturn);
  });

  it('i titoli di creazione sono quelli dichiarati dalle rotte', () => {
    expect(STORE_SALE_MODE_DESCRIPTOR.sale.createTitle).toBe('Nuova vendita al banco');
    expect(STORE_SALE_MODE_DESCRIPTOR.return.createTitle).toBe('Nuovo reso al banco');
  });

  it('la sottotestata del Reso non parla di scarico', () => {
    // Era il difetto misurato quando titolo e sottotestata erano fissi sulla
    // vendita: aprire un reso dichiarava il contrario di quello che fa.
    expect(STORE_SALE_MODE_DESCRIPTOR.return.subtitle).toContain('rientra in giacenza');
    expect(STORE_SALE_MODE_DESCRIPTOR.return.subtitle).not.toContain('scaricate');
    expect(STORE_SALE_MODE_DESCRIPTOR.sale.subtitle).toContain('scaricate');
  });

  it('⛔ il descrittore NON parla del cliente: non è una differenza fra i modi', () => {
    // `11` A13 mette «Cliente (facoltativo)» nella testata senza distinguere
    // Vendita e Reso. Un flag qui lo trasformerebbe in una regola di dominio, e
    // sarebbe nato da un gap del contratto invece che dalla specifica.
    for (const modo of MODI) {
      expect(Object.keys(STORE_SALE_MODE_DESCRIPTOR[modo])).not.toContain('hasCustomer');
      expect(Object.keys(STORE_SALE_MODE_DESCRIPTOR[modo])).not.toContain(
        'customerSupportedByContract',
      );
    }
  });

  it('i due modi non condividono titoli, icone né sottotestate', () => {
    const sale = STORE_SALE_MODE_DESCRIPTOR.sale;
    const reso = STORE_SALE_MODE_DESCRIPTOR.return;

    expect(sale.createTitle).not.toBe(reso.createTitle);
    expect(sale.editTitle).not.toBe(reso.editTitle);
    expect(sale.subtitle).not.toBe(reso.subtitle);
    expect(sale.icon).not.toBe(reso.icon);
  });
});
