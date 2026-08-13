import { FormBuilder } from '@angular/forms';
import { describe, expect, it } from 'vitest';

import {
  EMPTY_COMPANY_FIELDS,
  companyFieldsFormValue,
  companyFieldsPayload,
  companyProfileFormValue,
  companyProfileFromDto,
  companyProfilePayload,
  createCompanyFieldsControls,
  createCompanyProfileControls,
  hasAnyCompanyField,
  missingEssentialCompanyFields,
  type CompanyFieldsDto,
} from './company-profile.model';

const EMPTY_DTO: CompanyFieldsDto = {
  legalName: null,
  vatNumber: null,
  fiscalCode: null,
  phone: null,
  email: null,
  website: null,
  pec: null,
  sdiCode: null,
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
};

describe('company-profile.model', () => {
  describe('companyProfileFromDto', () => {
    it('mantiene `null` il profilo mai compilato', () => {
      const result = companyProfileFromDto({ profile: null, activationDefaults: EMPTY_DTO });
      expect(result.profile).toBeNull();
    });

    it('normalizza gli spazi e riduce a null le stringhe vuote', () => {
      const result = companyProfileFromDto({
        profile: { ...EMPTY_DTO, legalName: '  Boutique Srl ', city: '   ' },
        activationDefaults: EMPTY_DTO,
      });
      expect(result.profile?.legalName).toBe('Boutique Srl');
      expect(result.profile?.city).toBeNull();
    });
  });

  describe('companyFieldsPayload', () => {
    it('omette i campi vuoti: è l’API ad azzerarli', () => {
      const payload = companyFieldsPayload({ legalName: ' Boutique Srl ', city: '  ', iban: '' });
      expect(payload['legalName']).toBe('Boutique Srl');
      expect(payload['city']).toBeUndefined();
      expect(payload['iban']).toBeUndefined();
    });
  });

  describe('companyFieldsFormValue', () => {
    it('traduce null in stringa vuota per il form', () => {
      const value = companyFieldsFormValue({ ...EMPTY_COMPANY_FIELDS, legalName: 'Boutique Srl' });
      expect(value.legalName).toBe('Boutique Srl');
      expect(value.vatNumber).toBe('');
    });

    it('copre tutti i controlli del form, senza campi orfani', () => {
      const controls = createCompanyFieldsControls(new FormBuilder().nonNullable);
      const value = companyFieldsFormValue(EMPTY_COMPANY_FIELDS);
      expect(Object.keys(value).sort()).toEqual(Object.keys(controls).sort());
    });
  });

  describe('companyProfilePayload', () => {
    it('capitale sociale: dall euro digitato ai centesimi', () => {
      expect(companyProfilePayload({ shareCapital: '10.000,00' })['shareCapitalMinor']).toBe(
        1_000_000,
      );
      expect(companyProfilePayload({ shareCapital: '50000' })['shareCapitalMinor']).toBe(5_000_000);
    });

    it('capitale vuoto o illeggibile non diventa zero', () => {
      // Zero è una dichiarazione; assente è un'altra cosa.
      expect(companyProfilePayload({ shareCapital: '' })['shareCapitalMinor']).toBeUndefined();
      expect(companyProfilePayload({ shareCapital: 'boh' })['shareCapitalMinor']).toBeUndefined();
    });

    it('compagine sociale a tre stati', () => {
      expect(companyProfilePayload({ soleShareholder: 'SU' })['soleShareholder']).toBe(true);
      expect(companyProfilePayload({ soleShareholder: 'SM' })['soleShareholder']).toBe(false);
      // Non dichiarata: il campo non viaggia, e l'API lo azzera.
      expect(companyProfilePayload({ soleShareholder: '' })['soleShareholder']).toBeUndefined();
    });

    it('la sigla della provincia REA va in maiuscolo', () => {
      expect(companyProfilePayload({ reaOffice: 'na' })['reaOffice']).toBe('NA');
    });
  });

  describe('companyProfileFormValue', () => {
    it('centesimi → campo in euro con la virgola', () => {
      const value = companyProfileFormValue({
        ...EMPTY_COMPANY_FIELDS,
        shareCapitalMinor: 1_000_000,
      });
      expect(value['shareCapital']).toBe('10000,00');
    });

    it('capitale non dichiarato: campo vuoto, non «0,00»', () => {
      expect(companyProfileFormValue(EMPTY_COMPANY_FIELDS)['shareCapital']).toBe('');
    });

    it('copre tutti i controlli della maschera del titolare', () => {
      const controls = createCompanyProfileControls(new FormBuilder().nonNullable);
      const value = companyProfileFormValue(EMPTY_COMPANY_FIELDS);
      expect(Object.keys(value).sort()).toEqual(Object.keys(controls).sort());
    });
  });

  describe('hasAnyCompanyField', () => {
    it('riconosce l’anagrafica di attivazione vuota', () => {
      expect(hasAnyCompanyField(EMPTY_COMPANY_FIELDS)).toBe(false);
      expect(hasAnyCompanyField({ ...EMPTY_COMPANY_FIELDS, vatNumber: '12345678901' })).toBe(true);
    });
  });

  describe('missingEssentialCompanyFields', () => {
    it('senza anagrafica elenca tutto', () => {
      expect(missingEssentialCompanyFields(null)).toEqual([
        'Ragione sociale',
        'Partita IVA',
        'Indirizzo',
      ]);
    });

    it('un indirizzo senza città resta incompleto', () => {
      const missing = missingEssentialCompanyFields({
        ...EMPTY_COMPANY_FIELDS,
        legalName: 'Boutique Srl',
        vatNumber: '12345678901',
        addressLine1: 'Via Roma 1',
      });
      expect(missing).toEqual(['Indirizzo']);
    });

    it('anagrafica completa: nessun avviso', () => {
      const missing = missingEssentialCompanyFields({
        ...EMPTY_COMPANY_FIELDS,
        legalName: 'Boutique Srl',
        vatNumber: '12345678901',
        addressLine1: 'Via Roma 1',
        city: 'Napoli',
      });
      expect(missing).toEqual([]);
    });
  });
});
