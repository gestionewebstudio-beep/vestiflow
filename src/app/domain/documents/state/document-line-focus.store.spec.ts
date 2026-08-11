import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DocumentLineFocusStore,
  type DocumentLineFocusContract,
} from './document-line-focus.store';

type Campo = 'code' | 'name' | 'qty' | 'price';

const CAMPI: readonly Campo[] = ['code', 'name', 'qty', 'price'];

/**
 * Il fuoco si prova sul DOM vero, non su una spia: `focus()` su un elemento che
 * non esiste è un no-op **silenzioso**, ed è esattamente il difetto che questa
 * classe deve smettere di produrre. Con elementi veri, un identificativo
 * sbagliato lascia il fuoco dov'era e il test lo vede.
 */
function montaGriglia(righe: number, campi: readonly Campo[] = CAMPI): void {
  for (let riga = 0; riga < righe; riga += 1) {
    for (const campo of campi) {
      const input = globalThis.document.createElement('input');
      input.id = `r${riga}-${campo}`;
      globalThis.document.body.appendChild(input);
    }
  }
}

function fuoco(): string {
  return globalThis.document.activeElement?.id ?? '';
}

interface Opzioni {
  readonly righe?: number;
  readonly campoAbilitato?: (riga: number, campo: Campo) => boolean;
  readonly rigaScavalcata?: (riga: number) => boolean;
  /** Booleano, oppure una funzione se il test deve cambiarlo in corsa. */

  readonly solaLettura?: boolean | (() => boolean);
  readonly rigaVuota?: (riga: number) => boolean;
  readonly campi?: readonly Campo[];
  readonly gancio?: DocumentLineFocusContract<Campo>['onRowChange'];
}

function crea(opzioni: Opzioni = {}) {
  const stato = { righe: opzioni.righe ?? 2 };
  const createLine = vi.fn(() => {
    stato.righe += 1;
    montaSoloRiga(stato.righe - 1);
  });
  const removeLine = vi.fn((riga: number) => {
    stato.righe -= 1;
    for (const campo of CAMPI) {
      globalThis.document.getElementById(`r${riga}-${campo}`)?.remove();
    }
  });
  const contratto: DocumentLineFocusContract<Campo> = {
    fields: opzioni.campi ?? CAMPI,
    elementId: (riga, campo) => `r${riga}-${campo}`,
    isFieldEnabled: opzioni.campoAbilitato ?? (() => true),
    isRowSkipped: opzioni.rigaScavalcata,
    isReadOnly: () =>
      typeof opzioni.solaLettura === 'function'
        ? opzioni.solaLettura()
        : (opzioni.solaLettura ?? false),
    lineCount: () => stato.righe,
    createLine,
    onRowChange: opzioni.gancio,
    isLineEmpty: opzioni.rigaVuota ?? (() => false),
    removeLine,
  };
  montaGriglia(stato.righe, opzioni.campi ?? CAMPI);
  return { store: new DocumentLineFocusStore(contratto), createLine, removeLine, stato };
}

function montaSoloRiga(riga: number): void {
  for (const campo of CAMPI) {
    const input = globalThis.document.createElement('input');
    input.id = `r${riga}-${campo}`;
    globalThis.document.body.appendChild(input);
  }
}

describe('DocumentLineFocusStore', () => {
  afterEach(() => {
    globalThis.document.body.innerHTML = '';
  });

  // §4.7: l'ordine arriva da fuori come dato. È ciò che tiene aperta la porta
  // allo spostamento colonne senza riscrivere la navigazione.
  it('l’ordine ricevuto comanda: il Tab lo segue, non l’ordine di dichiarazione', () => {
    const { store } = crea({ campi: ['qty', 'code'] });

    store.next(0, 'qty');

    expect(fuoco()).toBe('r0-code');
  });

  it('un campo disabilitato non è una fermata: il Tab lo scavalca', () => {
    const { store } = crea({ campoAbilitato: (_riga, campo) => campo !== 'name' });

    store.next(0, 'code');

    expect(fuoco()).toBe('r0-qty');
  });

  // §4.1: si entra col valore selezionato, pronto da sovrascrivere. Senza,
  // richiamando un articolo il fuoco arrivava sulla quantità ma per cambiarla
  // bisognava prima cancellare l'«1» che c'era.
  it('entrando in un campo ne seleziona il valore', () => {
    const { store } = crea({ righe: 1 });
    const campo = globalThis.document.getElementById('r0-qty') as HTMLInputElement;
    campo.value = '12';

    store.focusField(0, 'qty');

    expect(fuoco()).toBe('r0-qty');
    expect(campo.selectionStart).toBe(0);
    expect(campo.selectionEnd).toBe(2);
  });

  it('la mappa si interroga per campo, non per prefisso', () => {
    const contratto: DocumentLineFocusContract<Campo> = {
      fields: CAMPI,
      // Suffissi irregolari come nelle maschere vere: `gr-serial-` al singolare
      // accanto a `co-serials-`. Un prefisso + indice non basterebbe.
      elementId: (riga, campo) => (campo === 'price' ? `riga${riga}-prezzo` : `r${riga}-${campo}`),
      isFieldEnabled: () => true,
      isReadOnly: () => false,
      lineCount: () => 1,
      createLine: vi.fn(),
      isLineEmpty: () => false,
      removeLine: vi.fn(),
    };
    const input = globalThis.document.createElement('input');
    input.id = 'riga0-prezzo';
    globalThis.document.body.appendChild(input);

    new DocumentLineFocusStore(contratto).focusField(0, 'price');

    expect(fuoco()).toBe('riga0-prezzo');
  });

  // §4.4, ed è il cambio di firma da dichiarare: oggi ↓ va SEMPRE alla prima
  // cella della riga sotto, in tutte e tre le maschere.
  it('↓ conserva la colonna: da «prezzo» si va su «prezzo»', () => {
    const { store } = crea({ righe: 2 });

    store.rowDown(0, 'price');

    expect(fuoco()).toBe('r1-price');
  });

  it('↓ sull’ultima riga con contenuto crea la riga e ci mette il fuoco da sinistra', () => {
    const { store, createLine } = crea({ righe: 1, rigaVuota: () => false });

    store.rowDown(0, 'price');

    expect(createLine).toHaveBeenCalledTimes(1);
    // Da sinistra, non sulla colonna di partenza: su una riga che non esisteva
    // non c'è una colonna da conservare.
    expect(fuoco()).toBe('r1-code');
  });

  // Il controllo inverso del precedente: senza, tenere premuto ↓ produrrebbe
  // una pila di righe vuote.
  it('↓ sulla riga vuota appena creata non fa nulla', () => {
    const { store, createLine } = crea({ righe: 1, rigaVuota: () => true });

    store.rowDown(0, 'price');

    expect(createLine).not.toHaveBeenCalled();
    expect(fuoco()).toBe('');
  });

  it('↑ sulla prima riga non fa nulla', () => {
    const { store } = crea({ righe: 2 });

    store.rowUp(0, 'price');

    expect(fuoco()).toBe('');
  });

  // Voce 4: la riga «documento collegato» non è una fermata. In entrambi i
  // versi, o risalendo il fuoco ci finirebbe sopra e morirebbe lì.
  it('la riga scavalcata si supera in entrambi i versi', () => {
    const { store } = crea({ righe: 3, rigaScavalcata: (riga) => riga === 1 });

    store.rowDown(0, 'qty');
    expect(fuoco()).toBe('r2-qty');

    store.rowUp(2, 'qty');
    expect(fuoco()).toBe('r0-qty');
  });

  it('in sola lettura non si crea niente e non ci si sposta di riga', () => {
    const { store, createLine } = crea({ righe: 1, solaLettura: true });

    store.rowDown(0, 'price');
    store.rowUp(0, 'price');

    expect(createLine).not.toHaveBeenCalled();
    expect(fuoco()).toBe('');
  });

  // Voce 8. Il gancio è ciò che oggi, in Arrivo merce, collega i codici alla
  // variante prima che il fuoco si sposti — e nelle altre due è il rinvio di un
  // tick che lascia rendere la riga nuova. Se girasse dopo, il fuoco andrebbe
  // su una riga non ancora resa: no-op silenzioso.
  it('il gancio di cambio riga gira PRIMA del fuoco, e in entrambe le direzioni', () => {
    const ordine: string[] = [];
    const { store } = crea({
      righe: 2,
      gancio: (riga, poi) => {
        ordine.push(`gancio:${riga}`);
        poi();
      },
    });

    store.rowDown(0, 'qty');
    ordine.push(`fuoco:${fuoco()}`);
    store.rowUp(1, 'qty');
    ordine.push(`fuoco:${fuoco()}`);

    expect(ordine).toEqual(['gancio:0', 'fuoco:r1-qty', 'gancio:1', 'fuoco:r0-qty']);
  });

  it('Shift+Tab dal primo campo va all’ultimo della riga sopra, scavalcando', () => {
    const { store } = crea({ righe: 3, rigaScavalcata: (riga) => riga === 1 });

    store.previous(2, 'code');

    expect(fuoco()).toBe('r0-price');
  });

  it('Shift+Tab dal primo campo della prima riga non muove niente', () => {
    const { store } = crea({ righe: 2 });

    store.previous(0, 'code');

    expect(fuoco()).toBe('');
  });

  // Tab dall'ultimo campo: prima cella della riga sotto, non stessa colonna.
  it('Tab dall’ultimo campo scende alla prima cella della riga sotto', () => {
    const { store } = crea({ righe: 2 });

    store.next(0, 'price');

    expect(fuoco()).toBe('r1-code');
  });

  it('Tab dall’ultimo campo dell’ultima riga con contenuto crea la riga', () => {
    const { store, createLine } = crea({ righe: 1, rigaVuota: () => false });

    store.next(0, 'price');

    expect(createLine).toHaveBeenCalledTimes(1);
    expect(fuoco()).toBe('r1-code');
  });

  // ⚠️ Cambio dichiarato: oggi tutte e tre creano SEMPRE, anche attraversando
  // col Tab una riga vuota. La regola della creazione è una sola, e vale per
  // qualunque gesto la produca.
  it('Tab dall’ultimo campo di una riga vuota non crea niente', () => {
    const { store, createLine } = crea({ righe: 1, rigaVuota: () => true });

    store.next(0, 'price');

    expect(createLine).not.toHaveBeenCalled();
    expect(fuoco()).toBe('');
  });

  it('in sola lettura nemmeno il Tab dall’ultimo campo crea una riga', () => {
    const { store, createLine } = crea({ righe: 1, solaLettura: true });

    store.next(0, 'price');

    expect(createLine).not.toHaveBeenCalled();
  });

  // Il ripiego che la specifica non copre: la riga sotto può avere quel campo
  // disabilitato — una riga collegata a un articolo ha i codici come testo — e
  // senza ripiego il fuoco si perderebbe, che è il difetto di partenza.
  it('↓ verso una riga che non ha quella colonna ripiega sul suo primo campo', () => {
    const { store } = crea({
      righe: 2,
      campoAbilitato: (riga, campo) => !(riga === 1 && campo === 'price'),
    });

    store.rowDown(0, 'price');

    expect(fuoco()).toBe('r1-code');
  });

  it('un campo fuori dal giro non manda il fuoco da nessuna parte', () => {
    const { store } = crea({ righe: 2, campoAbilitato: (_riga, campo) => campo !== 'name' });

    // 'name' non è nel giro di quella riga: non ha un «successivo».
    store.next(0, 'name');

    expect(fuoco()).toBe('r1-code');
  });

  describe('handleKeydown', () => {
    function tasto(key: string, modificatori: Partial<KeyboardEventInit> = {}): KeyboardEvent {
      return new KeyboardEvent('keydown', { key, cancelable: true, ...modificatori });
    }

    // §4.5: Invio registra e RESTA. Non naviga, non crea, non salva. Il
    // preventDefault serve anche a impedire l'invio implicito del form.
    it('Invio non muove il fuoco, ma ferma l’evento', () => {
      const { store, createLine } = crea({ righe: 1 });
      const evento = tasto('Enter');

      store.handleKeydown(0, 'code', evento);

      expect(evento.defaultPrevented).toBe(true);
      expect(fuoco()).toBe('');
      expect(createLine).not.toHaveBeenCalled();
    });

    it('Shift+Tab sulla prima cella della prima riga lascia uscire il browser', () => {
      const { store } = crea({ righe: 2 });
      const evento = tasto('Tab', { shiftKey: true });

      store.handleKeydown(0, 'code', evento);

      // Non fermato: senza questa scappatoia l'operatore resta chiuso dentro
      // la tabella e non raggiunge più il resto della maschera.
      expect(evento.defaultPrevented).toBe(false);
      expect(fuoco()).toBe('');
    });

    it('Tab sposta al campo successivo e ferma l’evento', () => {
      const { store } = crea({ righe: 2 });
      const evento = tasto('Tab');

      store.handleKeydown(0, 'code', evento);

      expect(evento.defaultPrevented).toBe(true);
      expect(fuoco()).toBe('r0-name');
    });

    it('Shift+Tab dentro la riga torna al campo precedente', () => {
      const { store } = crea({ righe: 2 });
      const evento = tasto('Tab', { shiftKey: true });

      store.handleKeydown(0, 'name', evento);

      expect(evento.defaultPrevented).toBe(true);
      expect(fuoco()).toBe('r0-code');
    });

    it('↓ e ↑ cambiano riga conservando la colonna', () => {
      const { store } = crea({ righe: 2 });

      const giu = tasto('ArrowDown');
      store.handleKeydown(0, 'qty', giu);
      expect(giu.defaultPrevented).toBe(true);
      expect(fuoco()).toBe('r1-qty');

      const su = tasto('ArrowUp');
      store.handleKeydown(1, 'qty', su);
      expect(su.defaultPrevented).toBe(true);
      expect(fuoco()).toBe('r0-qty');
    });

    // Shift+frecce è la selezione del testo: non deve diventare navigazione.
    it('Shift+↓ non è un cambio riga', () => {
      const { store } = crea({ righe: 2 });
      const evento = tasto('ArrowDown', { shiftKey: true });

      store.handleKeydown(0, 'qty', evento);

      expect(evento.defaultPrevented).toBe(false);
      expect(fuoco()).toBe('');
    });

    it('un tasto qualunque passa senza essere toccato', () => {
      const { store } = crea({ righe: 2 });
      const evento = tasto('a');

      store.handleKeydown(0, 'qty', evento);

      expect(evento.defaultPrevented).toBe(false);
      expect(fuoco()).toBe('');
    });

    // `Ctrl`+frecce sposta la RIGA in Arrivo merce, ed è l'unica maschera che
    // ce l'ha: resta fuori dal contratto, quindi la classe non deve mangiarlo.
    it('Ctrl+↓ non viene intercettato: lo spostamento riga resta alla maschera', () => {
      const { store } = crea({ righe: 2 });
      const evento = tasto('ArrowDown', { ctrlKey: true });

      store.handleKeydown(0, 'qty', evento);

      expect(evento.defaultPrevented).toBe(false);
      expect(fuoco()).toBe('');
    });
  });

  // §4.2 — le frecce orizzontali sono a due tempi: prima il cursore dentro il
  // campo, poi il campo accanto. Il cursore va simulato perché in un evento
  // costruito a mano il bersaglio non c'è.
  describe('frecce ←/→ a due tempi', () => {
    function tastoSuCampo(key: string, campo: Partial<HTMLInputElement>): KeyboardEvent {
      const evento = new KeyboardEvent('keydown', { key, cancelable: true });
      Object.defineProperty(evento, 'target', { value: campo });
      return evento;
    }

    const inMezzo = { value: 'Maglietta', selectionStart: 4, selectionEnd: 4 };
    const inFondo = { value: 'Maglietta', selectionStart: 9, selectionEnd: 9 };
    const inTesta = { value: 'Maglietta', selectionStart: 0, selectionEnd: 0 };

    it('→ col cursore in mezzo resta nel campo', () => {
      const { store } = crea();
      const evento = tastoSuCampo('ArrowRight', inMezzo);
      store.handleKeydown(0, 'code', evento);
      expect(evento.defaultPrevented).toBe(false);
      expect(fuoco()).toBe('');
    });

    it('→ col cursore in fondo porta al campo accanto', () => {
      const { store } = crea();
      store.handleKeydown(0, 'code', tastoSuCampo('ArrowRight', inFondo));
      expect(fuoco()).toBe('r0-name');
    });

    it('← col cursore in mezzo resta nel campo', () => {
      const { store } = crea();
      const evento = tastoSuCampo('ArrowLeft', inMezzo);
      store.handleKeydown(0, 'name', evento);
      expect(evento.defaultPrevented).toBe(false);
      expect(fuoco()).toBe('');
    });

    it('← col cursore in testa torna al campo precedente', () => {
      const { store } = crea();
      store.handleKeydown(0, 'name', tastoSuCampo('ArrowLeft', inTesta));
      expect(fuoco()).toBe('r0-code');
    });

    it('→ dall’ultimo campo crea la riga, come Tab e ↓', () => {
      const { store, createLine } = crea({ righe: 1 });
      store.handleKeydown(0, 'price', tastoSuCampo('ArrowRight', inFondo));
      expect(createLine).toHaveBeenCalledTimes(1);
      expect(fuoco()).toBe('r1-code');
    });

    it('→ dall’ultimo campo di una riga vuota non crea niente: stessa condizione di ↓', () => {
      const { store, createLine } = crea({ righe: 1, rigaVuota: () => true });
      store.handleKeydown(0, 'price', tastoSuCampo('ArrowRight', inFondo));
      expect(createLine).not.toHaveBeenCalled();
    });

    it('→ esce subito da un campo numerico, dove il cursore non è leggibile', () => {
      const { store } = crea();
      const numerico = { value: '1234', selectionStart: null, selectionEnd: null };
      store.handleKeydown(0, 'qty', tastoSuCampo('ArrowRight', numerico));
      expect(fuoco()).toBe('r0-price');
    });

    it('Shift+→ non naviga: resta la selezione del testo', () => {
      const { store } = crea();
      const evento = new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        shiftKey: true,
        cancelable: true,
      });
      Object.defineProperty(evento, 'target', { value: inFondo });
      store.handleKeydown(0, 'code', evento);
      expect(evento.defaultPrevented).toBe(false);
      expect(fuoco()).toBe('');
    });
  });

  // §4.4, terza parte — la simmetrica della creazione.
  describe('la riga appena nata e mai compilata sparisce risalendo', () => {
    it('↑ toglie la riga nata scendendo e rimasta vuota', () => {
      const { store, removeLine, stato } = crea({ righe: 1, rigaVuota: (riga) => riga === 1 });
      store.rowDown(0, 'qty');
      expect(stato.righe).toBe(2);
      store.rowUp(1, 'code');
      expect(removeLine).toHaveBeenCalledWith(1);
      expect(stato.righe).toBe(1);
      expect(fuoco()).toBe('r0-code');
    });

    it('↑ non tocca una riga vuota che nessuno ha creato scendendo', () => {
      const { store, removeLine } = crea({ righe: 2, rigaVuota: (riga) => riga === 1 });
      store.rowUp(1, 'qty');
      expect(removeLine).not.toHaveBeenCalled();
      expect(fuoco()).toBe('r0-qty');
    });

    it('↑ non tocca la riga nata se ci è stato scritto qualcosa', () => {
      let compilata = false;
      const { store, removeLine } = crea({
        righe: 1,
        rigaVuota: (riga) => riga === 1 && !compilata,
      });
      store.rowDown(0, 'qty');
      compilata = true;
      store.rowUp(1, 'qty');
      expect(removeLine).not.toHaveBeenCalled();
      expect(fuoco()).toBe('r0-qty');
    });

    it('↑ non tocca la riga nata se nel frattempo non è più l’ultima', () => {
      const { store, removeLine, stato } = crea({ righe: 1, rigaVuota: (riga) => riga >= 1 });
      store.rowDown(0, 'qty');
      stato.righe += 1;
      montaSoloRiga(2);
      store.rowUp(1, 'qty');
      expect(removeLine).not.toHaveBeenCalled();
    });

    it('il segno si consuma: due risalite non tolgono due righe', () => {
      const { store, removeLine } = crea({ righe: 1, rigaVuota: (riga) => riga >= 1 });
      store.rowDown(0, 'qty');
      store.rowUp(1, 'qty');
      store.rowUp(1, 'qty');
      expect(removeLine).toHaveBeenCalledTimes(1);
    });

    it('la riga nata col Tab sparisce allo stesso modo', () => {
      const { store, removeLine, stato } = crea({ righe: 1, rigaVuota: (riga) => riga === 1 });
      store.next(0, 'price');
      expect(stato.righe).toBe(2);
      store.rowUp(1, 'code');
      expect(removeLine).toHaveBeenCalledWith(1);
    });

    it('a documento in sola lettura non si toglie niente', () => {
      const { store, removeLine } = crea({
        righe: 2,
        rigaVuota: (riga) => riga === 1,
        solaLettura: true,
      });
      store.rowUp(1, 'qty');
      expect(removeLine).not.toHaveBeenCalled();
    });

    // La regola descrive l'EFFETTO — andarsene risalendo a mani vuote — non un
    // tasto. Le tre vie di uscita verso l'alto devono fare la stessa cosa.
    it('Shift+Tab dal primo campo toglie la riga come ↑', () => {
      const { store, removeLine, stato } = crea({ righe: 1, rigaVuota: (riga) => riga === 1 });
      store.rowDown(0, 'qty');
      store.previous(1, 'code');
      expect(removeLine).toHaveBeenCalledWith(1);
      expect(stato.righe).toBe(1);
      expect(fuoco()).toBe('r0-price');
    });

    it('Shift+Tab da un campo interno non tocca niente: non si sta uscendo dalla riga', () => {
      const { store, removeLine } = crea({ righe: 1, rigaVuota: (riga) => riga === 1 });
      store.rowDown(0, 'qty');
      store.previous(1, 'qty');
      expect(removeLine).not.toHaveBeenCalled();
      expect(fuoco()).toBe('r1-name');
    });

    // Il documento si blocca DOPO che la riga è nata: se il blocco arrivasse
    // prima, la riga non esisterebbe e il test passerebbe anche senza guardia.
    it('Shift+Tab non toglie righe da un documento in sola lettura', () => {
      let bloccato = false;
      const { store, removeLine, stato } = crea({
        righe: 1,
        rigaVuota: (riga) => riga === 1,
        solaLettura: () => bloccato,
      });
      store.rowDown(0, 'qty');
      bloccato = true;
      store.previous(1, 'code');
      expect(removeLine).not.toHaveBeenCalled();
      expect(stato.righe).toBe(2);
      expect(fuoco()).toBe('r0-price');
    });
  });
});
