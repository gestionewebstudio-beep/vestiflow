import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';

/**
 * Il token da cui nasce la soglia. Il VALORE sta nel CSS e qui non si ripete:
 * è dichiarato in `_design-tokens.scss` a partire da `$breakpoint-lg` e dalla
 * stessa aritmetica di `media-down`, così la soglia che nasconde la tabella e
 * quella che decide chi è vivo nel DOM sono la stessa cosa.
 *
 * `npm run check:tokens` fallisce se questo nome sparisce dal CSS mentre resta
 * qui: senza quella guardia, `getPropertyValue` tornerebbe stringa vuota e
 * l'app resterebbe sulla vista desktop anche su un telefono, in silenzio.
 */
const COMPACT_MAX_TOKEN = '--viewport-compact-max';

/**
 * Quale vista è attiva: compatta (card) o estesa (tabella).
 *
 * **Non è un sistema di breakpoint, ed è voluto.** Non espone `isMobile`, né
 * `sm/md/lg`, né la larghezza: risponde a una domanda sola, quella da cui
 * dipende **quale delle due viste di riga documento è viva nel DOM**. Il resto
 * del responsive resta dove è sempre stato, nel CSS, che è il posto giusto per
 * farlo — questo segnale esiste solo perché il TypeScript ha bisogno di sapere
 * a chi appartengono gli identificativi dei campi.
 *
 * Prima le due viste erano **entrambe vive**: la tabella non veniva rimossa
 * sotto il breakpoint, solo nascosta. Su un documento da trenta righe erano
 * circa 1.700 nodi e 420 controlli resi e invisibili sul telefono, e ogni stato
 * condiviso poteva aprirsi nella vista che non si vede — è già successo con la
 * scelta fra più codici.
 */
@Injectable({ providedIn: 'root' })
export class ViewportService {
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _compact = signal(false);

  /** `true` sotto la soglia: è la vista a card, quella dove si tocca. */
  readonly compact = this._compact.asReadonly();

  constructor() {
    const query = this.mediaQuery();
    if (!query) {
      return;
    }
    this._compact.set(query.matches);
    const onChange = (event: MediaQueryListEvent): void => this._compact.set(event.matches);
    query.addEventListener('change', onChange);
    this.destroyRef.onDestroy(() => query.removeEventListener('change', onChange));
  }

  /**
   * `null` quando la soglia non è leggibile: nei test, dove il foglio di stile
   * globale non è caricato, e in qualunque ambiente senza `matchMedia`. In quel
   * caso resta la vista estesa — è il default anche del CSS, che nasconde la
   * tabella solo dentro la media query.
   */
  private mediaQuery(): MediaQueryList | null {
    const view = this.document.defaultView;
    if (!view?.matchMedia) {
      return null;
    }
    const max = view
      .getComputedStyle(this.document.documentElement)
      .getPropertyValue(COMPACT_MAX_TOKEN)
      .trim();
    return max ? view.matchMedia(`(max-width: ${max})`) : null;
  }
}
