import { FormControl, FormGroup } from '@angular/forms';
import { describe, expect, it } from 'vitest';

import {
  collegaRigheDuplicateAllaSorgente,
  scollegaRigaDallaSorgente,
} from './document-line-source-link.util';

/**
 * Le due regole del legame con la riga sorgente, provate DIRETTAMENTE.
 *
 * ⭐ Erano scritte tre volte, una per maschera, e in due grafie diverse. Qui si
 * misurano una volta sola: le prove di componente verificano che ogni maschera
 * le CHIAMI, questa verifica che facciano la cosa giusta.
 */
describe('collegaRigheDuplicateAllaSorgente', () => {
  /** La riga come la costruisce un form documentale: id di testo. */
  function rigaConIdTesto(id: string) {
    return new FormGroup({
      id: new FormControl(id),
      sourceDocumentLineId: new FormControl<string | null>(null),
    });
  }

  /** La riga dei form magazzino: id nullabile. */
  function rigaConIdNullabile(id: string | null) {
    return new FormGroup({
      id: new FormControl<string | null>(id),
      sourceDocumentLineId: new FormControl<string | null>(null),
    });
  }

  it("⭐ l'id dell'originale diventa il riferimento alla sorgente", () => {
    const riga = rigaConIdTesto('riga-1');

    collegaRigheDuplicateAllaSorgente([riga]);

    expect(riga.controls.sourceDocumentLineId.value).toBe('riga-1');
  });

  /*
    ⛔ Se l'id restasse, il salvataggio AGGIORNEREBBE il documento originale
    invece di crearne uno nuovo: il duplicato non esisterebbe, e l'originale
    sarebbe stato riscritto.
  */
  it("⛔ e la riga nuova non porta più l'id dell'originale", () => {
    const riga = rigaConIdTesto('riga-1');

    collegaRigheDuplicateAllaSorgente([riga]);

    expect(riga.controls.id.value).toBe('');
  });

  /*
    ⚠️ Le maschere non dichiarano l'id allo stesso modo: di testo sul documento
    di vendita, nullabile su Trasferimento e Movimento. La stringa vuota va bene
    per entrambi — e questa prova esiste perché la prima versione tentava di
    distinguerli guardando `typeof id.value`, che è il VALORE e non il tipo del
    controllo: un campo nullabile con dentro una stringa prendeva la forma
    sbagliata.
  */
  it("⭐ l'id si azzera allo stesso modo su ogni forma di controllo", () => {
    const testo = rigaConIdTesto('riga-1');
    const nullabile = rigaConIdNullabile('riga-2');

    collegaRigheDuplicateAllaSorgente([testo, nullabile]);

    // ⚠️ La stringa vuota va bene per entrambi: un controllo nullabile la
    //    accetta, uno di testo non accetterebbe `null`, e il payload manda
    //    `id || undefined` — le due forme gli dicono la stessa cosa.
    expect(testo.controls.id.value).toBe('');
    expect(nullabile.controls.id.value).toBe('');
    // E il riferimento è quello giusto su tutte e due.
    expect(testo.controls.sourceDocumentLineId.value).toBe('riga-1');
    expect(nullabile.controls.sourceDocumentLineId.value).toBe('riga-2');
  });

  it('⭐ vale per TUTTE le righe, non solo per la prima', () => {
    const righe = [rigaConIdTesto('a'), rigaConIdTesto('b'), rigaConIdTesto('c')];

    collegaRigheDuplicateAllaSorgente(righe);

    expect(righe.map((r) => r.controls.sourceDocumentLineId.value)).toEqual(['a', 'b', 'c']);
  });

  /*
    ⛔ Una riga VUOTA — quella che ogni maschera tiene in fondo — non deriva da
    niente: darle un riferimento vuoto la farebbe sembrare derivata, e il server
    andrebbe a cercare una riga che non esiste.
  */
  it('⛔ una riga senza id non acquisisce un riferimento vuoto', () => {
    const riga = rigaConIdTesto('');

    collegaRigheDuplicateAllaSorgente([riga]);

    expect(riga.controls.sourceDocumentLineId.value).toBeNull();
  });

  /*
    ⚠️ La funzione riceve i controlli di un FormArray, e non tutte le maschere
    hanno gli stessi campi. Una riga che non dichiara i due controlli si salta:
    non è un errore da far esplodere in faccia a chi duplica.
  */
  it('⚠️ una riga senza i controlli attesi viene saltata, non fa esplodere nulla', () => {
    const estranea = new FormGroup({ quantity: new FormControl(1) });

    expect(() => collegaRigheDuplicateAllaSorgente([estranea])).not.toThrow();
  });
});

describe('scollegaRigaDallaSorgente', () => {
  /*
    ⛔ Tenere il riferimento dopo un cambio d'articolo farebbe copiare al server
    l'identità del prodotto di PRIMA sopra quello appena scelto: la riga direbbe
    il nome di un altro articolo.
  */
  it('⛔ azzera il riferimento: la riga non deriva più da nulla', () => {
    const riga = new FormGroup({
      id: new FormControl(''),
      sourceDocumentLineId: new FormControl<string | null>('riga-1'),
    });

    scollegaRigaDallaSorgente(riga);

    expect(riga.controls.sourceDocumentLineId.value).toBeNull();
  });

  it("⭐ non tocca l'id: quello dice un'altra cosa", () => {
    const riga = new FormGroup({
      id: new FormControl('riga-esistente'),
      sourceDocumentLineId: new FormControl<string | null>('riga-1'),
    });

    scollegaRigaDallaSorgente(riga);

    expect(riga.controls.id.value).toBe('riga-esistente');
  });

  it('⚠️ su una riga senza il controllo non fa nulla e non esplode', () => {
    const estranea = new FormGroup({ quantity: new FormControl(1) });

    expect(() => scollegaRigaDallaSorgente(estranea)).not.toThrow();
  });
});
