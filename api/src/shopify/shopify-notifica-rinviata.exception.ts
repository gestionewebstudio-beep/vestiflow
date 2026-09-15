/**
 * ⭐ «Questa notifica NON si applica adesso, ma non è persa» (docs/30 §7.3.1, decisione
 *    D8(b) del proprietario, 15/09/2026).
 *
 * La lancia chi elabora un webhook quando una condizione locale e temporanea impedisce
 * l'effetto — oggi: l'articolo è `syncing`, cioè una pubblicazione verso Shopify è in
 * corso (o lo era, in un processo poi interrotto). La coda la tratta come TRANSITORIA:
 * conserva la stessa ricevuta e la rinvia con le attese approvate (1·5·15·30·60 min);
 * esauriti i tentativi la ricevuta è `fallita`, visibile col motivo e con «Riprova».
 *
 * ⛔ Prima la notifica usciva «elaborata» senza effetto: un cambiamento fatto sul negozio
 *    non arrivava mai e nessuno lo diceva. ⛔ Nessun orologio dichiara morto il push:
 *    l'eccezione dice solo che l'effetto non si applica ORA. E al fallimento definitivo
 *    lo stato dell'articolo NON si tocca (D9(a): nessun reset per anzianità) — resta
 *    `syncing`, e il motivo spiega all'operatore come sbloccarlo e che cosa comporta.
 */
export class NotificaDaRinviareException extends Error {
  constructor(
    /** Il motivo per chi legge, già scritto per l'operatore. */
    readonly motivo: string,
  ) {
    super(motivo);
    this.name = 'NotificaDaRinviareException';
  }
}

/** Il motivo che l'operatore legge quando un articolo `syncing` trattiene la notifica. */
export function motivoArticoloInSincronizzazione(nomeArticolo: string): string {
  return (
    `L'articolo «${nomeArticolo}» risulta in sincronizzazione verso Shopify: la notifica ` +
    'è rinviata e si applica quando la pubblicazione finisce. Se nessuna pubblicazione è in ' +
    'corso, lo stato è rimasto bloccato da un’interruzione: «Sincronizza con Shopify» dal ' +
    'dettaglio articolo lo sblocca — attenzione, pubblica sul negozio i dati locali.'
  );
}
