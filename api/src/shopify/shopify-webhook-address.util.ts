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

  return !isPrivateHostname(url.hostname.toLowerCase());
}

function isPrivateHostname(hostname: string): boolean {
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.internal')
  ) {
    return true;
  }

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!ipv4) {
    return false;
  }

  const first = Number(ipv4[1]);
  const second = Number(ipv4[2]);

  // 10/8, 192.168/16, 172.16/12, 169.254/16 (link-local), 127/8.
  return (
    first === 10 ||
    first === 127 ||
    (first === 192 && second === 168) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 169 && second === 254)
  );
}
