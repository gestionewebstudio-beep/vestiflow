import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';

/**
 * Larghezza massima del bubble (px): decide da che distanza dal bordo
 * destro il tooltip si ancora al lato destro del trigger. Allineata al
 * max-inline-size del foglio di stile (--select-menu-width-wide, 22rem).
 */
const BUBBLE_MAX_WIDTH_PX = 352;

/**
 * Il respiro dal bordo della finestra quando la bolla non sta né a destra né a
 * sinistra del trigger (telefono): la stessa misura della tendina condivisa.
 */
const MARGINE_DAL_BORDO_PX = 8;

/** Lo spazio fra trigger e bolla (`--space-2`), per decidere il verso. */
const DISTANZA_DAL_TRIGGER_PX = 8;

/** Le identità delle bolle generate, quando il chiamante non ne indica una. */
let progressivo = 0;

@Component({
  selector: 'app-hover-tooltip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.hover-tooltip-host--inline]': 'inline() || icona()',
    // Sull'host, non sul contenitore nel template: un elemento non focalizzabile con
    // questi gestori è un errore di accessibilità per il lint (interactive-supports-focus),
    // e qui a ricevere il fuoco è il trigger dentro — il pulsante «?» o il contenuto proiettato.
    '(pointerdown)': 'onPointerDown()',
    '(keydown.escape)': 'onEscape()',
  },
  templateUrl: './hover-tooltip.component.html',
  styleUrl: './hover-tooltip.component.scss',
})
export class HoverTooltipComponent {
  readonly text = input.required<string>();
  readonly position = input<'top' | 'bottom'>('top');
  /**
   * In linea col testo circostante (es. icona info accanto all'etichetta di
   * un campo): il wrapper non occupa più la riga intera.
   */
  readonly inline = input(false);

  /**
   * Identità della bolla, per chi deve **puntarci** con `aria-describedby`.
   *
   * ⛔ Serve a non duplicare il testo: senza, il chiamante che vuole associare
   * la spiegazione a un comando è costretto a ripeterla in un elemento
   * nascosto — e lo screen reader la sente due volte.
   */
  readonly bubbleId = input<string>('');

  /**
   * ⭐ Il trigger INTEGRATO: un piccolo pulsante «?» accanto a un titolo o a un
   * comando (proprietario, 14/09/2026). È un `<button>`, quindi si raggiunge
   * col Tab e si tocca sul telefono; l'icona resta piccola, l'area premibile
   * vale un pulsante (`--btn-min-height`). Sostituisce le icone `<i tabindex="-1"
   * aria-hidden>` proiettate, che né la tastiera né lo screen reader raggiungono.
   */
  readonly icona = input(false);

  /** Il nome accessibile del pulsante «?»: la bolla ne è la descrizione. */
  readonly etichetta = input('Spiegazione');

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  private readonly idGenerato = `hover-tooltip-${++progressivo}`;

  /**
   * true = il bubble si allinea al bordo destro del trigger (si estende verso
   * sinistra): scelto al volo quando a destra non c'è spazio sufficiente —
   * es. colonne vicine al bordo dello schermo, dove il tooltip diventava una
   * striscia verticale illeggibile.
   */
  protected readonly alignEnd = signal(false);

  /**
   * Né a destra né a sinistra del trigger (telefono, trigger a metà schermo):
   * la bolla si ancora al margine sinistro della finestra e si stringe allo
   * spazio che c'è. Misurato il 14/09/2026 a 390px: ancorata al trigger usciva
   * di 180px, tagliata dal bordo.
   */
  protected readonly scostamento = signal<number | null>(null);
  protected readonly larghezzaMassima = signal<number | null>(null);

  /** Il verso deciso a bolla aperta, se quello richiesto non ci sta. */
  private readonly versoDeciso = signal<'top' | 'bottom' | null>(null);
  protected readonly sotto = computed(() => (this.versoDeciso() ?? this.position()) === 'bottom');

  /** Chiusa da Esc o da un secondo tocco: resta chiusa finché il fuoco non esce. */
  protected readonly chiusa = signal(false);
  private haFuoco = false;

  protected readonly idBolla = computed(() => this.bubbleId() || this.idGenerato);

  protected readonly tooltipLines = computed(() => {
    const value = this.text().trim();
    const match = value.match(/^(.+?)\s(\([^)]+\)\.?)$/);
    if (!match) {
      return { body: value, note: null as string | null };
    }
    return { body: match[1], note: match[2] };
  });

  /** Misura lo spazio a destra PRIMA che il bubble diventi visibile (hover/focus). */
  protected updatePlacement(): void {
    const rect = this.host.nativeElement.getBoundingClientRect();
    const finestra = this.host.nativeElement.ownerDocument.defaultView;
    const larghezzaFinestra = finestra?.innerWidth ?? 0;
    const spazio = Math.max(0, larghezzaFinestra - 2 * MARGINE_DAL_BORDO_PX);
    const largo = Math.min(BUBBLE_MAX_WIDTH_PX, spazio);
    const staADestra = rect.left + largo <= larghezzaFinestra - MARGINE_DAL_BORDO_PX;
    const staASinistra = rect.right - largo >= MARGINE_DAL_BORDO_PX;
    this.alignEnd.set(!staADestra && staASinistra);
    const stretta = !staADestra && !staASinistra;
    this.scostamento.set(stretta ? MARGINE_DAL_BORDO_PX - rect.left : null);
    this.larghezzaMassima.set(stretta ? spazio : null);
    // Il verso si decide a bolla VISIBILE: prima non ha un'altezza da misurare.
    finestra?.requestAnimationFrame(() => this.decidiIlVerso());
  }

  protected onFocusIn(): void {
    this.haFuoco = true;
    this.updatePlacement();
  }

  protected onFocusOut(): void {
    this.haFuoco = false;
    this.chiusa.set(false);
    this.versoDeciso.set(null);
  }

  protected onMouseLeave(): void {
    if (!this.haFuoco) {
      this.chiusa.set(false);
      this.versoDeciso.set(null);
    }
  }

  /**
   * Un tocco (o un clic) sul trigger che ha GIÀ il fuoco richiude la bolla; il
   * tocco dopo la riapre. Sul telefono il fuoco resta sul pulsante dopo il
   * tocco, e senza questo la bolla non si chiuderebbe più se non toccando
   * altrove. Si decide su `pointerdown`, prima che il fuoco arrivi.
   */
  protected onPointerDown(): void {
    if (this.haFuoco) {
      this.chiusa.update((v) => !v);
    }
  }

  protected onEscape(): void {
    this.chiusa.set(true);
  }

  /**
   * Sopra se ci sta, altrimenti sotto (o viceversa se chiesto «sotto»): una bolla
   * sopra un titolo in cima alla regione che scorre resta sotto la barra o fuori
   * dalla regione, cioè non si vede.
   */
  private decidiIlVerso(): void {
    const bolla = this.host.nativeElement.querySelector<HTMLElement>('.hover-tooltip__bubble');
    if (!bolla) {
      return;
    }
    const altezza = bolla.getBoundingClientRect().height;
    if (altezza === 0) {
      return;
    }
    const trigger = this.host.nativeElement.getBoundingClientRect();
    const confine = this.confineVerticale();
    const ciStaSopra = trigger.top - DISTANZA_DAL_TRIGGER_PX - altezza >= confine.alto;
    const ciStaSotto = trigger.bottom + DISTANZA_DAL_TRIGGER_PX + altezza <= confine.basso;
    const richiesto = this.position();
    if (richiesto === 'top' && !ciStaSopra && ciStaSotto) {
      this.versoDeciso.set('bottom');
    } else if (richiesto === 'bottom' && !ciStaSotto && ciStaSopra) {
      this.versoDeciso.set('top');
    } else {
      this.versoDeciso.set(null);
    }
  }

  /** Il primo antenato che scorre o ritaglia in verticale, o la finestra. */
  private confineVerticale(): { readonly alto: number; readonly basso: number } {
    const finestra = this.host.nativeElement.ownerDocument.defaultView;
    let el: HTMLElement | null = this.host.nativeElement.parentElement;
    while (el && finestra) {
      const overflowY = finestra.getComputedStyle(el).overflowY;
      if (overflowY !== 'visible') {
        const r = el.getBoundingClientRect();
        return { alto: r.top, basso: r.bottom };
      }
      el = el.parentElement;
    }
    return { alto: 0, basso: finestra?.innerHeight ?? 0 };
  }
}
