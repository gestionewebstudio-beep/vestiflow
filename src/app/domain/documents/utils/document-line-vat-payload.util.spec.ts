import { describe, expect, it } from 'vitest';

import { vatCodeIdForLinePayload } from './document-line-vat-payload.util';

describe('vatCodeIdForLinePayload', () => {
  describe('riga esistente', () => {
    it('IVA non toccata: la chiave NON entra nel payload, e il server conserva lo snapshot', () => {
      expect(
        vatCodeIdForLinePayload({
          currentVatCodeId: 'vat-22',
          persistedVatCodeId: 'vat-22',
          isExistingLine: true,
        }),
      ).toBeUndefined();
    });

    it('scelta esplicita di un altro Codice IVA: la chiave entra', () => {
      expect(
        vatCodeIdForLinePayload({
          currentVatCodeId: 'vat-10',
          persistedVatCodeId: 'vat-22',
          isExistingLine: true,
        }),
      ).toBe('vat-10');
    });

    it('sostituzione articolo: il nuovo codice si invia anche se scritto con emitEvent:false', () => {
      // La riga aveva l'IVA del vecchio articolo; sostituendo l'articolo il form
      // riscrive il controllo SENZA emettere nulla. Si guarda il risultato, non
      // l'evento — o la modifica andrebbe persa in silenzio.
      expect(
        vatCodeIdForLinePayload({
          currentVatCodeId: 'vat-articolo-nuovo',
          persistedVatCodeId: 'vat-articolo-vecchio',
          isExistingLine: true,
        }),
      ).toBe('vat-articolo-nuovo');
    });

    it('riallineamento automatico che cambia davvero il codice: si invia', () => {
      // Riga storica con solo l'aliquota legacy: il riaggancio le assegna un
      // Codice IVA vero. È una modifica, e va dichiarata.
      expect(
        vatCodeIdForLinePayload({
          currentVatCodeId: 'vat-riagganciato',
          persistedVatCodeId: null,
          isExistingLine: true,
        }),
      ).toBe('vat-riagganciato');
    });

    it('riallineamento che NON cambia nulla: non si invia niente', () => {
      expect(
        vatCodeIdForLinePayload({
          currentVatCodeId: 'vat-22',
          persistedVatCodeId: 'vat-22',
          isExistingLine: true,
        }),
      ).toBeUndefined();
    });

    it('riga senza Codice IVA che resta senza: nessuna chiave', () => {
      expect(
        vatCodeIdForLinePayload({
          currentVatCodeId: '',
          persistedVatCodeId: null,
          isExistingLine: true,
        }),
      ).toBeUndefined();
    });

    it('stringa vuota e null sono la stessa assenza: nessun falso positivo', () => {
      expect(
        vatCodeIdForLinePayload({
          currentVatCodeId: '   ',
          persistedVatCodeId: undefined,
          isExistingLine: true,
        }),
      ).toBeUndefined();
    });
  });

  describe('riga nuova', () => {
    it('manda il codice scelto', () => {
      expect(vatCodeIdForLinePayload({ currentVatCodeId: 'vat-22', isExistingLine: false })).toBe(
        'vat-22',
      );
    });

    it('senza codice non manda niente: risolve il server da articolo/predefinito', () => {
      expect(
        vatCodeIdForLinePayload({ currentVatCodeId: '', isExistingLine: false }),
      ).toBeUndefined();
    });
  });
});
