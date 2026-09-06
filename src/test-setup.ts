import '@testing-library/jest-dom/vitest';

import { vi } from 'vitest';

// I form pesanti (arrivo merce, registrazione fattura) superano il timeout
// di default (5s) quando l'intera suite gira in parallelo su macchine
// cariche: da soli passano in 2-3s. Il margine evita falsi negativi.
vi.setConfig({ testTimeout: 20_000 });

/**
 * **jsdom non implementa `<dialog>`**: senza questo, aprire un dialogo esplode
 * con «showModal is not a function». È un limite dell'ambiente di prova, non
 * del componente.
 *
 * ⛔ **Stava copiato in TRE spec** — anagrafica prodotto via wizard Shopify,
 * Fatture/DDT, Ordine fornitore — ognuna col suo `beforeAll` identico. Portato
 * qui il 25/08/2026 mentre si montava la barra azioni comune: la prova nuova
 * del Trasferimento esplodeva proprio perché quella spec la copia non ce
 * l'aveva.
 *
 * ⚠️ **E la copia mancante non si vedeva.** Una maschera il cui dialogo nessuna
 * prova apre passa lo stesso: il difetto compare solo il giorno in cui qualcuno
 * scrive la prova che lo apre. Da quando il dialogo d'uscita è
 * `app-confirm-dialog` — cioè un `<dialog>` vero — in tredici maschere, quel
 * giorno arriva per tutte.
 *
 * ⭐ La guardia `if (!proto.showModal)` resta: se un domani jsdom lo
 * implementasse davvero, questo si fa da parte invece di sovrascriverlo.
 */
const dialogProto = globalThis.HTMLDialogElement?.prototype;
if (dialogProto && !dialogProto.showModal) {
  dialogProto.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  dialogProto.close = function close(this: HTMLDialogElement) {
    this.open = false;
  };
}

/**
 * **jsdom non implementa `ResizeObserver`**, e il motore tabella lo usa per la
 * finestra di rendering. Senza, ogni prova di un elenco con `virtualizza`
 * acceso stampa `ReferenceError: ResizeObserver is not defined` — un errore
 * dentro `afterNextRender`, che Angular registra e non propaga: le prove
 * passano, e l'errore resta a scorrere nel registro.
 *
 * ⛔ **Questo doppio NON invoca mai la richiamata, ed è la parte deliberata.**
 * jsdom non impagina: non esiste nessuna dimensione vera da comunicare, e
 * fabbricarne una vorrebbe dire far credere alle prove di aver misurato. Un
 * ridimensionamento che non avviene non si annuncia — che è esattamente ciò che
 * fa un `ResizeObserver` reale su un documento che non cambia mai geometria.
 *
 * ⚠️ **Le verifiche geometriche decisive non stanno qui**, e non possono
 * starci: altezze delle card, offset, ancoraggio dello scorrimento e finestra
 * si provano nel browser vero (`e2e/cassa-render-window.spec.ts`,
 * `e2e/cassa-prestazioni.spec.ts`). Qui si toglie di mezzo un'assenza di API,
 * non si simula un motore di impaginazione.
 */
if (!('ResizeObserver' in globalThis)) {
  class ResizeObserverAssente implements ResizeObserver {
    private readonly osservati = new Set<Element>();

    constructor(private readonly callback: ResizeObserverCallback) {
      // La richiamata si conserva per rispettare il contratto del costruttore:
      // non viene invocata, perché in jsdom non accade nessun ridimensionamento.
      void this.callback;
    }

    observe(target: Element): void {
      this.osservati.add(target);
    }

    unobserve(target: Element): void {
      this.osservati.delete(target);
    }

    disconnect(): void {
      this.osservati.clear();
    }
  }

  Object.defineProperty(globalThis, 'ResizeObserver', {
    value: ResizeObserverAssente,
    writable: true,
    configurable: true,
  });
}
