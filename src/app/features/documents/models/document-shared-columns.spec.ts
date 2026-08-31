import { describe, expect, it } from 'vitest';

import type { DocumentRecord } from '@core/models/document.model';
import type { TableColumnDef } from '@shared/table-columns/table-column.model';

import {
  COLONNE_DOCUMENTO_CONDIVISE,
  colonneDocumentoCondivise,
  testoColonnaCondivisa,
} from './document-shared-columns';

const doc = (extra: Partial<DocumentRecord>): DocumentRecord =>
  ({ createdByName: 'Luigi', ...extra }) as DocumentRecord;

describe('colonne documentali condivise', () => {
  /*
    ⭐ **La prova che il modulo esiste per dare**: ogni colonna dichiarata ha il
    proprio renderer, e non può essere altrimenti — sono lo stesso oggetto.

    Il difetto che questo previene è reale e misurato: tre colonne aggiunte a
    cinque cataloghi senza il ramo in `cellText`, che rendevano celle vuote su
    cinque elenchi senza che niente fallisse.
  */
  it('⭐ ogni colonna dichiarata sa rendersi', () => {
    for (const [id, voce] of Object.entries(COLONNE_DOCUMENTO_CONDIVISE)) {
      expect(voce.def.id, `la def di ${id} non porta il proprio id`).toBe(id);
      expect(typeof voce.testo, `${id} non ha un renderer`).toBe('function');
      expect(testoColonnaCondivisa(doc({}), id), `${id} non risponde`).not.toBeNull();
    }
  });

  it('⛔ tutte spente di serie: nessuna entra nel preset predefinito da sé', () => {
    for (const voce of Object.values(COLONNE_DOCUMENTO_CONDIVISE)) {
      expect(voce.def.defaultVisible, `${voce.def.id} nasce accesa`).toBe(false);
    }
  });

  describe('il testo delle celle', () => {
    it("l'operatore, la sede e la scadenza si leggono dal documento", () => {
      const d = doc({
        createdByName: 'Anna',
        locationName: 'Magazzino test 3',
        paymentDueDate: '2026-09-30',
      });
      expect(testoColonnaCondivisa(d, 'createdByName')).toBe('Anna');
      expect(testoColonnaCondivisa(d, 'locationName')).toBe('Magazzino test 3');
      expect(testoColonnaCondivisa(d, 'paymentDueDate')).toContain('2026');
    });

    /*
      ⚠️ **In TABELLA il segnaposto ci vuole**: sotto un'intestazione, «—» dice
      «questo documento non ha sede» e distingue il vuoto dal non caricato. È la
      card a omettere il trattino, non la cella (`valoreCard`).
    */
    it('⚠️ un valore assente dà il segnaposto, non la stringa vuota', () => {
      const vuoto = doc({ createdByName: '', locationName: undefined });
      expect(testoColonnaCondivisa(vuoto, 'locationName')).toBe('—');
      expect(testoColonnaCondivisa(vuoto, 'createdByName')).toBe('—');
      expect(testoColonnaCondivisa(vuoto, 'paymentDueDate')).toBe('—');
    });

    it('uno spazio non è un valore', () => {
      expect(testoColonnaCondivisa(doc({ locationName: '   ' }), 'locationName')).toBe('—');
    });

    /*
      ⛔ **`null` e non stringa vuota** per «non è affar mio»: la stringa vuota è
      un valore legittimo per una cella, e confonderle rimetterebbe in piedi
      esattamente il difetto delle colonne senza renderer.
    */
    it('⛔ una colonna che non è sua restituisce null, non una cella vuota', () => {
      expect(testoColonnaCondivisa(doc({}), 'total')).toBeNull();
      expect(testoColonnaCondivisa(doc({}), 'reference')).toBeNull();
    });
  });

  describe('non ripete ciò che il profilo dichiara già', () => {
    const cd = (id: string, label: string): TableColumnDef => ({ id, label });

    it('le aggiunge tutte a un catalogo che non ne ha nessuna', () => {
      const nuove = colonneDocumentoCondivise([cd('reference', 'Numero')]);
      expect(nuove.map((c) => c.id)).toEqual(['createdByName', 'locationName', 'paymentDueDate']);
    });

    it('non ripete una colonna con lo stesso id', () => {
      const nuove = colonneDocumentoCondivise([cd('locationName', 'Sede operativa')]);
      expect(nuove.map((c) => c.id)).not.toContain('locationName');
    });

    /*
      ⛔ **Il caso vero, e il motivo per cui il confronto è sull'ETICHETTA.**

      `STORE_SALE` e `GOODS_RECEIPT` non dichiarano `locationName`: dichiarano
      `location`, che il catalogo condiviso etichetta «Sede». Confrontando i soli
      id, le due voci sarebbero passate entrambe e il selettore Colonne avrebbe
      mostrato «Sede» due volte — una funzionante e una vuota. È successo.
    */
    it('⛔ non ripete una colonna con la stessa ETICHETTA e id diverso', () => {
      const nuove = colonneDocumentoCondivise([cd('location', 'Sede')]);
      expect(nuove.map((c) => c.id)).not.toContain('locationName');
      expect(nuove.map((c) => c.id)).toEqual(['createdByName', 'paymentDueDate']);
    });

    it('su un catalogo vuoto le aggiunge tutte, senza inventarne altre', () => {
      expect(colonneDocumentoCondivise([])).toHaveLength(
        Object.keys(COLONNE_DOCUMENTO_CONDIVISE).length,
      );
    });
  });
});
