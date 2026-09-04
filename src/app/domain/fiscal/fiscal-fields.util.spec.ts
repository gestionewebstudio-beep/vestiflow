import { describe, expect, it } from 'vitest';

import {
  POSTAL_CODE_WARNING_MESSAGE,
  PROVINCE_WARNING_MESSAGE,
  TAX_CODE_WARNING_MESSAGE,
  IBAN_WARNING_MESSAGE,
  VAT_NUMBER_WARNING_MESSAGE,
  countryCodeWarning,
  isValidCountryCode,
  ibanWarning,
  isValidIban,
  isValidItalianPostalCode,
  isValidItalianProvince,
  isValidItalianTaxCode,
  isValidItalianVatNumber,
  postalCodeWarning,
  provinceWarning,
  taxCodeWarning,
  vatNumberWarning,
} from './fiscal-fields.util';

/**
 * ⚠️ **I valori di prova NON sono inventati qui.** Vengono dallo spec del ramo
 * archiviato (`archivio/fattura-elettronica`, `7866b80f`), che li dichiara
 * verificati con l'algoritmo ufficiale — e le partite IVA reali qui sotto sono
 * un secondo riscontro indipendente.
 *
 * ⛔ **Serviva davvero**: `RSSMRA85M01H501Z`, il codice fiscale d'esempio più
 * citato in giro, **non passa** — il suo carattere di controllo è sbagliato.
 * Prendendolo per buono si sarebbe concluso che l'algoritmo era rotto.
 */
describe('fiscal-fields.util', () => {
  describe('partita IVA', () => {
    it('il campo vuoto è valido: è un dato facoltativo', () => {
      expect(isValidItalianVatNumber('')).toBe(true);
      expect(isValidItalianVatNumber('   ')).toBe(true);
    });

    it('accetta partite IVA reali, con la cifra di controllo giusta', () => {
      expect(isValidItalianVatNumber('12485671007')).toBe(true); // Poste Italiane
      expect(isValidItalianVatNumber('00905811006')).toBe(true); // Enel
      expect(isValidItalianVatNumber('12345678903')).toBe(true); // dallo spec archiviato
      expect(isValidItalianVatNumber('00000000000')).toBe(true);
    });

    it('⛔ rifiuta una cifra sbagliata: è il refuso che deve trovare', () => {
      expect(isValidItalianVatNumber('12485671008')).toBe(false); // ultima cifra alterata
      expect(isValidItalianVatNumber('12485671107')).toBe(false); // penultima alterata
      expect(isValidItalianVatNumber('12345678901')).toBe(false);
    });

    it('rifiuta lunghezza sbagliata e lettere', () => {
      expect(isValidItalianVatNumber('1234567890')).toBe(false);
      expect(isValidItalianVatNumber('123456789012')).toBe(false);
      expect(isValidItalianVatNumber('1234567890a')).toBe(false);
    });
  });

  describe('codice fiscale', () => {
    it('il campo vuoto è valido', () => {
      expect(isValidItalianTaxCode('')).toBe(true);
    });

    it('accetta la persona fisica, anche minuscola', () => {
      expect(isValidItalianTaxCode('RSSMRA80A01H501U')).toBe(true);
      expect(isValidItalianTaxCode('rssmra80a01h501u')).toBe(true);
    });

    it('⭐ accetta le 11 cifre dei soggetti giuridici: per una società il CF È la P. IVA', () => {
      expect(isValidItalianTaxCode('12345678903')).toBe(true);
      expect(isValidItalianTaxCode('12345678901')).toBe(false);
    });

    it('⛔ rifiuta il carattere di controllo sbagliato', () => {
      expect(isValidItalianTaxCode('RSSMRA80A01H501X')).toBe(false);
      // L'esempio che gira ovunque, e che è sbagliato.
      expect(isValidItalianTaxCode('RSSMRA85M01H501Z')).toBe(false);
    });

    it('rifiuta formati che non sono né 16 caratteri né 11 cifre', () => {
      expect(isValidItalianTaxCode('RSSMRA80A01H50')).toBe(false);
      expect(isValidItalianTaxCode('1234RSSMRA80A01H')).toBe(false);
    });
  });

  describe('IBAN', () => {
    it('il campo vuoto è valido', () => {
      expect(isValidIban('')).toBe(true);
      expect(isValidIban('   ')).toBe(true);
    });

    it('accetta IBAN di paesi diversi: un fornitore estero deve poter entrare', () => {
      expect(isValidIban('IT60X0542811101000000123456')).toBe(true);
      expect(isValidIban('DE89370400440532013000')).toBe(true);
      expect(isValidIban('GB82WEST12345698765432')).toBe(true);
      expect(isValidIban('FR1420041010050500013M02606')).toBe(true);
    });

    it('⭐ ignora gli spazi: si incolla dalla fattura, dove è stampato a gruppi di quattro', () => {
      expect(isValidIban('IT60 X054 2811 1010 0000 0123 456')).toBe(true);
      expect(isValidIban('it60x0542811101000000123456')).toBe(true);
    });

    it('⛔ una cifra sbagliata non passa: è il refuso che deve trovare', () => {
      expect(isValidIban('IT60X0542811101000000123457')).toBe(false);
      expect(isValidIban('IT61X0542811101000000123456')).toBe(false);
    });

    it('rifiuta forme che non sono un IBAN', () => {
      expect(isValidIban('IT60')).toBe(false);
      expect(isValidIban('6042811101000000123456')).toBe(false);
      expect(isValidIban('ITXX0542811101000000123456')).toBe(false);
    });
  });

  describe('CAP, provincia, paese', () => {
    it('accettano il vuoto e la forma giusta', () => {
      expect(isValidItalianPostalCode('')).toBe(true);
      expect(isValidItalianPostalCode('80013')).toBe(true);
      expect(isValidItalianProvince('')).toBe(true);
      expect(isValidItalianProvince('NA')).toBe(true);
      expect(isValidItalianProvince('na')).toBe(true);
      expect(isValidCountryCode('IT')).toBe(true);
    });

    it('⛔ rifiutano le forme sbagliate che nascono da un refuso', () => {
      expect(isValidItalianPostalCode('8001')).toBe(false);
      expect(isValidItalianPostalCode('800133')).toBe(false);
      expect(isValidItalianPostalCode('8001A')).toBe(false);
      expect(isValidItalianProvince('NAP')).toBe(false);
      expect(isValidItalianProvince('N')).toBe(false);
      expect(isValidCountryCode('ITA')).toBe(false);
    });
  });

  describe('messaggi', () => {
    it('⭐ a valore valido NON c’è avviso: è la metà che si dimentica di provare', () => {
      expect(vatNumberWarning('12485671007')).toBeNull();
      expect(taxCodeWarning('RSSMRA80A01H501U')).toBeNull();
      expect(postalCodeWarning('80013')).toBeNull();
      expect(provinceWarning('NA')).toBeNull();
      expect(countryCodeWarning('IT')).toBeNull();
      expect(ibanWarning('IT60X0542811101000000123456')).toBeNull();
      expect(vatNumberWarning('')).toBeNull();
    });

    it('a valore sbagliato l’avviso dice cosa manca', () => {
      expect(vatNumberWarning('12485671008')).toBe(VAT_NUMBER_WARNING_MESSAGE);
      expect(taxCodeWarning('RSSMRA80A01H501X')).toBe(TAX_CODE_WARNING_MESSAGE);
      expect(postalCodeWarning('8001')).toBe(POSTAL_CODE_WARNING_MESSAGE);
      expect(provinceWarning('NAP')).toBe(PROVINCE_WARNING_MESSAGE);
      expect(ibanWarning('IT60X0542811101000000123457')).toBe(IBAN_WARNING_MESSAGE);
    });
  });
});
