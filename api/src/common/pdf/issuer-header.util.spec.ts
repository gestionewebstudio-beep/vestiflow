import { describe, expect, it } from 'vitest';

import type { DocumentIssuer } from '../company/document-issuer.util';
import { issuerFooterLine, issuerHeaderLines } from './issuer-header.util';

/**
 * La composizione dell'intestazione è ora letta da DUE consumatori: il PDF e
 * l'anteprima a schermo (via `GET /documents/:id/print-header`). Le regole qui
 * sotto sono sottili e nessuna delle due parti le vedrebbe sbagliare da sola —
 * per questo hanno un test proprio.
 */
const VUOTO: DocumentIssuer = {
  legalName: 'Negozio Srl',
  vatNumber: null,
  fiscalCode: null,
  phone: null,
  email: null,
  website: null,
  pec: null,
  iban: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  province: null,
  postalCode: null,
  countryCode: null,
  taxRegime: null,
  reaOffice: null,
  reaNumber: null,
  shareCapitalMinor: null,
  soleShareholder: null,
  inLiquidation: false,
  source: 'profile',
};

describe('issuerHeaderLines', () => {
  it('non inventa righe quando non c’è niente da dire', () => {
    expect(issuerHeaderLines(VUOTO)).toEqual([]);
  });

  it('compone indirizzo, identificativi e contatti', () => {
    const righe = issuerHeaderLines({
      ...VUOTO,
      addressLine1: 'Via Roma 1',
      postalCode: '80100',
      city: 'Napoli',
      province: 'NA',
      vatNumber: 'IT12345678901',
      phone: '+39 081 000000',
      email: 'info@negozio.it',
    });

    expect(righe).toEqual([
      'Via Roma 1, 80100 Napoli NA',
      'P. IVA: IT12345678901',
      'Tel. +39 081 000000 · info@negozio.it',
    ]);
  });

  // Per le società i due coincidono: ripeterlo aggiunge una riga muta.
  it('tace il codice fiscale quando è uguale alla partita IVA', () => {
    const righe = issuerHeaderLines({
      ...VUOTO,
      vatNumber: 'IT12345678901',
      fiscalCode: 'IT12345678901',
    });
    expect(righe).toEqual(['P. IVA: IT12345678901']);
  });

  it('stampa il codice fiscale quando è diverso', () => {
    const righe = issuerHeaderLines({
      ...VUOTO,
      vatNumber: 'IT12345678901',
      fiscalCode: 'MTALGU80A01F839X',
    });
    expect(righe).toEqual(['P. IVA: IT12345678901 · C.F.: MTALGU80A01F839X']);
  });
});

describe('issuerFooterLine', () => {
  // Una ditta individuale al Registro Imprese non è iscritta: una riga vuota
  // sarebbe peggio dell'assenza.
  it('è nulla per chi non ha dati di registro', () => {
    expect(issuerFooterLine(VUOTO)).toBeNull();
  });

  it('vuole ufficio E numero per stampare il REA', () => {
    expect(issuerFooterLine({ ...VUOTO, reaOffice: 'na', reaNumber: null })).toBeNull();
    expect(issuerFooterLine({ ...VUOTO, reaOffice: null, reaNumber: '123456' })).toBeNull();
    expect(issuerFooterLine({ ...VUOTO, reaOffice: 'na', reaNumber: '123456' })).toBe(
      'R.E.A. NA 123456',
    );
  });

  it('compone capitale, socio unico e liquidazione', () => {
    expect(
      issuerFooterLine({
        ...VUOTO,
        reaOffice: 'mi',
        reaNumber: '999',
        shareCapitalMinor: 1000000,
        soleShareholder: true,
        inLiquidation: true,
      }),
    ).toBe('R.E.A. MI 999 · Cap. soc. € 10000.00 · Socio unico · Società in liquidazione');
  });
});
