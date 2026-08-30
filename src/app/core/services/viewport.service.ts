import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';

import { DEFAULT_VIEW_MODE, VIEW_MODES, type ViewMode } from '@shared/models/view-mode.model';

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
 * ⚠️ **La scelta vive nel DISPOSITIVO, non sul profilo utente.**
 *
 * È una proprietà di QUESTO schermo: chi impone la vista compatta sul monitor
 * touch del banco non la vuole anche sul portatile di casa. Sincronizzarla fra
 * dispositivi sarebbe il difetto, non la funzione — ed è la stessa ragione per
 * cui il tema si comporta così.
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

  /** Cosa dice la LARGHEZZA, prima che l'operatore ci metta bocca. */
  readonly automatico = this._compact.asReadonly();

  private readonly _mode = signal<ViewMode>(this.leggiModo());

  /** La scelta dell'operatore: automatica, sempre compatta, sempre estesa. */
  readonly mode = this._mode.asReadonly();

  /*
    ⭐ **La domanda a cui i 17 consumatori rispondono è sempre la stessa** — «è
    viva la vista a card?» — e questo è il solo punto in cui cambia la risposta.

    ⛔ Nessuno di loro deve sapere che esiste una scelta manuale: se dovessero
    combinare soglia e preferenza per conto proprio, la vista tornerebbe a essere
    decisa in diciassette posti, che è il difetto da cui questo servizio nasce.
  */
  readonly compact = computed(() => {
    const scelto = this._mode();
    if (scelto === 'compact') {
      return true;
    }
    if (scelto === 'wide') {
      return false;
    }
    return this._compact();
  });

  setMode(mode: ViewMode): void {
    this._mode.set(mode);
    this.scriviModo(mode);
  }

  constructor() {
    /*
      ⭐ **L'attributo sulla radice è il ponte verso il CSS**, che una scelta
      dell'applicazione non la può leggere in nessun altro modo.

      Lo legge il mixin `vista-compatta` di `styles/_breakpoints.scss`, usato nei
      soli tre punti in cui la riga diventa card. ⚠️ Si scrive **solo** quando la
      vista compatta è imposta: in automatico l'attributo non c'è, quindi il ramo
      non esiste e nessuna regola cambia peso — è la ragione per cui questa metà
      è a rischio zero per chi non usa l'impostazione.

      ⚠️ È lo stesso schema del tema (`theme.service.ts:42`), e deve restarlo: due
      modi di scrivere una preferenza sulla radice sarebbero due posti da tenere
      allineati.
    */
    effect(() => {
      const radice = this.document.documentElement;
      if (this._mode() === 'compact') {
        radice.setAttribute('data-vista', 'compatta');
      } else {
        radice.removeAttribute('data-vista');
      }
    });

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
   * ⚠️ Il ripiego è `auto` a ogni intoppo — `localStorage` assente in modalità
   * privata, valore scritto a mano, schermata di prova senza `window`: la
   * larghezza decide, che è il comportamento di sempre.
   */
  private leggiModo(): ViewMode {
    try {
      const salvato = this.document.defaultView?.localStorage.getItem(VIEW_MODE_KEY);
      return VIEW_MODES.includes(salvato as ViewMode) ? (salvato as ViewMode) : DEFAULT_VIEW_MODE;
    } catch {
      return DEFAULT_VIEW_MODE;
    }
  }

  private scriviModo(mode: ViewMode): void {
    try {
      this.document.defaultView?.localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      // Ripiego silenzioso: la scelta vale per questa sessione e non si ricorda.
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
