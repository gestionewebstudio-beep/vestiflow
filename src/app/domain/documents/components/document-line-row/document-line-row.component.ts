import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ReactiveFormsModule, type FormGroup } from '@angular/forms';
import { CdkDragHandle } from '@angular/cdk/drag-drop';

import { FirstClickSelectsDirective } from '@shared/directives/first-click-selects.directive';

import { DocumentLineCodeCellComponent } from '../document-line-code-cell/document-line-code-cell.component';
import { DocumentLineProductCellComponent } from '../document-line-product-cell/document-line-product-cell.component';
import { DocumentLineSelectCellComponent } from '../document-line-select-cell/document-line-select-cell.component';
import { DocumentLineUnitCellComponent } from '../document-line-unit-cell/document-line-unit-cell.component';

import { DOCUMENT_LINE_ROW_VIEW_VUOTA } from './document-line-row.model';
import type {
  DocumentLineCodeField,
  DocumentLineColumnId,
  DocumentLineFieldEvent,
  DocumentLineFocusField,
  DocumentLineRowView,
  DocumentLineSuggestionDirection,
  DocumentLineSuggestionPick,
} from './document-line-row.model';

import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

/**
 * **La riga di un documento. Una sola, per tutte le maschere.**
 *
 * ⛔ Decisione del proprietario, 22/08/2026 (`11` A15): Ordine cliente, Vendita
 * al banco e Reso al banco usano QUESTA riga. Dove una colonna esiste in due
 * documenti dev'essere la stessa cella, lo stesso controllo, gli stessi stati,
 * lo stesso fuoco e la stessa grafica — e affiancando due maschere una cella
 * Quantità dev'essere **indistinguibile**.
 *
 * **La semplificazione di un documento è una sola: non mostrare le colonne che
 * non gli servono.** Non un'altra tabella, non input ricostruiti, non uno
 * stepper proprio, non un CSS che imita.
 *
 * ⛔ Qui c'era il difetto che l'ha resa necessaria: l'Ordine cliente componeva
 * la riga nel proprio template (386 righe di markup, sei celle condivise e
 * tutto il resto scritto lì) e la Vendita al banco ne aveva costruita una
 * seconda (139 righe, UNA cella condivisa). Il foglio globale
 * `_document-form.scss` faceva sembrare condivisa una riga che non lo era: era
 * condiviso **il vestito**, non la riga.
 *
 * ---
 *
 * **È presentazionale.** Riceve valori, configurazione ed eventi; non calcola
 * totali, non conosce impegni, non sa se una spunta impegna, scarica o carica.
 *
 * ⚠️ «Dominio fuori» **non** vuol dire che non possa rendere Impegnata,
 * Disponibile o la spunta di magazzino: quelle sono colonne come le altre. Vuol
 * dire che il **significato** — e il calcolo — restano di chi la ospita.
 *
 * ---
 *
 * **Perché un selettore d'attributo su `<tr>`.** Un componente con selettore di
 * elemento inserirebbe un nodo fra `<tbody>` e `<tr>`, e la tabella si
 * romperebbe. Con l'attributo l'host **è** la riga: il consumer ci applica ciò
 * che è suo — `formGroupName`, `cdkDrag`, le proprie classi — e il resto arriva
 * da qui.
 *
 * **Perché il gruppo arriva come `input()`.** I controlli dentro il template
 * sono legati con `formControlName`, come nelle sei maschere che già lo fanno:
 * cambiarli in valore+evento avrebbe cambiato validazione, stato `dirty` e
 * `updateOn` dell'Ordine cliente — cioè il comportamento che l'estrazione deve
 * lasciare intatto.
 */
@Component({
  selector: 'tr[app-document-line-row]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    CdkDragHandle,
    // ⚠️ Si aggancia per CLASSE (`input.doc-form__input--table`), non per
    // attributo: senza importarla qui, gli input della riga perderebbero «il
    // primo clic seleziona il contenuto» — in silenzio, perché il markup
    // resterebbe identico. È il tipo di comportamento che si perde spostando
    // un template da un componente all'altro.
    FirstClickSelectsDirective,
    DocumentLineCodeCellComponent,
    DocumentLineProductCellComponent,
    DocumentLineSelectCellComponent,
    DocumentLineUnitCellComponent,
  ],
  templateUrl: './document-line-row.component.html',
})
export class DocumentLineRowComponent {
  /** Il gruppo della riga: i controlli restano quelli del form della maschera. */
  readonly group = input.required<FormGroup>();
  readonly lineIndex = input.required<number>();

  /**
   * Quali colonne esistono. ⛔ È l'unica leva della semplificazione: una
   * maschera che vuole meno colonne ne dichiara meno, non si riscrive la riga.
   */
  readonly isColumnVisible = input.required<(column: DocumentLineColumnId) => boolean>();

  /** Prefisso degli `id`: due maschere aperte non si contendono un'etichetta. */
  readonly idPrefix = input.required<string>();

  readonly view = input<DocumentLineRowView>(DOCUMENT_LINE_ROW_VIEW_VUOTA);
  readonly readOnly = input(false);

  /** Opzioni comuni a tutte le righe: si passano una volta, non per riga. */
  readonly unitOptions = input<readonly SelectMenuOption[]>([]);

  /**
   * L'etichetta della spunta di magazzino: **impegna** su un ordine, **scarica**
   * su un DDT, **scarica o carica** al banco. Stessa colonna, parole del
   * documento che la ospita.
   */
  readonly stockToggleLabel = input('Impegna magazzino');

  /** L'etichetta della spunta «carica/scarica», distinta da «impegna». */
  readonly loadToggleLabel = input('Carica magazzino');

  /** Quante colonne occupa la fascia della riga di riferimento. */
  readonly identityColumnCount = input(1);

  /**
   * La cella numero è la maniglia di trascinamento. Solo dove il documento
   * riordina le righe: al banco l'ordine è quello di scansione.
   */
  readonly dragHandle = input(false);

  /**
   * Minimo dell'attributo `min` sulla cella quantita'.
   *
   * ⛔ **Non e' un dettaglio estetico, ed e' gia' costato una regressione.**
   * Il banco nasceva con `min="1"` e l'Ordine cliente con `min="0"`: estraendo
   * la riga comune il valore dell'Ordine cliente si e' imposto a tutti e due, e
   * al banco la freccia in giu' ha cominciato a scendere sotto il pezzo.
   *
   * ⚠️ **Resta pero' una domanda aperta sull'Ordine cliente**: il suo
   * `Validators.min(1)` e questo `0` dicono due cose diverse — il browser lascia
   * scendere a zero, il form marca invalido. Allinearli e' una decisione, non una
   * conseguenza, e qui il default resta quello storico per non prenderla da soli.
   */
  readonly quantityMin = input(0);

  // ── Eventi: la riga chiede, la maschera decide ───────────────────────────

  readonly codeChanged = output<DocumentLineFieldEvent<string>>();
  readonly codeFocused = output<DocumentLineCodeField>();
  readonly codeBlurred = output<void>();
  readonly codeCommitted = output<{ field: DocumentLineCodeField; advance: boolean }>();

  readonly productNameChanged = output<string>();
  readonly productFocused = output<void>();
  readonly productBlurred = output<void>();
  readonly productSearchOpened = output<void>();

  readonly suggestionPicked = output<DocumentLineSuggestionPick>();
  readonly suggestionNavigated = output<DocumentLineFieldEvent<DocumentLineSuggestionDirection>>();
  readonly escapePressed = output<void>();

  readonly unitChanged = output<string>();
  readonly unitManageRequested = output<void>();
  readonly vatSelected = output<string | null>();

  /**
   * Il costo digitato, a ogni tasto.
   *
   * ⭐ Serve perche' il campo costo e' una **vista sul netto canonico**: quello
   * che si digita aggiorna il netto, e il selettore netto/ivato ridisegna il
   * campo senza mai ricostruire il netto da cio' che si vede. Senza questo
   * evento il canonico resterebbe a zero e il salvataggio manderebbe zero —
   * il campo a schermo direbbe una cifra e il documento ne salverebbe un'altra.
   */
  readonly costChanged = output<string>();

  /** Tasto premuto in una cella a `formControlName`: il giro del fuoco è della maschera. */
  readonly fieldKeydown = output<DocumentLineFieldEvent<KeyboardEvent>>();

  /**
   * Un campo OPERATIVO ha perso il fuoco.
   *
   * Non e' una specificita' dell'Arrivo merce travestita: la vista a CARD lo
   * aveva gia' (`fieldBlur`), la riga di scrivania no. E' l'unico momento in
   * cui un documento puo' consolidare quello che si e' appena scritto —
   * l'Arrivo merce ci aggancia i codici e segna il modulo sporco.
   *
   * Chi non lo lega non paga niente: un `output` senza ascoltatori non emette.
   */
  readonly fieldBlur = output<DocumentLineFocusField>();
  /** Uscite di cella dalle celle condivise, che il fuoco usa allo stesso modo. */
  readonly fieldAdvance = output<DocumentLineFocusField>();
  readonly fieldRetreat = output<DocumentLineFocusField>();
  readonly rowAdvance = output<DocumentLineFocusField>();
  readonly rowRetreat = output<DocumentLineFocusField>();

  readonly removeRequested = output<void>();

  protected cellId(field: string): string {
    return `${this.idPrefix()}-${field}-${this.lineIndex()}`;
  }

  /**
   * Il valore di un controllo per le celle che lo leggono come `input()`
   * invece che con `formControlName` — le tre celle codice e quella prodotto,
   * che erano già così prima dell'estrazione.
   *
   * ⚠️ Un controllo assente vale stringa vuota: una maschera che non ha la
   * colonna non deve dichiararne il controllo per far girare la riga.
   */
  /**
   * Il gruppo ha questo controllo?
   *
   * ⭐ È il modo in cui una stessa colonna può essere **editabile in un
   * documento e in sola lettura in un altro**, senza un `if (documentType)`:
   * i tre prezzi d'anagrafica l'Arrivo merce li scrive (ha i controlli),
   * l'Ordine fornitore li mostra e basta (non li ha). La riga non chiede quale
   * documento sia — guarda il gruppo che le hanno dato.
   */
  protected haControllo(name: string): boolean {
    return Boolean(this.group().controls[name]);
  }

  protected controlValue(name: string): string {
    const control = this.group().controls[name];
    return (control?.value as string | null | undefined) ?? '';
  }
}
