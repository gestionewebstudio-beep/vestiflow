import { caretAtEdge } from '@domain/documents/utils/caret-edge.util';

/**
 * Il contratto: **dieci voci**, tutte fornite dalla maschera.
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
   * Arrivo merce `linkLineCodesThen` avvolge tanto la discesa quanto la
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

  /**
   * 10 — Toglie una riga. Serve alla sola regola simmetrica della creazione:
   * la riga nata scendendo e mai compilata sparisce se si risale (§4.4).
   *
   * Il contratto passa da nove voci a dieci il 11/08/2026. La voce non è un
   * ripensamento sulle nove: è la terza parte di una regola che ne aveva
   * scritte solo due, e senza di lei la riga di troppo resterebbe lì.
   */
  readonly removeLine: (lineIndex: number) => void;
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
/**
 * Quante volte si torna a cercare la riga nuova nel DOM prima di lasciar
 * perdere. Tre giri d'orologio: uno basta sempre, gli altri due sono per il
 * caso in cui il render arrivi dopo un secondo giro di rilevamento. Un numero
 * finito, non un'attesa aperta: se la riga non compare c'è un difetto altrove,
 * e insistere lo nasconderebbe.
 */
const TENTATIVI_DI_FUOCO = 3;

export class DocumentLineFocusStore<F extends string> {
  /**
   * L'ultima riga **nata dalla navigazione** (Tab, ↓ o → in fondo al giro).
   * Serve a distinguerla da una riga vuota che l'operatore ha lasciato lì di
   * proposito: quella non si tocca. Il segno si consuma appena la riga sparisce
   * o appena ne nasce un'altra.
   */
  private bornRow: number | null = null;

  constructor(private readonly contract: DocumentLineFocusContract<F>) {}

  /** I campi attraversabili di quella riga, nell'ordine ricevuto. */
  fieldsOf(lineIndex: number): readonly F[] {
    return this.contract.fields.filter((field) => this.contract.isFieldEnabled(lineIndex, field));
  }

  // ── Le porte TOLLERANTI ───────────────────────────────────────────────────
  //
  // ⭐ **Accettano un campo di QUALUNQUE documento e ignorano quello che non è
  // loro.** La riga comune (`document-line-row`) è una sola e conosce tutti i
  // campi possibili; ogni maschera ne usa un sottoinsieme.
  //
  // ⛔ Prima il filtro stava FUORI, ricopiato in cinque maschere: ognuna aveva
  // un `campoDiQuestoDocumento` che confrontava l'evento col proprio elenco di
  // campi — cioè con `contract.fields`, che questa classe **già possiede**.
  // Cinque copie di una domanda a cui lo store sapeva rispondere da sé, più
  // otto metodi-ponte per maschera cuciti sopra, cinque volte identici parola
  // per parola: ~250 righe che non facevano altro che rigirare l'evento qui.
  //
  // ⚠️ Non è «un metodo in più per comodità»: è dove il filtro APPARTIENE. Chi
  // possiede l'elenco dei campi è l'unico che può dire se un campo è suo, e
  // tenerlo fuori significava rispondere alla stessa domanda in cinque posti —
  // con cinque occasioni di divergere in silenzio.

  /** Il campo, se appartiene a questo documento; `null` se è di un altro. */
  private proprio(field: string): F | null {
    return (this.contract.fields as readonly string[]).includes(field) ? (field as F) : null;
  }

  nextIfMine(lineIndex: number, field: string): void {
    const proprio = this.proprio(field);
    if (proprio) {
      this.next(lineIndex, proprio);
    }
  }

  previousIfMine(lineIndex: number, field: string): void {
    const proprio = this.proprio(field);
    if (proprio) {
      this.previous(lineIndex, proprio);
    }
  }

  rowDownIfMine(lineIndex: number, field: string): void {
    const proprio = this.proprio(field);
    if (proprio) {
      this.rowDown(lineIndex, proprio);
    }
  }

  rowUpIfMine(lineIndex: number, field: string): void {
    const proprio = this.proprio(field);
    if (proprio) {
      this.rowUp(lineIndex, proprio);
    }
  }

  handleKeydownIfMine(lineIndex: number, field: string, event: KeyboardEvent): void {
    const proprio = this.proprio(field);
    if (proprio) {
      this.handleKeydown(lineIndex, proprio, event);
    }
  }

  /**
   * Porta il fuoco sul campo **e ne seleziona il valore**, pronto da
   * sovrascrivere (specifica §4.1).
   *
   * Senza la selezione, richiamando un articolo il fuoco arrivava sulla
   * quantità ma il cursore restava accanto all'«1» già presente: per cambiarla
   * bisognava cancellare prima. In un gestionale si digita il numero e basta.
   *
   * ⚠️ Si seleziona **all'ingresso da tastiera, non al click** (§4.6): questo
   * metodo lo chiama la navigazione, mai il mouse. La formulazione ingenua
   * «seleziona quando il campo prende il fuoco» cancellerebbe il valore al
   * primo tasto dopo un click a metà cifra.
   */
  focusField(lineIndex: number, field: F): boolean {
    const id = this.contract.elementId(lineIndex, field);
    const element = globalThis.document.getElementById(id);
    if (!element) {
      // Non è un errore: può essere una riga che il DOM non ha ancora. Ma
      // l'esito torna a chi chiama, perché «non ho agganciato niente» e «ho
      // messo il fuoco» smettano di essere la stessa cosa vista da fuori.
      return false;
    }
    element.focus();
    // `select()` esiste solo su input e textarea, e su alcuni tipi di input
    // (number, date) i browser lo rifiutano: si prova, e se non si può si
    // lascia il fuoco dov'è arrivato, che è comunque metà del lavoro.
    const selezionabile = element as Partial<HTMLInputElement>;
    if (typeof selezionabile.select === 'function') {
      try {
        selezionabile.select();
      } catch {
        // Tipo di campo che non ammette la selezione: nulla da fare.
      }
    }
    return true;
  }

  /**
   * Il primo campo della riga — e **aspetta che la riga ci sia**.
   *
   * Quando la riga è appena nata, nel form c'è ma nel DOM no: Angular la
   * disegna al giro di rilevamento successivo. `focus()` su un elemento che
   * non esiste non solleva niente e non fa niente, quindi il difetto si
   * presentava come «la riga si crea, il cursore resta sopra» — su tutte e tre
   * le maschere, e senza un solo test rosso (11/08/2026).
   *
   * Non è un ritardo fisso: si prova subito, e si riprova solo finché
   * l'elemento non c'è. Dove la riga è già resa — il caso normale della
   * navigazione — non cambia niente e non si aspetta nulla.
   *
   * ⚠️ Il tempismo del gancio di riga (voce 8) è un'altra cosa e resta della
   * maschera: quello dice quando si può LASCIARE la riga di partenza; questo
   * quando è arrivata quella di destinazione. Confonderli è ciò che ha
   * prodotto il difetto: il `setTimeout` delle maschere rimandava la
   * creazione, non il fuoco.
   */
  focusFirstField(lineIndex: number): void {
    const first = this.fieldsOf(lineIndex)[0];
    if (first === undefined || this.focusField(lineIndex, first)) {
      return;
    }
    this.focusWhenRendered(lineIndex, first, TENTATIVI_DI_FUOCO);
  }

  private focusWhenRendered(lineIndex: number, field: F, left: number): void {
    if (left <= 0) {
      return;
    }
    setTimeout(() => {
      if (!this.focusField(lineIndex, field)) {
        this.focusWhenRendered(lineIndex, field, left - 1);
      }
    });
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

  /**
   * Shift+Tab: campo precedente; dal primo, ultima cella della riga sopra.
   *
   * Uscendo dalla riga verso l'alto vale la stessa regola di ↑: **la riga
   * appena nata e mai compilata sparisce**. La regola descrive l'effetto —
   * andarsene risalendo senza aver scritto niente — non un tasto: Shift+Tab e
   * ← escono di qui, ↑ da `rowUp`, e devono fare la stessa cosa.
   */
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
    const disposable = this.isDisposableNewRow(lineIndex);
    this.withRowChange(lineIndex, () => {
      if (disposable) {
        this.bornRow = null;
        this.contract.removeLine(lineIndex);
      }
      this.focusLastField(above);
    });
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

  /**
   * ↑ — conserva la colonna. Sulla prima riga non fa nulla.
   *
   * **La riga appena nata e mai compilata sparisce.** È la simmetrica della
   * creazione: se la riga esiste solo perché si è scesi, e si risale senza
   * averci scritto niente, non la si voleva. Sparisce solo quella — non una
   * riga vuota lasciata lì di proposito, che nessuno ha creato scendendo.
   */
  rowUp(lineIndex: number, field: F): void {
    if (this.contract.isReadOnly()) {
      return;
    }
    const above = this.traversableRow(lineIndex - 1, -1);
    if (above === null) {
      return;
    }
    const disposable = this.isDisposableNewRow(lineIndex);
    this.withRowChange(lineIndex, () => {
      if (disposable) {
        this.bornRow = null;
        this.contract.removeLine(lineIndex);
      }
      this.focusSameColumn(above, field);
    });
  }

  /**
   * La riga è quella nata dalla navigazione, è ancora l'ultima, ed è ancora
   * vuota. Tutte e tre servono: se nel frattempo ne sono nate altre sotto, o se
   * qualcosa ci è stato scritto, non è più la riga di troppo.
   *
   * ⚠️ La guardia di **sola lettura sta qui**, non nei chiamanti. `rowUp` ce
   * l'ha già in cima e `previous` no — di proposito, perché su documento
   * bloccato il fuoco deve poter girare lo stesso. Se la condizione non la
   * portasse con sé, Shift+Tab toglierebbe righe da un documento che nessuno
   * può modificare, e il difetto nascerebbe qui ogni volta che si aggiunge un
   * terzo modo di risalire.
   */
  private isDisposableNewRow(lineIndex: number): boolean {
    return (
      !this.contract.isReadOnly() &&
      this.bornRow === lineIndex &&
      lineIndex === this.contract.lineCount() - 1 &&
      this.contract.isLineEmpty(lineIndex)
    );
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
    // ←/→ a due tempi: finché il cursore ha strada dentro il campo, la freccia
    // resta al browser. Al bordo porta al campo accanto — e → dall'ultimo campo
    // crea la riga nuova con la STESSA condizione di Tab e ↓: solo se la riga
    // corrente ha contenuto. Stesso effetto, stessa regola.
    if (event.key === 'ArrowRight' && !event.shiftKey) {
      if (!caretAtEdge(event.target, 'end')) {
        return;
      }
      event.preventDefault();
      this.next(lineIndex, field);
      return;
    }
    if (event.key === 'ArrowLeft' && !event.shiftKey) {
      if (!caretAtEdge(event.target, 'start')) {
        return;
      }
      event.preventDefault();
      this.previous(lineIndex, field);
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
      const born = this.contract.lineCount() - 1;
      this.bornRow = born;
      this.focusFirstField(born);
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
