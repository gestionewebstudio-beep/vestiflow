/**
 * Il contratto: **nove voci**, tutte fornite dalla maschera.
 *
 * Ogni voce esiste perché è ciò che DIFFERISCE fra Ordine cliente, Arrivo merce
 * e Ordine fornitore. Il resto — il giro del Tab, la conservazione della
 * colonna, lo scavalco delle righe non attraversabili — è identico, e sta nella
 * classe. Se un giorno una voce servisse a una maschera sola e per le altre
 * fosse sempre lo stesso valore, quella voce è di troppo.
 */
export interface DocumentLineFocusContract<F extends string> {
  /**
   * 1 — I campi nell'ordine di attraversamento, sinistra→destra.
   *
   * Arriva da fuori **come dato**, e non è un dettaglio: è ciò che tiene aperta
   * la porta allo spostamento colonne (specifica §4.7). Se un domani l'ordine
   * diventerà quello scelto dall'operatore, gli si passerà un array diverso e
   * la navigazione non si tocca.
   */
  readonly fields: readonly F[];

  /**
   * 2 — L'identificativo DOM di (riga, campo). Una funzione, non un prefisso:
   * i suffissi sono irregolari dentro la stessa maschera (`co-price-` ma
   * `gr-selling-`, `co-serials-` ma `gr-serial-` al singolare), quindi
   * «prefisso + indice» non basta.
   *
   * ⚠️ È anche il punto dove si risolverà il difetto delle **due viste vive**
   * (mappa §2.3): sotto il breakpoint la tabella desktop non è rimossa ma
   * nascosta, quindi oggi «l'id della riga i, campo x» non è univoco. La classe
   * non lo sa e non deve saperlo: chiede l'id a chi lo conosce.
   */
  readonly elementId: (lineIndex: number, field: F) => string;

  /**
   * 3 — Il campo è attraversabile su quella riga? Assorbe tre cose che le
   * maschere calcolano diversamente: colonna nascosta dal selettore, riga
   * collegata a un articolo (i codici diventano testo), esclusioni proprie.
   */
  readonly isFieldEnabled: (lineIndex: number, field: F) => boolean;

  /**
   * 4 — La riga non è una fermata: si scavalca in entrambi i versi. Serve al
   * solo Ordine cliente, per le righe «documento collegato», che non rendono
   * nessun controllo del giro.
   */
  readonly isRowSkipped?: (lineIndex: number) => boolean;

  /** 5 — Documento bloccato: niente creazione e niente cambio riga. */
  readonly isReadOnly: () => boolean;

  /** 6 — Quante righe ci sono adesso. */
  readonly lineCount: () => number;

  /** 7 — Aggiunge una riga in fondo. Il corpo differisce in tutte e tre. */
  readonly createLine: () => void;

  /**
   * 8 — Gancio su **ogni cambio riga**, non solo sull'uscita in avanti: in
   * Arrivo merce `commitLineAndSave` avvolge tanto la discesa quanto la
   * risalita, e scriverlo come «uscita» produce un'implementazione che funziona
   * in una direzione sola — difetto che si vedrebbe solo risalendo con ↑, il
   * gesto meno provato.
   *
   * È anche **dove vive il tempismo del fuoco**. Riceve `(riga, poi)` e decide
   * quando chiamare `poi`: Arrivo merce a collegamento avvenuto, le altre due
   * rimandando di un tick, che è quello che oggi fanno col loro `setTimeout`
   * esplicito. Così **questa classe non possiede nessun timer** — il chiamante è
   * l'unico che sa quando la riga nuova è stata resa (specifica §4.5-bis).
   *
   * Assente = si prosegue subito.
   */
  readonly onRowChange?: (lineIndex: number, then: () => void) => void;

  /**
   * 9 — La riga è vuota? Decide se ↓ in fondo crea o non fa nulla. In Ordine
   * fornitore non esiste e va scritto: «riga vuota» lì significa nessun
   * articolo selezionato.
   */
  readonly isLineEmpty: (lineIndex: number) => boolean;
}

/**
 * Il giro del fuoco fra i campi di una riga documento: Tab, Shift+Tab, ↑, ↓.
 *
 * Esiste perché la stessa logica era **riscritta in tre maschere** — sette
 * metodi per tre, circa seicento righe — e già divergeva: le frecce funzionavano
 * solo in una, la guardia di sola-lettura mancava in un'altra, un identificativo
 * puntava a un elemento che non esiste. Continuare a deciderla schermata per
 * schermata produce la quarta variante, non l'uniformità.
 *
 * **Generica sul campo, e non è pedanteria.** I tre insiemi non sono annidati:
 * `unitPrice` esiste solo in Ordine cliente, lotto e scadenza solo in Arrivo
 * merce. Un'unione piatta di tutti i campi farebbe compilare
 * `focusField(i, 'lot')` dentro Ordine cliente, e il compilatore smetterebbe di
 * essere la rete proprio dove serve.
 *
 * **Classe-campo, non service iniettabile**: nessuna dipendenza e un'istanza per
 * maschera, come `DocumentProductPanelStore` e `DocumentCodeLookupStore`.
 *
 * **Entrate nominali, non solo un gestore di tastiera.** Le celle di riga
 * condivise non consegnano l'evento: decidono da sole ed emettono esiti
 * (`lineRowAdvance`, `lineRowRetreat`, `commit`). Perciò `next`, `previous`,
 * `rowDown`, `rowUp` e `focusField` sono pubbliche e chiamabili per nome.
 */
export class DocumentLineFocusStore<F extends string> {
  constructor(private readonly contract: DocumentLineFocusContract<F>) {}

  /** I campi attraversabili di quella riga, nell'ordine ricevuto. */
  fieldsOf(lineIndex: number): readonly F[] {
    return this.contract.fields.filter((field) => this.contract.isFieldEnabled(lineIndex, field));
  }

  focusField(lineIndex: number, field: F): void {
    const id = this.contract.elementId(lineIndex, field);
    globalThis.document.getElementById(id)?.focus();
  }

  focusFirstField(lineIndex: number): void {
    const first = this.fieldsOf(lineIndex)[0];
    if (first !== undefined) {
      this.focusField(lineIndex, first);
    }
  }

  focusLastField(lineIndex: number): void {
    const fields = this.fieldsOf(lineIndex);
    const last = fields[fields.length - 1];
    if (last !== undefined) {
      this.focusField(lineIndex, last);
    }
  }

  /** Tab: campo successivo; dall'ultimo, prima cella della riga sotto. */
  next(lineIndex: number, field: F): void {
    const order = this.fieldsOf(lineIndex);
    const position = order.indexOf(field);
    const following = position >= 0 ? order[position + 1] : undefined;
    if (following !== undefined) {
      this.focusField(lineIndex, following);
      return;
    }
    this.advanceToNextRow(lineIndex);
  }

  /** Shift+Tab: campo precedente; dal primo, ultima cella della riga sopra. */
  previous(lineIndex: number, field: F): void {
    const order = this.fieldsOf(lineIndex);
    const position = order.indexOf(field);
    const preceding = position > 0 ? order[position - 1] : undefined;
    if (preceding !== undefined) {
      this.focusField(lineIndex, preceding);
      return;
    }
    const above = this.traversableRow(lineIndex - 1, -1);
    if (above === null) {
      return;
    }
    this.withRowChange(lineIndex, () => this.focusLastField(above));
  }

  /**
   * ↓ — **conserva la colonna**: da «Prezzo» si va su «Prezzo». In fondo crea
   * una riga solo se quella corrente ha contenuto; sulla riga vuota appena
   * creata non fa nulla, altrimenti tenere premuto ↓ produrrebbe una pila di
   * righe vuote.
   */
  rowDown(lineIndex: number, field: F): void {
    if (this.contract.isReadOnly()) {
      return;
    }
    const below = this.traversableRow(lineIndex + 1, 1);
    if (below !== null) {
      this.withRowChange(lineIndex, () => this.focusSameColumn(below, field));
      return;
    }
    if (this.contract.isLineEmpty(lineIndex)) {
      return;
    }
    this.createRowAndFocus(lineIndex);
  }

  /** ↑ — conserva la colonna. Sulla prima riga non fa nulla. */
  rowUp(lineIndex: number, field: F): void {
    if (this.contract.isReadOnly()) {
      return;
    }
    const above = this.traversableRow(lineIndex - 1, -1);
    if (above === null) {
      return;
    }
    this.withRowChange(lineIndex, () => this.focusSameColumn(above, field));
  }

  /**
   * Tab / Shift+Tab / ↑ / ↓ / Invio dai campi che consegnano l'evento (quelli
   * che non sono celle condivise).
   *
   * **Invio registra e resta** (specifica §4.5): qui non fa nient'altro che
   * fermare l'evento — che dentro un `<form>` serve anche a impedire l'invio
   * implicito. Registrare il valore, dove c'è qualcosa da registrare, è ormai
   * lavoro delle celle, che decidono da sole.
   *
   * `Ctrl`+frecce **non** passa di qui: lo spostamento della riga resta nella
   * maschera che ce l'ha, fuori dal contratto.
   */
  handleKeydown(lineIndex: number, field: F, event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      return;
    }
    if (event.key === 'ArrowDown' && !event.shiftKey) {
      event.preventDefault();
      this.rowDown(lineIndex, field);
      return;
    }
    if (event.key === 'ArrowUp' && !event.shiftKey) {
      event.preventDefault();
      this.rowUp(lineIndex, field);
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    if (event.shiftKey) {
      // Prima cella della prima riga: si lascia al browser l'uscita dalla
      // tabella, o l'operatore resterebbe chiuso dentro il documento.
      if (lineIndex === 0 && this.fieldsOf(lineIndex).indexOf(field) <= 0) {
        return;
      }
      event.preventDefault();
      this.previous(lineIndex, field);
      return;
    }
    event.preventDefault();
    this.next(lineIndex, field);
  }

  /**
   * Tab dall'ultimo campo. Vale la **stessa** regola di ↓ sulla creazione: una
   * riga nuova solo se quella corrente ha contenuto.
   *
   * ⚠️ È un cambio rispetto a oggi, da dichiarare: le tre maschere creano
   * sempre, anche attraversando col Tab una riga vuota. La regola «si crea solo
   * se c'è contenuto» è scritta nella specifica per ↓ (§4.4) e non per il Tab,
   * ma il gesto è lo stesso — nasce una riga in fondo — e due regole diverse per
   * lo stesso effetto sono la divergenza che questo lavoro toglie.
   */
  private advanceToNextRow(lineIndex: number): void {
    if (this.contract.isReadOnly()) {
      return;
    }
    const below = this.traversableRow(lineIndex + 1, 1);
    if (below !== null) {
      this.withRowChange(lineIndex, () => this.focusFirstField(below));
      return;
    }
    if (this.contract.isLineEmpty(lineIndex)) {
      return;
    }
    this.createRowAndFocus(lineIndex);
  }

  /**
   * La riga nuova nasce **dentro** il gancio, non prima: è il gancio a sapere
   * quando il DOM è pronto, e il fuoco deve arrivare dopo il render.
   *
   * Il fuoco va al primo campo — «da sinistra» — anche venendo da ↓, che
   * altrove conserva la colonna: su una riga che non esisteva ancora non c'è
   * una colonna da conservare, e si ricomincia da capo.
   */
  private createRowAndFocus(lineIndex: number): void {
    this.withRowChange(lineIndex, () => {
      this.contract.createLine();
      this.focusFirstField(this.contract.lineCount() - 1);
    });
  }

  /**
   * Stessa colonna se quella riga ce l'ha; altrimenti il suo primo campo.
   *
   * ⚠️ Il ripiego non è nella specifica, che descrive solo lo scavalco della
   * riga non attraversabile (§4.4). Serve lo stesso: la riga sotto può avere
   * quel campo disabilitato — una riga collegata a un articolo ha i codici come
   * testo — e senza ripiego il fuoco si perderebbe, che è il difetto da cui
   * questo lavoro è partito.
   */
  private focusSameColumn(lineIndex: number, field: F): void {
    if (this.contract.isFieldEnabled(lineIndex, field)) {
      this.focusField(lineIndex, field);
      return;
    }
    this.focusFirstField(lineIndex);
  }

  /** La prima riga attraversabile da `start` nella direzione data, o `null`. */
  private traversableRow(start: number, step: 1 | -1): number | null {
    const skipped = this.contract.isRowSkipped;
    for (let row = start; row >= 0 && row < this.contract.lineCount(); row += step) {
      if (!skipped?.(row)) {
        return row;
      }
    }
    return null;
  }

  private withRowChange(lineIndex: number, then: () => void): void {
    const hook = this.contract.onRowChange;
    if (hook) {
      hook(lineIndex, then);
      return;
    }
    then();
  }
}
