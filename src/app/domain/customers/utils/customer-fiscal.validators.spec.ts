import {
  SDI_CODE_WARNING_MESSAGE,
  TAX_CODE_WARNING_MESSAGE,
  VAT_NUMBER_WARNING_MESSAGE,
  isValidItalianTaxCode,
  isValidItalianVatNumber,
  isValidSdiCode,
  sdiCodeWarning,
  taxCodeWarning,
  vatNumberWarning,
} from './customer-fiscal.validators';

describe('customer-fiscal.validators', () => {
  describe('isValidItalianVatNumber', () => {
    it('accetta il campo vuoto (dato opzionale)', () => {
      expect(isValidItalianVatNumber('')).toBe(true);
      expect(isValidItalianVatNumber('   ')).toBe(true);
    });

    it('accetta una partita IVA con checksum corretto', () => {
      // Checksum verificato con l'algoritmo ufficiale.
      expect(isValidItalianVatNumber('00000000000')).toBe(true);
      expect(isValidItalianVatNumber('12345678903')).toBe(true);
    });

    it('rifiuta lunghezza sbagliata, lettere e checksum errato', () => {
      expect(isValidItalianVatNumber('1234567890')).toBe(false);
      expect(isValidItalianVatNumber('1234567890a')).toBe(false);
      expect(isValidItalianVatNumber('12345678901')).toBe(false);
    });
  });

  describe('isValidItalianTaxCode', () => {
    it('accetta il campo vuoto', () => {
      expect(isValidItalianTaxCode('')).toBe(true);
    });

    it('accetta un codice fiscale di persona fisica con checksum corretto', () => {
      expect(isValidItalianTaxCode('RSSMRA80A01H501U')).toBe(true);
      // Minuscolo: la verifica normalizza.
      expect(isValidItalianTaxCode('rssmra80a01h501u')).toBe(true);
    });

    it('accetta le 11 cifre dei soggetti giuridici con checksum P.IVA', () => {
      expect(isValidItalianTaxCode('12345678903')).toBe(true);
      expect(isValidItalianTaxCode('12345678901')).toBe(false);
    });

    it('rifiuta formato o checksum errati', () => {
      expect(isValidItalianTaxCode('RSSMRA80A01H501X')).toBe(false);
      expect(isValidItalianTaxCode('RSSMRA80A01H50')).toBe(false);
      expect(isValidItalianTaxCode('1234RSSMRA80A01H')).toBe(false);
    });
  });

  describe('isValidSdiCode', () => {
    it('accetta vuoto e i 7 caratteri del formato B2B', () => {
      expect(isValidSdiCode('')).toBe(true);
      expect(isValidSdiCode('ABC1234')).toBe(true);
      expect(isValidSdiCode('0000000')).toBe(true);
      expect(isValidSdiCode('abc1234')).toBe(true);
    });

    it('rifiuta lunghezze diverse da 7 (incluso il codice PA a 6: FPR12 non lo trasmette)', () => {
      expect(isValidSdiCode('ABC12')).toBe(false);
      expect(isValidSdiCode('UFABCD')).toBe(false);
      expect(isValidSdiCode('ABC12345')).toBe(false);
      expect(isValidSdiCode('ABC-123')).toBe(false);
    });
  });

  describe('messaggi di avviso', () => {
    it('restituiscono il messaggio solo quando il dato è malformato', () => {
      expect(vatNumberWarning('')).toBeNull();
      expect(vatNumberWarning('12345678901')).toBe(VAT_NUMBER_WARNING_MESSAGE);
      expect(taxCodeWarning('RSSMRA80A01H501U')).toBeNull();
      expect(taxCodeWarning('XXX')).toBe(TAX_CODE_WARNING_MESSAGE);
      expect(sdiCodeWarning('ABC1234')).toBeNull();
      expect(sdiCodeWarning('AB')).toBe(SDI_CODE_WARNING_MESSAGE);
    });
  });
});
