import { describe, expect, it } from 'vitest';

import {
  issuerAddressLine,
  readIssuerSnapshot,
  resolveDocumentIssuer,
  type IssuerTenantRow,
} from './document-issuer.util';

const ATTIVAZIONE = {
  name: 'Boutique Demo',
  legalName: 'Cliente VestiFlow Srl',
  vatNumber: '11111111111',
  fiscalCode: 'CF-ATTIVAZIONE',
  phone: '081 111111',
  pec: 'attivazione@pec.it',
  iban: 'IT00A0000000000000000000001',
  addressLine1: 'Via del Contratto 1',
  addressLine2: null,
  city: 'Roma',
  province: 'RM',
  postalCode: '00100',
  countryCode: 'IT',
} satisfies Omit<IssuerTenantRow, 'companyProfile'>;

const AZIENDA = {
  legalName: 'Boutique Demo Srl',
  vatNumber: '22222222222',
  fiscalCode: 'CF-AZIENDA',
  phone: '081 222222',
  email: 'info@boutique.it',
  website: 'boutique.it',
  pec: 'azienda@pec.it',
  iban: 'IT00A0000000000000000000002',
  addressLine1: 'Via Roma 1',
  addressLine2: null,
  city: 'Napoli',
  province: 'NA',
  postalCode: '80100',
  countryCode: 'IT',
  taxRegime: 'RF19',
  reaOffice: 'NA',
  reaNumber: '123456',
  shareCapitalMinor: 1_000_000,
  soleShareholder: true,
  inLiquidation: false,
};

describe('resolveDocumentIssuer', () => {
  it("con l'anagrafica azienda compilata, i dati di attivazione non entrano", () => {
    const issuer = resolveDocumentIssuer({ ...ATTIVAZIONE, companyProfile: AZIENDA });

    expect(issuer.legalName).toBe('Boutique Demo Srl');
    expect(issuer.vatNumber).toBe('22222222222');
    expect(issuer.city).toBe('Napoli');
    expect(issuer.source).toBe('profile');
  });

  it('mai un misto: i campi vuoti dell azienda restano vuoti', () => {
    const issuer = resolveDocumentIssuer({
      ...ATTIVAZIONE,
      companyProfile: { ...AZIENDA, iban: null, pec: null, addressLine1: null },
    });

    // Ripescarli dall'attivazione darebbe una fattura con l'indirizzo di una
    // società e la partita IVA di un'altra, senza che nessuno se ne accorga.
    expect(issuer.iban).toBeNull();
    expect(issuer.pec).toBeNull();
    expect(issuer.addressLine1).toBeNull();
  });

  it("senza anagrafica azienda usa i dati di attivazione, com'è sempre stato", () => {
    const issuer = resolveDocumentIssuer({ ...ATTIVAZIONE, companyProfile: null });

    expect(issuer.legalName).toBe('Cliente VestiFlow Srl');
    expect(issuer.vatNumber).toBe('11111111111');
    expect(issuer.source).toBe('activation');
  });

  it('regime fiscale e REA esistono solo sull azienda gestita', () => {
    const conProfilo = resolveDocumentIssuer({ ...ATTIVAZIONE, companyProfile: AZIENDA });
    expect(conProfilo.taxRegime).toBe('RF19');
    expect(conProfilo.reaNumber).toBe('123456');
    expect(conProfilo.shareCapitalMinor).toBe(1_000_000);

    // I dati di attivazione non li hanno mai avuti: restano vuoti, e l'XML
    // ricade su RF01 senza inventare un'iscrizione al registro.
    const senzaProfilo = resolveDocumentIssuer({ ...ATTIVAZIONE, companyProfile: null });
    expect(senzaProfilo.taxRegime).toBeNull();
    expect(senzaProfilo.reaNumber).toBeNull();
    expect(senzaProfilo.inLiquidation).toBe(false);
  });

  it('senza ragione sociale da nessuna parte resta il nome del negozio', () => {
    const issuer = resolveDocumentIssuer({
      ...ATTIVAZIONE,
      legalName: null,
      companyProfile: null,
    });
    expect(issuer.legalName).toBe('Boutique Demo');

    const conProfilo = resolveDocumentIssuer({
      ...ATTIVAZIONE,
      companyProfile: { ...AZIENDA, legalName: null },
    });
    expect(conProfilo.legalName).toBe('Boutique Demo');
  });
});

describe('readIssuerSnapshot', () => {
  it('legge lo snapshot salvato sul documento', () => {
    const snapshot = readIssuerSnapshot({
      legalName: 'Boutique Demo Srl',
      vatNumber: '22222222222',
      city: 'Napoli',
      source: 'profile',
    });

    expect(snapshot?.legalName).toBe('Boutique Demo Srl');
    expect(snapshot?.city).toBe('Napoli');
    expect(snapshot?.iban).toBeNull();
  });

  it('documenti anteriori allo snapshot: null, si rilegge l anagrafica', () => {
    expect(readIssuerSnapshot(null)).toBeNull();
    expect(readIssuerSnapshot(undefined)).toBeNull();
  });

  it('scarta uno snapshot senza ragione sociale invece di stampare una testata vuota', () => {
    expect(readIssuerSnapshot({ vatNumber: '22222222222' })).toBeNull();
    expect(readIssuerSnapshot({ legalName: '   ' })).toBeNull();
    expect(readIssuerSnapshot('non un oggetto')).toBeNull();
    expect(readIssuerSnapshot([{ legalName: 'x' }])).toBeNull();
  });
});

describe('issuerAddressLine', () => {
  it('compone via, CAP, città e provincia', () => {
    const issuer = resolveDocumentIssuer({ ...ATTIVAZIONE, companyProfile: AZIENDA });
    expect(issuerAddressLine(issuer)).toBe('Via Roma 1, 80100 Napoli NA');
  });

  it('senza indirizzo non lascia virgole orfane', () => {
    const issuer = resolveDocumentIssuer({
      ...ATTIVAZIONE,
      companyProfile: {
        ...AZIENDA,
        addressLine1: null,
        city: null,
        province: null,
        postalCode: null,
      },
    });
    expect(issuerAddressLine(issuer)).toBeNull();
  });
});
