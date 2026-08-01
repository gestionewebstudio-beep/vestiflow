import { describe, expect, it } from 'vitest';

import { DocumentType } from '@core/models/document.model';

import { documentTravelsWithGoods, transportDataIncomplete } from './document-transport.util';

const completeAddress = {
  name: 'Boutique Rossi',
  address: 'Via Roma 1',
  city: 'Napoli',
};

const completeTransport = {
  transportCausal: 'Vendita',
  transportPort: 'franco',
  transportCarrier: 'Vettore BRT',
  transportPackagesCount: 3,
  transportGoodsAspect: 'Scatole',
};

describe('documentTravelsWithGoods', () => {
  it('copre i documenti che accompagnano la merce', () => {
    expect(documentTravelsWithGoods(DocumentType.SalesDdt)).toBe(true);
    expect(documentTravelsWithGoods(DocumentType.InvoiceAccompanying)).toBe(true);
  });

  it('esclude i documenti che non viaggiano con la merce', () => {
    expect(documentTravelsWithGoods(DocumentType.InvoiceDraft)).toBe(false);
    expect(documentTravelsWithGoods(DocumentType.Proforma)).toBe(false);
    expect(documentTravelsWithGoods(DocumentType.Quote)).toBe(false);
  });
});

describe('transportDataIncomplete', () => {
  it('non segnala mai i tipi che non viaggiano con la merce', () => {
    expect(transportDataIncomplete(DocumentType.InvoiceDraft, {})).toBe(false);
    expect(transportDataIncomplete(DocumentType.Proforma, {})).toBe(false);
  });

  it('DDT completo (intestatario + destinazione + trasporto) non genera avviso', () => {
    expect(
      transportDataIncomplete(DocumentType.SalesDdt, {
        ...completeTransport,
        recipientAddress: completeAddress,
        destinationAddress: completeAddress,
      }),
    ).toBe(false);
  });

  it('DDT senza destinazione propria: vale quella dell’intestatario', () => {
    expect(
      transportDataIncomplete(DocumentType.SalesDdt, {
        ...completeTransport,
        recipientAddress: completeAddress,
      }),
    ).toBe(false);
  });

  it.each([
    ['causale', { transportCausal: '' }],
    ['porto', { transportPort: '' }],
    ['incaricato', { transportCarrier: '  ' }],
    ['aspetto beni', { transportGoodsAspect: '' }],
    ['colli', { transportPackagesCount: null }],
  ])('DDT senza %s genera avviso', (_label, override) => {
    expect(
      transportDataIncomplete(DocumentType.SalesDdt, {
        ...completeTransport,
        ...override,
        recipientAddress: completeAddress,
        destinationAddress: completeAddress,
      }),
    ).toBe(true);
  });

  it('colli come stringa vuota del form contano come mancanti', () => {
    expect(
      transportDataIncomplete(DocumentType.SalesDdt, {
        ...completeTransport,
        transportPackagesCount: '',
        recipientAddress: completeAddress,
        destinationAddress: completeAddress,
      }),
    ).toBe(true);
  });

  it('DDT con indirizzo di destinazione senza città genera avviso', () => {
    expect(
      transportDataIncomplete(DocumentType.SalesDdt, {
        ...completeTransport,
        recipientAddress: completeAddress,
        destinationAddress: { ...completeAddress, city: '' },
      }),
    ).toBe(true);
  });

  it('DDT senza intestatario genera avviso', () => {
    expect(
      transportDataIncomplete(DocumentType.SalesDdt, {
        ...completeTransport,
        destinationAddress: completeAddress,
      }),
    ).toBe(true);
  });

  it('Fattura accompagnatoria: basta la destinazione, l’intestatario è il cliente', () => {
    expect(
      transportDataIncomplete(DocumentType.InvoiceAccompanying, {
        ...completeTransport,
        destinationAddress: completeAddress,
      }),
    ).toBe(false);
  });

  it('Fattura accompagnatoria senza destinazione genera avviso', () => {
    expect(
      transportDataIncomplete(DocumentType.InvoiceAccompanying, { ...completeTransport }),
    ).toBe(true);
  });
});
