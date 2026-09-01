import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { DateInputComponent } from '@shared/components/date-input/date-input.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import type { ColumnFilterValue } from '@shared/table-columns/column-filter.model';
import type { TableColumnFilterKind } from '@shared/table-columns/table-column.model';

/**
 * ⭐ **IL CONTROLLO DI FILTRO DI UNA COLONNA** (`14` §0.2, §70).
 *
 * I filtri di un elenco sono le sue colonne: questo è il comando che vive
 * nell'intestazione su scrivania, e nel pannello del telaio sotto `lg`.
 *
 * ```text
 * values   app-select-menu multiplo, con i valori PRESENTI nelle righe
 * text     un campo di ricerca sulla sola colonna
 * range    due campi numerici, minimo e massimo
 * ```
 *
 * ## ⚠️ Non decide niente
 *
 * Riceve la forma, i valori possibili e lo stato; emette il cambiamento. **A
 * filtrare è chi possiede le righe**, con `applicaFiltriDiColonna` — la stessa
 * separazione del motore tabella, che non ordina e non impagina.
 *
 * ## ⛔ Il vuoto TOGLIE il filtro
 *
 * Svuotare il controllo emette `null`, non un valore vuoto: è l'unico modo per
 * togliere una restrizione, e confonderlo con «filtra per niente» farebbe
 * tornare zero righe senza spiegazione.
 */
@Component({
  selector: 'app-column-filter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DateInputComponent, SelectMenuComponent],
  templateUrl: './column-filter.component.html',
  styleUrl: './column-filter.component.scss',
})
export class ColumnFilterComponent {
  private static nextInstanceId = 0;

  /**
   * ⭐ **Ogni campo ha un `id` proprio**, e serve a due cose diverse.
   *
   * ⚠️ Il browser segnala «a form field element should have an id or name
   * attribute» su ogni controllo che ne è privo — ventidue su una sola pagina,
   * misurati il 01/09/2026 — e la segnalazione è giusta: senza id un campo non
   * si può associare a un'etichetta né raggiungere da un test o da un'estensione.
   *
   * ⛔ **E toglie un id CONDIVISO**: `app-date-input` senza `inputId` ripiega su
   * `date-input-parse-error` per il proprio messaggio d'errore, quindi due campi
   * data nella stessa riga filtri lo userebbero entrambi.
   */
  private readonly istanza = ++ColumnFilterComponent.nextInstanceId;
  protected readonly campoTestoId = `column-filter-text-${this.istanza}`;
  protected readonly campoDaId = `column-filter-min-${this.istanza}`;
  protected readonly campoAId = `column-filter-max-${this.istanza}`;
  protected readonly campoDalId = `column-filter-from-${this.istanza}`;
  protected readonly campoAlId = `column-filter-to-${this.istanza}`;

  readonly kind = input.required<TableColumnFilterKind>();

  /** Il nome della colonna: serve al nome accessibile del controllo. */
  readonly columnLabel = input.required<string>();

  /** Solo per `values`: i valori distinti presenti nelle righe caricate. */
  readonly options = input<readonly string[]>([]);

  readonly value = input<ColumnFilterValue | null>(null);

  /** `null` toglie il filtro da questa colonna. */
  readonly changed = output<ColumnFilterValue | null>();

  protected readonly menuOptions = computed<readonly SelectMenuOption[]>(() =>
    this.options().map((v) => ({ value: v, label: v })),
  );

  protected readonly selezionati = computed<readonly string[]>(() => this.value()?.values ?? []);
  protected readonly testo = computed(() => this.value()?.text ?? '');
  protected readonly minimo = computed(() => this.value()?.min ?? null);
  protected readonly massimo = computed(() => this.value()?.max ?? null);
  protected readonly dal = computed(() => this.value()?.dateFrom);
  protected readonly al = computed(() => this.value()?.dateTo);

  protected onValues(scelti: readonly string[]): void {
    this.changed.emit(scelti.length === 0 ? null : { kind: 'values', values: [...scelti] });
  }

  protected onText(evento: Event): void {
    const testo = (evento.target as HTMLInputElement).value;
    this.changed.emit(testo.trim().length === 0 ? null : { kind: 'text', text: testo });
  }

  protected onMin(evento: Event): void {
    this.emettiIntervallo(this.numero(evento), this.massimo());
  }

  protected onMax(evento: Event): void {
    this.emettiIntervallo(this.minimo(), this.numero(evento));
  }

  protected onDal(iso: string): void {
    this.emettiPeriodo(iso, this.al());
  }

  protected onAl(iso: string): void {
    this.emettiPeriodo(this.dal(), iso);
  }

  /**
   * ⚠️ **`app-date-input` emette la stringa vuota per «nessuna data»**, non
   * `undefined`: senza questa normalizzazione il filtro resterebbe attivo su un
   * estremo vuoto, e l'elenco non tornerebbe più intero.
   */
  private emettiPeriodo(dal: string | undefined, al: string | undefined): void {
    const da = dal?.trim() ? dal : undefined;
    const a = al?.trim() ? al : undefined;
    if (da === undefined && a === undefined) {
      this.changed.emit(null);
      return;
    }
    this.changed.emit({
      kind: 'date',
      ...(da !== undefined ? { dateFrom: da } : {}),
      ...(a !== undefined ? { dateTo: a } : {}),
    });
  }

  /**
   * ⚠️ **Il campo vuoto è `null`, e `0` è un numero.**
   *
   * `Number('')` vale `0`: letto così, svuotare il campo «da» imporrebbe un
   * minimo di zero — cioè un filtro che l'operatore non ha chiesto e che
   * nasconderebbe ogni riga negativa.
   */
  private numero(evento: Event): number | null {
    const grezzo = (evento.target as HTMLInputElement).value.trim();
    if (grezzo.length === 0) {
      return null;
    }
    const n = Number(grezzo.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  private emettiIntervallo(min: number | null, max: number | null): void {
    if (min === null && max === null) {
      this.changed.emit(null);
      return;
    }
    this.changed.emit({
      kind: 'range',
      ...(min !== null ? { min } : {}),
      ...(max !== null ? { max } : {}),
    });
  }
}
