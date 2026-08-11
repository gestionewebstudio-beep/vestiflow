import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { take } from 'rxjs';

import { DateInputComponent } from '@shared/components/date-input/date-input.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

import type { ExternalDocumentType } from '../../models/external-document-type.model';
import { ExternalDocumentTypeService } from '../../services/external-document-type.service';
import { ExternalDocumentTypeManagerDialogComponent } from '../external-document-type-manager-dialog/external-document-type-manager-dialog.component';

/** Voce-azione in fondo alla tendina: apre la gestione dei tipi. */
const MANAGE_OPTION = '__manage-external-doc-types__';

/**
 * Il documento della controparte in testata: **tipo**, **numero** e **data** del
 * documento che l'altra parte ha emesso — il DDT del fornitore, la fattura, la
 * conferma d'ordine, l'ordine del cliente.
 *
 * Sta in `domain/` perche' lo montano tutte le maschere documento e porta con
 * se' logica di dominio, non solo markup: la tendina dei tipi, la voce
 * «Gestisci tipi documento…» e il pannello che apre. Ogni maschera ne eredita
 * il comportamento senza doverlo riscrivere — che e' il punto: prima questa
 * roba viveva dentro l'Arrivo merce e le altre sette non ce l'avevano.
 *
 * ## L'opzione che non c'e' piu'
 *
 * Un tipo puo' essere **disattivato** (fuori dalle tendine) o **eliminato**
 * (fuori anche dall'elenco). In entrambi i casi un documento gia' salvato
 * continua a puntarlo, e la tendina si troverebbe con un valore senza opzione:
 * il campo apparirebbe vuoto, e al salvataggio successivo la dicitura sparirebbe
 * davvero. Per questo il componente ricostruisce l'opzione mancante:
 *
 * - se il tipo e' solo disattivato lo ripesca dalla lista;
 * - se e' stato eliminato — quindi dalla lista non arriva proprio — usa lo
 *   **snapshot dell'etichetta scritto sul documento** (`snapshotLabel`).
 *
 * E' la ragione per cui `snapshotLabel` non e' un dettaglio decorativo: senza,
 * riaprire un vecchio documento ne cancella il riferimento in silenzio.
 *
 * L'host e' `display: contents`: le tre celle diventano figlie dirette della
 * griglia di testata che le ospita, senza un contenitore in mezzo che ne
 * romperebbe le colonne.
 */
@Component({
  selector: 'app-document-counterparty-ref',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    DateInputComponent,
    SelectMenuComponent,
    ExternalDocumentTypeManagerDialogComponent,
  ],
  templateUrl: './document-counterparty-ref.component.html',
  styleUrl: './document-counterparty-ref.component.scss',
})
export class DocumentCounterpartyRefComponent {
  private readonly service = inject(ExternalDocumentTypeService);
  private readonly destroyRef = inject(DestroyRef);

  /** Prefisso degli id degli input (`for`/`id`): univoco per maschera. */
  readonly idPrefix = input.required<string>();

  readonly typeId = input<string>('');
  readonly docNumber = input<string>('');
  /** Data in formato ISO `AAAA-MM-GG` (solo giorno). */
  readonly docDate = input<string>('');

  /**
   * Etichetta fotografata sul documento al salvataggio. Serve a ricostruire
   * l'opzione quando il tipo e' stato eliminato dall'elenco (vedi sopra).
   */
  readonly snapshotLabel = input<string | undefined>(undefined);

  /**
   * Sola lettura. Toglie la voce «Gestisci tipi documento…» e blocca il campo
   * numero. Tendina e data seguono il `<fieldset [disabled]>` che le maschere
   * gia' usano per i propri gate: e' il meccanismo dell'app, non se ne aggiunge
   * un secondo che possa dire il contrario.
   */
  readonly disabled = input<boolean>(false);

  /**
   * `band` — la fascia secondaria della testata desktop, disegnata dal
   * componente stesso. `stack` — la sezione del pannello di testata mobile.
   *
   * La fascia non e' un'opzione della maschera: e' LA forma di questo gruppo di
   * campi, ed e' qui dentro apposta. Quando ognuna delle sette maschere decideva
   * da se' dove mettere le tre celle, ne sono uscite sette impaginazioni diverse
   * con sette blocchi di SCSS locale — che e' il modo in cui un componente
   * condiviso smette di condividere qualcosa.
   */
  readonly layout = input<'band' | 'stack'>('band');

  /** Titolo della sezione mobile: cambia con la controparte del documento. */
  readonly sectionTitle = input<string>('Documento della controparte');

  readonly typeLabel = input<string>('Tipo documento');
  readonly numberLabel = input<string>('Numero documento');
  readonly dateLabel = input<string>('Data documento');
  readonly numberPlaceholder = input<string>('Es. 145');

  readonly typeIdChange = output<string>();
  readonly docNumberChange = output<string>();
  readonly docDateChange = output<string>();

  /**
   * L'elenco dei tipi e' cambiato dal pannello di gestione. Serve a chi tiene
   * una propria copia della lista per altri scopi — l'Arrivo merce la usa per
   * comporre la causale di carico e il riepilogo di testata mobile: senza questo
   * avviso, rinominare un tipo senza cambiare la selezione lo lascerebbe con
   * un'etichetta vecchia di un giro.
   */
  readonly typesChanged = output<void>();

  private readonly _types = signal<readonly ExternalDocumentType[]>([]);
  protected readonly managerOpen = signal(false);

  constructor() {
    this.load();
  }

  protected readonly options = computed<readonly SelectMenuOption[]>(() => {
    const selected = this.typeId();
    const options: SelectMenuOption[] = [{ value: '', label: '—' }];
    let selectedFound = false;

    for (const type of this._types()) {
      // I disattivati non si propongono, ma restano leggibili se il documento
      // che si sta guardando li porta gia'.
      if (type.isActive || type.id === selected) {
        options.push({ value: type.id, label: type.shortLabel || type.name });
      }
      if (type.id === selected) {
        selectedFound = true;
      }
    }

    // Tipo eliminato: dalla lista non arriva, l'etichetta la da' il documento.
    if (selected && !selectedFound) {
      options.push({ value: selected, label: this.snapshotLabel()?.trim() || 'Tipo eliminato' });
    }

    if (!this.disabled()) {
      options.push({ value: MANAGE_OPTION, label: 'Gestisci tipi documento…' });
    }
    return options;
  });

  protected readonly numberInputId = computed(() => `${this.idPrefix()}-cp-num`);
  protected readonly dateInputId = computed(() => `${this.idPrefix()}-cp-date`);

  protected readonly isStack = computed(() => this.layout() === 'stack');

  /**
   * Le celle indossano le classi della testata documento — `doc-form__*` da
   * desktop, `doc-panel__*` nel pannello mobile — e prendono dai fogli in
   * `styles/` padding, fili, `:focus-within`, misura delle etichette e larghezza
   * dei controlli. Ricopiare quelle regole qui dentro darebbe due verita'
   * sull'aspetto di una cella di testata, e la seconda invecchierebbe da sola.
   */
  protected readonly cellClass = computed(() =>
    this.isStack() ? 'cp-ref__cell doc-panel__field' : 'cp-ref__cell doc-form__field',
  );
  protected readonly labelClass = computed(() =>
    this.isStack() ? 'doc-panel__label' : 'doc-form__label',
  );
  protected readonly inputClass = computed(() =>
    this.isStack() ? 'cp-ref__input doc-panel__control' : 'cp-ref__input doc-form__input',
  );

  protected onTypeSelect(value: string | null): void {
    if (value === MANAGE_OPTION) {
      this.managerOpen.set(true);
      return;
    }
    this.typeIdChange.emit(value ?? '');
  }

  protected onNumberInput(event: Event): void {
    this.docNumberChange.emit((event.target as HTMLInputElement).value);
  }

  protected onManagerChanged(): void {
    this.load();
    this.typesChanged.emit();
  }

  /** Un tipo creato dal pannello si sceglie da solo: e' perche' lo si e' aperto. */
  protected onManagerCreated(type: ExternalDocumentType): void {
    this.typeIdChange.emit(type.id);
  }

  private load(): void {
    this.service
      .list()
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (types) => this._types.set(types),
        // Se la lista non arriva restano l'opzione ricostruita dallo snapshot e
        // la voce di gestione: il campo non diventa una tendina vuota e muta.
        error: () => this._types.set([]),
      });
  }
}
