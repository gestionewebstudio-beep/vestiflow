import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

import { DateInputComponent } from '@shared/components/date-input/date-input.component';
import { SegmentedComponent } from '@shared/components/segmented/segmented.component';
import type { SegmentedOption } from '@shared/components/segmented/segmented.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import type { ColumnFilterValue } from '@shared/table-columns/column-filter.model';
import type { TableColumnFilterKind } from '@shared/table-columns/table-column.model';

/**
 * ⭐ **IL CONTROLLO DI FILTRO DI UNA COLONNA — UNO SOLO** (`14` §0.2).
 *
 * ⛔ **Erano quattro controlli diversi**, scelti da uno `@switch (kind)`: menu
 * per i valori, campo di ricerca per il testo, due caselle per gli intervalli,
 * due campi data. E la forma la decideva la PRESENTAZIONE della colonna —
 * `display: 'code'` o `'truncate'` mandavano a «testo» — cioè una decisione che
 * col filtro non c'entra niente.
 *
 * Il proprietario l'ha detto guardandolo, il 01/09/2026: _«alcuni funzionano in
 * un modo ed altri hanno un altro funzionamento e non ha senso, andrebbe creato
 * un unico pezzo da applicare sulle colonne»_.
 *
 * ⭐ **Ora è una tendina sola**, nella forma di Danea che ha mandato: l'elenco
 * dei valori spuntabili, la ricerca che restringe anche le righe, il verso
 * Includi/Escludi, «Tutti», e — se la colonna è una data o un numero — gli
 * estremi, **dentro il pannello**.
 *
 * ## Che cosa resta del `kind`
 *
 * ```text
 * PRIMA   decideva COME si restringe   → quattro filtri incompatibili
 * ORA     decide CHE COSA offre il pannello: gli estremi su una data o su un
 *         numero, i soli valori su tutto il resto
 * ```
 *
 * A restringere sono le restrizioni presenti nel valore, e possono convivere
 * (`applicaFiltriDiColonna`).
 *
 * ## ⛔ Il vuoto TOGLIE il filtro
 *
 * Svuotare emette `null`, non un valore vuoto: è l'unico modo per togliere una
 * restrizione, e confonderlo con «filtra per niente» farebbe tornare zero righe
 * senza spiegazione.
 */
@Component({
  selector: 'app-column-filter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DateInputComponent, SegmentedComponent, SelectMenuComponent],
  templateUrl: './column-filter.component.html',
  styleUrl: './column-filter.component.scss',
})
export class ColumnFilterComponent {
  private static nextInstanceId = 0;

  /**
   * ⭐ **Ogni campo ha un `id` proprio.**
   *
   * ⚠️ Il browser segnala «a form field element should have an id or name
   * attribute» su ogni controllo che ne è privo — ventidue su una sola pagina,
   * misurati il 01/09/2026 — e la segnalazione è giusta: senza id un campo non
   * si può associare a un'etichetta né raggiungere da un test.
   *
   * ⛔ **E toglie un id CONDIVISO**: `app-date-input` senza `inputId` ripiega su
   * `date-input-parse-error` per il proprio messaggio d'errore, quindi due campi
   * data nella stessa riga filtri lo userebbero entrambi.
   */
  private readonly istanza = ++ColumnFilterComponent.nextInstanceId;
  protected readonly campoDaId = `column-filter-min-${this.istanza}`;
  protected readonly campoAId = `column-filter-max-${this.istanza}`;
  protected readonly campoDalId = `column-filter-from-${this.istanza}`;
  protected readonly campoAlId = `column-filter-to-${this.istanza}`;

  /** Che cosa il pannello OFFRE: gli estremi, o i soli valori. */
  readonly kind = input.required<TableColumnFilterKind>();

  /** Il nome della colonna: serve al nome accessibile del controllo. */
  readonly columnLabel = input.required<string>();

  /** I valori distinti presenti nelle righe caricate. */
  readonly options = input<readonly string[]>([]);

  readonly value = input<ColumnFilterValue | null>(null);

  /** `null` toglie il filtro da questa colonna. */
  readonly changed = output<ColumnFilterValue | null>();

  protected readonly MODI: readonly SegmentedOption[] = [
    { value: 'includi', label: 'Includi' },
    { value: 'escludi', label: 'Escludi' },
  ];

  protected readonly menuOptions = computed<readonly SelectMenuOption[]>(() =>
    this.options().map((v) => ({ value: v, label: v })),
  );

  protected readonly selezionati = computed<readonly string[]>(() => this.value()?.values ?? []);
  protected readonly testo = computed(() => this.value()?.text ?? '');
  protected readonly minimo = computed(() => this.value()?.min ?? null);
  protected readonly massimo = computed(() => this.value()?.max ?? null);
  protected readonly dal = computed(() => this.value()?.dateFrom);
  protected readonly al = computed(() => this.value()?.dateTo);

  /**
   * ⭐ **IL VERSO SCELTO PRIMA DEI VALORI** — trovato in un browser vero il
   * 01/09/2026, con la sequenza che qualunque operatore usa per prima:
   *
   * ```text
   * premo «Escludi»  → selezione vuota → emesso null → il verso si perdeva
   * scelgo «Napoli»  → verso = includi → mostrava Napoli invece di escluderla
   * ```
   *
   * ⚠️ **Non può stare nello stato dei filtri**: il negozio cancella per
   * contratto ogni valore che non restringe, e «escludi niente» non restringe.
   * È un'intenzione del controllo, e vive quanto il controllo — spegnendo i
   * filtri sparisce con lui, che è il comportamento giusto (spegnere azzera).
   */
  private readonly versoInAttesa = signal(false);

  protected readonly escludendo = computed(() => this.value()?.exclude ?? this.versoInAttesa());

  /** «Tutti» è spento quando non c'è niente da togliere. */
  protected readonly qualcosaDaTogliere = computed(() => {
    const v = this.value();
    return (
      (v?.values?.length ?? 0) > 0 ||
      (v?.text?.trim().length ?? 0) > 0 ||
      v?.min !== undefined ||
      v?.max !== undefined ||
      v?.dateFrom !== undefined ||
      v?.dateTo !== undefined
    );
  });

  /**
   * ⚠️ **Il nome accessibile DICE il verso.** Il pulsante mostra solo il nome
   * della colonna (`labelOnly`, per non far ballare la tabella) più un'icona:
   * chi non vede l'icona non saprebbe che quel filtro esclude invece di
   * includere, e i due danno risultati opposti.
   */
  protected readonly etichettaControllo = computed(() =>
    this.escludendo()
      ? `Filtra per ${this.columnLabel()}, escludendo i valori scelti`
      : `Filtra per ${this.columnLabel()}`,
  );

  protected onValues(scelti: readonly string[]): void {
    this.emetti({ values: [...scelti] });
  }

  /**
   * ⭐ **La ricerca del pannello RESTRINGE anche le righe**, ed è ciò che il
   * proprietario chiedeva: «città contiene il sistema per selezionare o
   * filtrare, ma altri campi no, solo filtrare scrivendo».
   *
   * Scrivere «ros» restringe subito, senza dover spuntare niente; spuntare
   * restringe ai valori esatti. Le due cose convivono nello stesso valore.
   */
  protected onRicerca(testo: string): void {
    this.emetti({ text: testo });
  }

  /**
   * ⚠️ **Cambiare verso NON cambia la selezione**: si sceglie «Milano, Roma» e
   * poi si decide se vederle o escluderle. È il motivo per cui si cambia verso.
   */
  protected onModo(modo: string): void {
    const escludi = modo === 'escludi';
    // Prima si ricorda, poi si emette: a mani vuote l'emissione è `null` e
    // l'unica traccia del verso resta questa.
    this.versoInAttesa.set(escludi);
    this.emetti({ exclude: escludi });
  }

  /**
   * ⭐ **«Tutti» toglie il filtro**, come il `(Tutto)` di Danea: qui «nessuna
   * restrizione» è già «tutte le righe».
   *
   * ⚠️ **E riporta il verso a «Includi»**: chi vuole vedere tutto non sta
   * escludendo, e lasciarlo acceso cambierebbe significato alla prima voce
   * spuntata dopo.
   */
  protected onTutti(): void {
    this.versoInAttesa.set(false);
    this.changed.emit(null);
  }

  protected onMin(evento: Event): void {
    this.emetti({ min: this.numero(evento) ?? undefined });
  }

  protected onMax(evento: Event): void {
    this.emetti({ max: this.numero(evento) ?? undefined });
  }

  /**
   * ⚠️ **`app-date-input` emette la stringa vuota per «nessuna data»**, non
   * `undefined`: senza normalizzarla il filtro resterebbe attivo su un estremo
   * vuoto, e l'elenco non tornerebbe più intero.
   */
  protected onDal(testo: string): void {
    this.emetti({ dateFrom: testo.trim() ? testo : undefined });
  }

  protected onAl(testo: string): void {
    this.emetti({ dateTo: testo.trim() ? testo : undefined });
  }
  /**
   * ⭐ **Una sola porta d'uscita**: si parte dal valore corrente e si cambia
   * solo ciò che l'operatore ha toccato. Le restrizioni convivono, quindi
   * scrivere un testo non deve cancellare le spunte né gli estremi.
   *
   * ⛔ **Il vuoto emette `null`**, ed è l'unico modo di togliere il filtro.
   */
  private emetti(cambio: Partial<Omit<ColumnFilterValue, 'kind'>>): void {
    const attuale = this.value();
    const prossimo: ColumnFilterValue = {
      kind: this.kind(),
      values: cambio.values ?? attuale?.values,
      text: cambio.text ?? attuale?.text,
      /*
        ⛔ **Il verso si legge da `escludendo()`, non dal valore corrente.**
        Leggendolo da `attuale?.exclude` si perdeva il verso scelto A MANI
        VUOTE: lì `attuale` è `null` — perché senza restrizioni si emette
        `null` — e la prima voce spuntata sarebbe tornata a «includi», cioè
        l'opposto di quanto chiesto.
      */
      exclude: cambio.exclude ?? this.escludendo(),
      /*
        ⚠️ **Gli estremi si sovrascrivono anche con `undefined`**, e i valori
        no: svuotare un campo data DEVE togliere quell'estremo, mentre
        `values`/`text` arrivano solo quando cambiano davvero. Con `??` su tutto,
        svuotare «dal» avrebbe rimesso il valore di prima.
      */
      min: 'min' in cambio ? cambio.min : attuale?.min,
      max: 'max' in cambio ? cambio.max : attuale?.max,
      dateFrom: 'dateFrom' in cambio ? cambio.dateFrom : attuale?.dateFrom,
      dateTo: 'dateTo' in cambio ? cambio.dateTo : attuale?.dateTo,
    };

    const restringe =
      (prossimo.values?.length ?? 0) > 0 ||
      (prossimo.text?.trim().length ?? 0) > 0 ||
      prossimo.min !== undefined ||
      prossimo.max !== undefined ||
      prossimo.dateFrom !== undefined ||
      prossimo.dateTo !== undefined;

    this.changed.emit(restringe ? prossimo : null);
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
    // ⚠️ La virgola è il separatore decimale italiano: `Number('12,50')` è NaN.
    const valore = Number(grezzo.replace(',', '.'));
    return Number.isFinite(valore) ? valore : null;
  }
}
