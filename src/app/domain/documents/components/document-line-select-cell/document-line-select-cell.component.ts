import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';

import { classifyLineCellKey } from '@domain/documents/utils/document-line-cell-keys.util';
import { filterLineSelectOptions } from '@domain/documents/utils/document-line-select-filter.util';
import { FirstClickSelectsDirective } from '@shared/directives/first-click-selects.directive';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

import { DocumentLineSuggestionsComponent } from '../document-line-suggestions/document-line-suggestions.component';
import type { DocumentLineSuggestionItem } from '../document-line-suggestions/document-line-suggestions.model';

/**
 * La cella **a ricerca-e-selezione** di una riga documento: Codice IVA, unità di
 * misura, e qualunque colonna in cui il valore si sceglie da un elenco breve di
 * voci con un codice.
 *
 * ## Perché non è `app-select-menu`
 *
 * `app-select-menu` ha per trigger un `<button>` la cui etichetta *è* il valore,
 * e da lì discende tutto ciò che gli manca per stare in una riga documento:
 * nessun `inputId` da dare al giro del fuoco, niente fuoco raggiungibile,
 * nessun tasto ascoltato, e soprattutto **dentro un bottone non c'è testo da
 * selezionare** — mentre entrando in una cella il valore dev'essere evidenziato
 * e pronto da sovrascrivere (specifica §4.1). Estendere quel componente avrebbe
 * significato muovere le sue altre 179 istanze per servirne quattro.
 *
 * Il precedente giusto è **`date-input`**: un `<input>` vero che porta l'`id`
 * ricevuto, quindi il fuoco lo raggiunge come qualunque altro campo, e un
 * pannello che si apre accanto. Questa cella è quella forma, con l'elenco al
 * posto del calendario.
 *
 * ## Cosa decide da sé, e cosa lascia alla maschera
 *
 * Come le celle gemelle (codice e nome prodotto) **non consegna l'evento**:
 * classifica il tasto con `classifyLineCellKey` — la stessa macchina, non una
 * copia — ed emette **esiti**. La maschera riceve `lineAdvance`, `lineRetreat`,
 * `lineRowAdvance`, `lineRowRetreat` e li gira al punto unico del fuoco.
 *
 * **L'elenco però è suo.** Nelle celle gemelle i suggerimenti arrivano da fuori,
 * perché sono il risultato di una ricerca che la maschera possiede; qui le voci
 * sono un dato fermo che il chiamante passa una volta, e filtrarle è lavoro
 * della cella. Perciò apertura, filtro e voce evidenziata vivono qui dentro: la
 * maschera passa `options` e `value`, e riceve indietro `valueChange`.
 *
 * ## Testo libero: acceso o spento, non a metà
 *
 * `freeText` distingue i due usi, che hanno la stessa UX e validazione opposta
 * (specifica §4.3):
 *
 * - **U.M.** — insieme aperto (pz, conf, paio, mazzo…): la tabella suggerisce,
 *   non obbliga, e quello che si digita resta;
 * - **IVA** — insieme chiuso: un codice inventato non ha aliquota né natura, non
 *   è calcolabile. Quello che si digita e non corrisponde a nulla **non entra**:
 *   la cella torna a mostrare il valore di prima.
 *
 * ## Le frecce, e perché qui fanno diverso
 *
 * ←/→ portano al campo accanto **al primo colpo**, senza il secondo tempo del
 * cursore (§4.3): dove il valore si sceglie da un elenco, percorrere il testo
 * con la freccia non porta da nessuna parte. È il confine del dominio della
 * regola dei due tempi, non una deroga — e sta scritto nel contesto passato al
 * classificatore, non in un ramo di qui.
 *
 * ## Su mobile
 *
 * Stesso componente, stesso pannello: cambia il gesto, non la regola. La scelta
 * si prende **toccando** una voce, e nessuna è evidenziata finché non arriva una
 * freccia — che da telefono non arriva (§4.10). La tastiera di sistema apre e
 * filtra come su computer.
 */
@Component({
  selector: 'app-document-line-select-cell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FirstClickSelectsDirective, DocumentLineSuggestionsComponent],
  templateUrl: './document-line-select-cell.component.html',
  styleUrl: './document-line-select-cell.component.scss',
})
export class DocumentLineSelectCellComponent {
  readonly lineIndex = input.required<number>();
  /** Id dell'`<input>`: è così che il giro del fuoco raggiunge questa cella. */
  readonly inputId = input('');
  readonly ariaLabel = input.required<string>();
  readonly placeholder = input('');
  /**
   * Le voci, nell'ordine in cui vanno mostrate a filtro vuoto. `label` è **il
   * codice** — quello che si digita e su cui il filtro dà la precedenza;
   * `detail` è la spiegazione accanto.
   */
  readonly options = input.required<readonly SelectMenuOption[]>();
  /** Il `value` dell'opzione scelta; con `freeText`, anche un testo qualsiasi. */
  readonly value = input('');
  readonly freeText = input(false);
  readonly disabled = input(false);
  /**
   * Etichetta del comando in coda al pannello («» Altro…»). Vuota = nessun
   * comando: le celle il cui elenco non si gestisce da qui non lo mostrano.
   */
  readonly manageLabel = input('');
  readonly panelPlacement = input<'below' | 'above'>('below');
  /**
   * La cella sta nel **giro delle colonne** — cioè nella tabella, dove Tab e
   * frecce sono della maschera e il fuoco lo governa il punto unico.
   *
   * Su **card** è `false`, e non è un adattamento: lì le colonne non ci sono, e
   * una cella che trattiene il Tab senza avere dove mandarlo chiuderebbe dentro
   * chi naviga da tastiera. L'elenco invece si comporta uguale — si apre, si
   * filtra, si sceglie — perché quella è la regola, e cambia solo il gesto
   * (specifica §1, §4.10).
   */
  readonly inColumnCycle = input(true);

  readonly valueChange = output<string>();
  readonly focused = output<number>();
  readonly blurred = output<number>();
  /** Tab e → : il valore è risolto, il fuoco può andare al campo dopo. */
  readonly lineAdvance = output<number>();
  readonly lineRetreat = output<number>();
  readonly lineRowAdvance = output<number>();
  readonly lineRowRetreat = output<number>();
  readonly escapePressed = output<number>();
  /**
   * «» Altro…»: apre la gestione delle voci. **Un output, non un valore
   * fasullo.** Il pattern che esiste già in Arrivo merce passa da un
   * valore-sentinella (`'__manage-…__'`) dentro le opzioni, che ogni chiamante
   * deve ricordarsi di intercettare — e chi se ne dimentica si ritrova la
   * stringa finta scritta nel form control. Qui non c'è niente da intercettare:
   * un comando non passa dalla porta dei valori.
   */
  readonly manageRequested = output<void>();

  protected readonly listboxId = signal(
    `doc-select-list-${Math.random().toString(36).slice(2, 9)}`,
  );

  /** Il testo nel campo: il codice della voce scelta, o ciò che si sta digitando. */
  protected readonly text = signal('');
  protected readonly open = signal(false);
  protected readonly activeIndex = signal(0);
  /** Mentre si digita, il valore di fuori non riscrive il campo sotto le dita. */
  private readonly editing = signal(false);

  constructor() {
    effect(() => {
      const label = this.labelOf(this.value());
      if (!this.editing()) {
        this.text.set(label);
      }
    });
  }

  /** Le voci che sopravvivono a ciò che si è digitato (§4.3: prima il codice). */
  protected readonly filtered = computed(() =>
    this.editing() ? filterLineSelectOptions(this.options(), this.text()) : this.options(),
  );

  protected readonly items = computed<readonly DocumentLineSuggestionItem[]>(() =>
    this.filtered().map((option) => ({ title: option.label, detail: option.detail })),
  );

  /**
   * Le fermate della navigazione dentro il pannello: le voci più, se c'è, il
   * comando in coda. Serve perché «» Altro…» sia raggiungibile anche da chi non
   * usa il mouse — è l'unico modo per arrivarci da tastiera, visto che il Tab
   * dentro la cella è del giro delle colonne.
   */
  private stops(): number {
    return this.filtered().length + (this.manageLabel() ? 1 : 0);
  }

  /** Il pannello è aperto e ha qualcosa da navigare. */
  protected readonly panelLive = computed(() => this.open() && this.stops() > 0);

  protected readonly tailActive = computed(
    () => this.panelLive() && this.activeIndex() === this.filtered().length,
  );

  protected onInput(text: string): void {
    this.editing.set(true);
    this.text.set(text);
    this.activeIndex.set(0);
    this.open.set(true);
  }

  protected onFocus(): void {
    this.focused.emit(this.lineIndex());
  }

  /**
   * Uscire dal campo conferma quello che si è digitato, come il Tab (§4.10): lo
   * scorrimento non toglie il fuoco, quindi se lo si perde è perché si è toccato
   * un altro campo — un gesto deliberato quanto un Tab.
   */
  protected onBlur(): void {
    this.resolveTyped();
    this.close();
    this.blurred.emit(this.lineIndex());
  }

  /** Il chevron apre l'elenco senza togliere il fuoco al campo. */
  protected onToggle(event: Event): void {
    event.preventDefault();
    if (this.disabled()) {
      return;
    }
    if (this.open()) {
      this.close();
      return;
    }
    this.editing.set(false);
    this.text.set(this.labelOf(this.value()));
    this.activeIndex.set(Math.max(0, this.indexOfValue()));
    this.open.set(true);
  }

  protected pickAt(index: number): void {
    const option = this.filtered()[index];
    if (!option) {
      return;
    }
    this.commit(option.value);
  }

  protected onManage(): void {
    this.close();
    this.manageRequested.emit();
  }

  protected onKeydown(event: KeyboardEvent): void {
    const esito = classifyLineCellKey(event, {
      suggestionsOpen: this.panelLive(),
      activeSuggestionIndex: this.activeIndex(),
      // §4.3 — su una cella a selezione la freccia esce subito.
      arrowsLeaveAtOnce: true,
    });
    if (!esito) {
      return;
    }
    switch (esito.kind) {
      case 'escape':
        // Come nelle celle gemelle: Esc dentro la cella non deve arrivare a chi
        // chiuderebbe l'intera maschera.
        event.preventDefault();
        event.stopPropagation();
        if (this.open()) {
          this.close();
          return;
        }
        this.escapePressed.emit(this.lineIndex());
        return;
      case 'suggestion-move':
        event.preventDefault();
        this.moveActive(esito.direction);
        return;
      case 'suggestion-pick':
        event.preventDefault();
        if (esito.index === this.filtered().length) {
          this.onManage();
          return;
        }
        this.pickAt(esito.index);
        return;
      case 'confirm':
        // Invio si tiene **sempre**: dentro un `<form>` lasciarlo passare
        // manderebbe il documento in salvataggio, che è l'opposto di «registra e
        // resta» (§4.5). Tab e → invece sono del giro delle colonne, e dove il
        // giro non c'è restano al browser.
        if (!esito.advance) {
          event.preventDefault();
          this.resolveTyped();
          return;
        }
        if (!this.inColumnCycle()) {
          return;
        }
        event.preventDefault();
        this.resolveTyped();
        this.lineAdvance.emit(this.lineIndex());
        return;
      case 'row-advance':
        if (!this.inColumnCycle()) {
          return;
        }
        event.preventDefault();
        this.resolveTyped();
        this.lineRowAdvance.emit(this.lineIndex());
        return;
      case 'row-retreat':
        if (!this.inColumnCycle()) {
          return;
        }
        event.preventDefault();
        this.resolveTyped();
        this.lineRowRetreat.emit(this.lineIndex());
        return;
      case 'field-retreat':
        if (!this.inColumnCycle()) {
          return;
        }
        event.preventDefault();
        this.close();
        this.lineRetreat.emit(this.lineIndex());
        return;
    }
  }

  /** ↑/↓ dentro l'elenco si fermano agli estremi, non girano in tondo (§4.12). */
  private moveActive(direction: 'next' | 'prev'): void {
    const last = this.stops() - 1;
    const next = direction === 'next' ? this.activeIndex() + 1 : this.activeIndex() - 1;
    this.activeIndex.set(Math.min(last, Math.max(0, next)));
  }

  /**
   * Trasforma in valore ciò che sta nel campo. Nell'ordine: la voce evidenziata
   * se il pannello è aperto, poi la corrispondenza esatta col codice, poi — solo
   * dove il testo libero è ammesso — il testo così com'è. Se non resta niente il
   * campo torna al valore di prima: su un insieme chiuso una voce inventata non
   * è un valore, è un buco.
   */
  private resolveTyped(): void {
    if (this.disabled()) {
      return;
    }
    if (this.panelLive() && this.activeIndex() < this.filtered().length) {
      const evidenziata = this.filtered()[this.activeIndex()];
      if (evidenziata) {
        this.commit(evidenziata.value);
        return;
      }
    }
    const digitato = this.text().trim();
    const esatta = this.options().find(
      (option) => option.label.toLocaleLowerCase('it-IT') === digitato.toLocaleLowerCase('it-IT'),
    );
    if (esatta) {
      this.commit(esatta.value);
      return;
    }
    if (this.freeText()) {
      this.commit(digitato);
      return;
    }
    this.commit(this.value());
  }

  private commit(value: string): void {
    this.close();
    // Il campo torna a mostrare l'etichetta anche quando non c'è nulla da
    // propagare, o resterebbe lì il testo scartato.
    this.text.set(this.labelOf(value));
    if (value !== this.value()) {
      this.valueChange.emit(value);
    }
  }

  private close(): void {
    this.editing.set(false);
    this.open.set(false);
    this.activeIndex.set(0);
  }

  private indexOfValue(): number {
    return this.options().findIndex((option) => option.value === this.value());
  }

  /**
   * Cosa si legge nel campo per un valore. Sull'insieme chiuso un valore che non
   * ha voce lascia la cella **vuota**: mostrarne l'identificativo interno
   * sarebbe peggio del vuoto.
   */
  private labelOf(value: string): string {
    const option = this.options().find((entry) => entry.value === value);
    if (option) {
      return option.label;
    }
    return this.freeText() ? value : '';
  }
}
