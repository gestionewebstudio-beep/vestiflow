import { describe, expect, it } from 'vitest';

import {
  CODICE_CONCORRENZA,
  CODICE_CONFRONTO_FALLITO,
  CODICE_CONFRONTO_MANCANTE,
  CODICE_PARAMETRI_INCOERENTI,
  CODICI_DOCUMENTATI,
  classificaRifiutiInventario,
  classificaRifiutoInventario,
  MESSAGGIO_CONFRONTO_FALLITO,
  motiviDi,
} from './shopify-inventory-user-error.util';

/** Un errore del canale, con i soli campi che contano. */
function errore(
  code: string | null,
  message = 'qualcosa',
): {
  readonly field: readonly string[] | null;
  readonly message: string;
  readonly code: string | null;
} {
  return { field: null, message, code };
}

/** Le classi che CHIUDONO il tentativo: le uniche due che concludono. */
const CONCLUSIVE = ['confronto', 'validazione'];

describe('classificazione degli userErrors di inventorySetQuantities', () => {
  describe('⛔ i FRAMMENTI del nome non classificano più', () => {
    // ⛔ **La difesa che era scritta qui — «sbagliare un nome di codice produce
    //    una prudenza in più, mai una scrittura in più» — era falsa.** Un
    //    frammento non aggiunge prudenza: PROMUOVE uno sconosciuto a una classe
    //    che conclude, e una classe che conclude chiude il tentativo.
    it.each([
      ['STALE', 'QUALCOSA_DI_STALE'],
      ['STALE in coda', 'FUTURE_QUANTITY_STALE_THING'],
      ['INVALID', 'INVALID_QUALCOSA_DI_NUOVO'],
      ['MISMATCH', 'QUALCHE_ALTRO_MISMATCH'],
      ['COMPARE', 'COMPARE_QUALCOSA'],
      ['CHANGE_FROM_QUANTITY', 'CHANGE_FROM_QUANTITY_QUALCOSA'],
    ])('un codice sconosciuto che contiene %s resta sconosciuto', (_frammento, codice) => {
      const classe = classificaRifiutoInventario(errore(codice));
      expect(classe).toBe('sconosciuto');
      // ⭐ E l'asserzione che conta davvero: non è una classe che conclude.
      expect(CONCLUSIVE).not.toContain(classe);
    });

    it('un codice sconosciuto con un MESSAGGIO simile al confronto resta sconosciuto', () => {
      // ⛔ Il messaggio non decide: un testo può cambiare senza che cambi la
      //    versione dell'API, e due testi diversi descrivono già lo stesso
      //    codice — quello dell'enum e quello misurato sullo shop.
      const classe = classificaRifiutoInventario(
        errore('CODICE_MAI_VISTO', MESSAGGIO_CONFRONTO_FALLITO),
      );
      expect(classe).toBe('sconosciuto');
      expect(CONCLUSIVE).not.toContain(classe);
    });

    it('il messaggio non basta nemmeno senza codice', () => {
      expect(classificaRifiutoInventario(errore(null, MESSAGGIO_CONFRONTO_FALLITO))).toBe(
        'sconosciuto',
      );
    });
  });

  describe('i due casi che i frammenti sbagliavano', () => {
    it('⛔ COMPARE_QUANTITY_REQUIRED non è una divergenza di quantità', () => {
      // Manca un PARAMETRO. Coi frammenti conteneva «COMPARE» e diventava una
      // differenza di giacenza: avrebbe mandato a riconciliare quantità che
      // nessuno aveva ancora confrontato.
      expect(classificaRifiutoInventario(errore(CODICE_CONFRONTO_MANCANTE))).toBe('validazione');
    });

    it('⛔ IDEMPOTENCY_KEY_PARAMETER_MISMATCH non chiude il tentativo', () => {
      // Dice che i parametri non corrispondono, NON che l'operazione di allora
      // non sia stata applicata. Coi frammenti conteneva «MISMATCH», finiva in
      // validazione e buttava via l'operazione originale.
      const classe = classificaRifiutoInventario(errore(CODICE_PARAMETRI_INCOERENTI));
      expect(classe).toBe('non_ripetibile');
      expect(CONCLUSIVE).not.toContain(classe);
    });

    it('IDEMPOTENCY_PREVIOUS_ATTEMPT_FAILED non conclude la non applicazione', () => {
      // «Failed» non è «non applicata»: un guasto può cadere dopo l'effetto.
      const classe = classificaRifiutoInventario(errore('IDEMPOTENCY_PREVIOUS_ATTEMPT_FAILED'));
      expect(classe).toBe('non_ripetibile');
      expect(CONCLUSIVE).not.toContain(classe);
    });
  });

  describe('i codici documentati, uno per uno', () => {
    it.each([
      [CODICE_CONFRONTO_FALLITO, 'confronto'],
      ['COMPARE_QUANTITY_STALE', 'confronto'],
      [CODICE_CONFRONTO_MANCANTE, 'validazione'],
      [CODICE_CONCORRENZA, 'concorrenza'],
      [CODICE_PARAMETRI_INCOERENTI, 'non_ripetibile'],
      ['IDEMPOTENCY_PREVIOUS_ATTEMPT_FAILED', 'non_ripetibile'],
      ['INVALID_INVENTORY_ITEM', 'validazione'],
      ['INVALID_LOCATION', 'validazione'],
      ['INVALID_NAME', 'validazione'],
      ['INVALID_QUANTITY_NEGATIVE', 'validazione'],
      ['INVALID_QUANTITY_TOO_HIGH', 'validazione'],
      ['INVALID_QUANTITY_TOO_LOW', 'validazione'],
      ['INVALID_REASON', 'validazione'],
      ['INVALID_REFERENCE_DOCUMENT', 'validazione'],
      ['ITEM_NOT_STOCKED_AT_LOCATION', 'validazione'],
      ['NO_DUPLICATE_INVENTORY_ITEM_ID_GROUP_ID_PAIR', 'validazione'],
      ['NON_MUTABLE_INVENTORY_ITEM', 'validazione'],
    ])('%s → %s', (codice, atteso) => {
      expect(classificaRifiutoInventario(errore(codice))).toBe(atteso);
    });

    it('la tabella copre i diciassette valori dell enum, e non di più', () => {
      // ⭐ Se un giorno se ne aggiunge uno alla mappa senza deciderne la classe
      //    con la documentazione in mano, questa riga lo dice.
      expect(CODICI_DOCUMENTATI).toHaveLength(17);
    });

    it('nessun codice documentato resta sconosciuto', () => {
      const orfani = CODICI_DOCUMENTATI.filter(
        (c) => classificaRifiutoInventario(errore(c)) === 'sconosciuto',
      );
      expect(orfani).toEqual([]);
    });
  });

  describe('normalizzazione del codice', () => {
    it('spazi e minuscole non cambiano la classe', () => {
      expect(classificaRifiutoInventario(errore(`  ${CODICE_CONCORRENZA.toLowerCase()} `))).toBe(
        'concorrenza',
      );
    });

    it('codice assente resta sconosciuto', () => {
      expect(classificaRifiutoInventario(errore(null))).toBe('sconosciuto');
      expect(classificaRifiutoInventario(errore(''))).toBe('sconosciuto');
    });
  });

  describe('la precedenza in un elenco: dal più prudente al più conclusivo', () => {
    it('concorrenza vince su tutto', () => {
      expect(
        classificaRifiutiInventario([
          errore(CODICE_CONFRONTO_FALLITO),
          errore(CODICE_CONCORRENZA),
          errore('INVALID_LOCATION'),
        ]),
      ).toBe('concorrenza');
    });

    it('sconosciuto batte non ripetibile, validazione e confronto', () => {
      expect(
        classificaRifiutiInventario([
          errore(CODICE_PARAMETRI_INCOERENTI),
          errore('INVALID_LOCATION'),
          errore('CODICE_MAI_VISTO'),
        ]),
      ).toBe('sconosciuto');
    });

    it('non ripetibile batte validazione e confronto', () => {
      expect(
        classificaRifiutiInventario([
          errore(CODICE_CONFRONTO_FALLITO),
          errore(CODICE_PARAMETRI_INCOERENTI),
        ]),
      ).toBe('non_ripetibile');
    });

    it('validazione batte il confronto', () => {
      // ⛔ Presentare come «la quantità là è diversa» un identificativo
      //    sbagliato manda a cercare il problema dalla parte opposta.
      expect(
        classificaRifiutiInventario([errore(CODICE_CONFRONTO_FALLITO), errore('INVALID_LOCATION')]),
      ).toBe('validazione');
    });
  });

  describe('elenco vuoto e motivi', () => {
    it('nessun errore significa APPLICATA, e si dice con null', () => {
      expect(classificaRifiutiInventario([])).toBeNull();
    });

    it('i motivi portano il codice davanti, quando c è', () => {
      expect(motiviDi([errore('X', 'y'), errore(null, 'z')])).toEqual(['X: y', 'z']);
    });
  });
});
