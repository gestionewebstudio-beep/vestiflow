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
 * ⏸ **La chiave della scelta manuale, che oggi si CANCELLA e basta.**
 *
 * ⛔ Il selettore di vista è stato ritirato il 30/08/2026 e la sua meccanica è
 * rimasta collegata: nessuna schermata poteva più scrivere questo valore, ma chi
 * l'aveva scritto durante le prove restava **bloccato in vista compatta a
 * qualunque larghezza, senza un modo per tornare indietro**.
 *
 * ⚠️ **E non si vedeva come un blocco.** L'app mostrava le due vesti insieme —
 * card sotto un'intestazione di tabella, «Seleziona» e i filtri del telefono su
 * uno schermo da 1338px — perché metà delle regole compatte risponde
 * all'attributo sulla radice e l'altra metà a una media query: è esattamente il
 * difetto misurato il 30/08 che ha fatto ritirare il selettore, ed è arrivato
 * agli occhi del proprietario prima che il ponte fosse staccato.
 *
 * ⭐ **Si cancella invece di ignorarla**, e la ragione è che ignorarla sarebbe
 * una mina: il giorno in cui il selettore torna, quel valore rimasto lì
 * riporterebbe lo stesso schermo in vista compatta senza che nessuno l'abbia
 * chiesto. Non si perde una scelta di nessuno — non c'era nessun posto dove
 * farla.
 */
const VIEW_MODE_KEY = 'vestiflow.view-mode';

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

  /*
    ⭐ **La domanda a cui i 17 consumatori rispondono è sempre la stessa** — «è
    viva la vista a card?» — e questo è il solo punto in cui si risponde.

    ⏸ Qui passava anche la scelta manuale dell'operatore. È tornata a essere la
    sola larghezza finché il selettore non è finito davvero: vedi `VIEW_MODE_KEY`.
  */
  readonly compact = this._compact.asReadonly();

  constructor() {
    this.dimenticaModoImposto();

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
  /**
   * Toglie dal browser la vista imposta durante le prove del selettore ritirato.
   *
   * ⚠️ **Silenzioso a ogni intoppo** — `localStorage` assente in modalità privata,
   * schermata di prova senza `window`: non c'è niente da salvare e niente da
   * riferire, la larghezza decide comunque.
   */
  private dimenticaModoImposto(): void {
    try {
      this.document.defaultView?.localStorage.removeItem(VIEW_MODE_KEY);
    } catch {
      // Nessun rimedio possibile, e nessuno serve: `compact` non lo legge più.
    }
  }

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
