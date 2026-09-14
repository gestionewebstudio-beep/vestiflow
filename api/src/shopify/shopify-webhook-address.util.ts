/**
 * Shopify puo' consegnare a questo indirizzo?
 *
 * Serve a non trasformare un ambiente di sviluppo in un allarme. Il confronto fra
 * l'indirizzo osservato sul negozio e quello configurato ha senso **solo se il secondo e'
 * un indirizzo a cui Shopify potrebbe davvero consegnare**: `http://localhost:3000` non e'
 * un riferimento sbagliato, e' l'assenza di un riferimento — nessuna sottoscrizione potra'
 * mai puntarci, quindi trovarlo diverso da quello vero non dice niente su niente.
 *
 * E' anche il motivo per cui il modello `.env.example` distribuisce proprio quel valore
 * (registro 2.2-bis): chi lavora da locale eredita un indirizzo irraggiungibile, e senza
 * questo controllo ogni verifica fatta dal suo computer accenderebbe un rosso su un negozio
 * perfettamente a posto.
 *
 * **Non e' una scorciatoia per stare zitti.** Dove l'indirizzo e' quello pubblico vero il
 * confronto resta acceso e deve dire verde o rosso: un controllo che si spegne per non dare
 * falsi allarmi e non si riaccende mai e' peggio del falso allarme.
 */
// ⭐ Il fatto «questo nome host è interno» è UNO, e lo dice un posto solo:
//    la domanda qui è «Shopify potrebbe consegnare qui?», là è «possiamo
//    scaricare da qui?» — due domande diverse sulla stessa risposta.
import { isHostnamePrivato } from '../common/rete/indirizzo-remoto.util';

export function isShopifyDeliverableAddress(address: string | null | undefined): boolean {
  if (!address) {
    return false;
  }

  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return false;
  }

  if (url.protocol !== 'https:') {
    return false;
  }

  return !isHostnamePrivato(url.hostname);
}
