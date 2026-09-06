/**
 * ⭐ **Quale vista mostrare: la decide la larghezza, o l'operatore.**
 *
 * Deciso dal proprietario il 30/08/2026: «un selettore per scegliere la vista
 * normale automatica, la vista fissa mobile e la vista fissa desktop. In questo
 * modo si risolve il problema dei pc troppo piccoli o tablet troppo grandi».
 *
 * ⛔ **Sostituisce la doppia soglia per tipo di puntatore** che
 * `regole-stile-ui` §9 dichiarava dall'11/08/2026 — mouse 820px, dito 1400px —
 * e che non è mai stata eseguita.
 *
 * ⭐ **La ragione era già dentro quella regola**, che non l'aveva applicata a se
 * stessa: _«nessuna linea fissa sulla larghezza chiude la questione: alzandola a
 * 1280 resta fuori l'iPad Pro (1366), alzandola ancora se ne trova un altro
 * sopra»_. Vale identico per le soglie del puntatore — restano fuori il monitor
 * touch grande, il 2-in-1 con tastiera staccata, il portatile stretto — e ogni
 * caso sbagliato costa all'operatore un giro nelle impostazioni.
 *
 * Un selettore a tre stati **non deve indovinare niente**: chi ha un caso limite
 * lo dichiara una volta.
 */
/*
  ⏸ **NESSUNO importa più questo file, ed è voluto.**

  Il selettore è stato ritirato il 30/08/2026 — non prima della rifattorizzazione
  che gli serve (`docs/DA-FARE.md`) — e `ViewportService` è tornato a decidere
  con la sola larghezza. Queste definizioni restano perché sono la parte già
  decisa: i tre stati, i loro nomi e il motivo per cui si chiamano «compatta» ed
  «estesa». ⛔ Non sono in uso: chi le ritrova non concluda che la funzione c'è.
*/
export type ViewMode = 'auto' | 'compact' | 'wide';

export const VIEW_MODES: readonly ViewMode[] = ['auto', 'compact', 'wide'];

/**
 * ⚠️ **Il default è `auto`, e deve restarlo**: la soglia sbaglia solo sui casi
 * limite, e partire da una vista imposta li renderebbe la regola invece che
 * l'eccezione.
 */
export const DEFAULT_VIEW_MODE: ViewMode = 'auto';

export const VIEW_MODE_LABELS: Readonly<Record<ViewMode, string>> = {
  auto: 'Automatica',
  compact: 'Sempre compatta',
  wide: 'Sempre estesa',
};

/**
 * ⚠️ **«Compatta» ed «estesa», non «mobile» e «desktop»**: nominano ciò che si
 * vede, non il dispositivo che si suppone. Chi sceglie «Sempre compatta» su un
 * monitor da 27 pollici non sta dichiarando di essere su un telefono — sta
 * dicendo che vuole le card.
 */
export const VIEW_MODE_HINTS: Readonly<Record<ViewMode, string>> = {
  auto: 'Card su schermi stretti, tabelle su quelli larghi.',
  compact: 'Sempre card, a qualunque larghezza. Utile su monitor touch e tablet grandi.',
  wide: 'Sempre tabelle, a qualunque larghezza. Utile su portatili stretti.',
};
