import { computed, signal } from '@angular/core';

/** Verso del riordino. */
export type DocumentLineSortDirection = 'asc' | 'desc';

/**
 * Il riordino delle righe per contenuto, con l'avviso che lo precede.
 *
 * **Riordinare non è una vista: riscrive il documento.** Le righe cambiano
 * posto davvero, e la posizione è ciò che viene salvato. L'ordine in cui erano
 * state inserite **non è registrato da nessuna parte** — non c'è una data di
 * creazione sulla riga, e il numero di riga descrive la posizione attuale.
 * Nemmeno lo storico del documento le conserva: registra un riepilogo, non una
 * copia.
 *
 * ⚠️ _Corretto il 20/08/2026:_ qui c’era anche «il salvataggio cancella e ricrea
 * le righe con identificativi nuovi». Per `DocumentLine` **non è più vero
 * dall’11/08**: `document-line-upsert.util` conserva l’identità della riga.
 * Resta vero per il solo Ordine fornitore. La conclusione non cambia — l’ordine
 * di inserimento resta non registrato — ma la ragione sì, ed è quella su cui si
 * fonda la decisione sopra.
 *
 * Quindi l'avviso non dice «l'ordine attuale si perde», che descriverebbe un
 * inconveniente: dice che **salvando non si torna indietro**. E dice anche
 * l'unica via d'uscita che resta — fino al salvataggio il riordino vive solo
 * nella maschera, e chiudere senza salvare riporta il documento com'era.
 *
 * **Una volta per documento.** Alla seconda l'operatore sa già, e un avviso che
 * compare sempre si impara a scacciare senza leggerlo — che è il modo migliore
 * per renderlo inutile proprio quando conta.
 *
 * ⛔ **Il ciclo qui ha DUE stati — crescente e decrescente — e non ne avrà un
 * terzo** _(deciso 20/08/2026)_. Negli ELENCHI il motore riepiloghi fa
 * `asc → desc → nessuno`, e là «nessuno» ha una destinazione: l’ordine con cui
 * l’API ha risposto. **Qui quella destinazione non esiste**: l’ordine di
 * inserimento non è registrato da nessuna parte, quindi «togli l’ordinamento»
 * offrirebbe un ritorno a qualcosa che non c’è più.
 *
 * ⚠️ E sarebbe peggio che inutile: dopo un trascinamento manuale, la terza
 * pressione **scarterebbe il lavoro appena fatto**. È l’ambiguità che
 * `docs/ORDINE-FORNITORE-RIGA.md` aveva tolto apposta decidendo che «non esiste
 * un ordinare solo per guardare».
 *
 * La divergenza fra i due cicli è quindi **dichiarata**, non da sanare: chi un
 * giorno volesse «uniformare» legga prima questo paragrafo.
 *
 * Classe, non servizio iniettabile: un'istanza per maschera, come le altre di
 * questa cartella.
 */
export class DocumentLineSortStore<F extends string> {
  private readonly _column = signal<F | null>(null);
  private readonly _direction = signal<DocumentLineSortDirection>('asc');
  /** Colonna in attesa della conferma: non nulla = il dialogo è aperto. */
  private readonly _pending = signal<F | null>(null);
  private readonly _warned = signal(false);

  /** Colonna su cui le righe sono ordinate adesso, o `null` se nessuna. */
  readonly column = this._column.asReadonly();
  readonly direction = this._direction.asReadonly();

  /** Il dialogo di conferma è aperto. */
  readonly confirmOpen = computed(() => this._pending() !== null);

  /**
   * L'operatore ha chiesto di ordinare per quella colonna.
   *
   * Ritorna `true` se il riordino è avvenuto, `false` se serve prima la
   * conferma — nel qual caso il dialogo è ora aperto e la colonna è in attesa.
   */
  request(column: F): boolean {
    if (!this._warned()) {
      this._pending.set(column);
      return false;
    }
    this.apply(column);
    return true;
  }

  /**
   * L'operatore ha confermato: da qui in poi non si chiede più, e il riordino
   * in attesa parte. Ritorna la colonna su cui si è ordinato, per chi deve
   * riordinare davvero le righe.
   */
  confirm(): F | null {
    const column = this._pending();
    this._warned.set(true);
    this._pending.set(null);
    if (column !== null) {
      this.apply(column);
    }
    return column;
  }

  /** L'operatore ha rinunciato: niente riordino, e l'avviso resta da dare. */
  dismiss(): void {
    this._pending.set(null);
  }

  /**
   * Un altro documento è un'altra storia: l'avviso torna a essere dovuto e
   * l'ordinamento riparte da capo. Senza questo, aprendo il secondo documento
   * nella stessa sessione il riordino avverrebbe in silenzio.
   */
  reset(): void {
    this._column.set(null);
    this._direction.set('asc');
    this._pending.set(null);
    this._warned.set(false);
  }

  /** Stessa colonna = si rovescia il verso; colonna nuova = si riparte da crescente. */
  private apply(column: F): void {
    if (this._column() === column) {
      this._direction.update((verso) => (verso === 'asc' ? 'desc' : 'asc'));
      return;
    }
    this._column.set(column);
    this._direction.set('asc');
  }
}
