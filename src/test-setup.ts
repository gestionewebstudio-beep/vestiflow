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
