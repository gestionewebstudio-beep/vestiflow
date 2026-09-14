import { lookup } from 'node:dns/promises';

/**
 * Un INDIRIZZO IP appartiene alla rete pubblica?
 *
 * ⛔ **È la domanda che conta davvero.** Controllare il nome ferma
 *    `https://127.0.0.1/...`, e basta: un dominio pubblico che risolve verso la
 *    rete interna passerebbe indisturbato, ed è il modo in cui si fa fare a un
 *    server una richiesta che non farebbe mai.
 */
export function isIndirizzoIpPrivato(indirizzo: string): boolean {
  const ip = indirizzo.trim().toLowerCase().replace(/^\[|\]$/g, '');

  // IPv4 mappato in IPv6 (`::ffff:10.0.0.1`): conta l'IPv4 che porta dentro.
  const mappato = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(ip);
  if (mappato) {
    return isIndirizzoIpPrivato(mappato[1]!);
  }

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    return (
      a === 0 || // 0.0.0.0/8 — «questa rete»
      a === 10 || // 10/8
      a === 127 || // 127/8 — loopback
      (a === 100 && b >= 64 && b <= 127) || // 100.64/10 — CGNAT
      (a === 169 && b === 254) || // 169.254/16 — link-local, i metadati delle VM
      (a === 172 && b >= 16 && b <= 31) || // 172.16/12
      (a === 192 && b === 168) || // 192.168/16
      (a === 198 && (b === 18 || b === 19)) || // 198.18/15 — banco di prova
      a >= 224 // 224/4 multicast e 240/4 riservato
    );
  }

  if (ip.includes(':')) {
    return (
      ip === '::' || // non specificato
      ip === '::1' || // loopback
      /^f[cd]/.test(ip) || // fc00::/7 — unique local
      /^fe[89ab]/.test(ip) // fe80::/10 — link-local
    );
  }

  // ⚠️ Non è un indirizzo che sappiamo leggere: si rifiuta. Un formato ignoto
  //    non è una garanzia di pubblicità.
  return true;
}

/**
 * Un nome host è INTERNO — cioè non appartiene alla rete pubblica?
 *
 * ⭐ **È un fatto solo, e serve a due domande diverse**: «Shopify può consegnare
 *    qui?» (`shopify-webhook-address.util.ts`) e «possiamo scaricare da qui?»
 *    (sotto). Le due domande restano separate; a essere comune è la risposta su
 *    che cosa sia un indirizzo interno.
 *
 * ⚠️ **Guarda solo il NOME**: è il filtro a costo zero, non la verifica. Quella
 *    la fa `destinazioneRisoltaPubblica`, che risolve prima di connettersi.
 */
export function isHostnamePrivato(hostname: string): boolean {
  const nome = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    nome === 'localhost' ||
    nome.endsWith('.local') ||
    nome.endsWith('.localhost') ||
    nome.endsWith('.internal')
  ) {
    return true;
  }
  // Un indirizzo scritto per esteso nell'URL si giudica come indirizzo.
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(nome) || nome.includes(':')) {
    return isIndirizzoIpPrivato(nome);
  }
  return false;
}

/**
 * Il controllo SINTATTICO: https, e nessun indirizzo interno scritto per esteso.
 *
 * ⚠️ **Non basta da solo.** Ferma i casi grossolani senza toccare la rete; la
 *    destinazione vera la stabilisce `destinazioneRisoltaPubblica`.
 */
export function isUrlScaricabile(indirizzo: string | null | undefined): boolean {
  if (!indirizzo) {
    return false;
  }
  let url: URL;
  try {
    url = new URL(indirizzo);
  } catch {
    return false;
  }
  // ⛔ Solo https: in chiaro il contenuto è alterabile lungo la strada, e i
  //    servizi di metadati delle macchine virtuali rispondono in http.
  if (url.protocol !== 'https:') {
    return false;
  }
  return !isHostnamePrivato(url.hostname);
}

/** Come si risolve un nome. Sostituibile nelle prove: qui non si tocca la rete. */
export type RisolutoreNomi = (
  nome: string,
) => Promise<readonly { readonly address: string }[]>;

const risolutorePredefinito: RisolutoreNomi = (nome) => lookup(nome, { all: true, verbatim: true });

export type EsitoDestinazione = { readonly pubblica: true } | { readonly pubblica: false; readonly motivo: string };

/**
 * La destinazione che verrà CONTATTATA è pubblica?
 *
 * ⛔ **Si risolve PRIMA di aprire la connessione**, e si rifiuta **se anche uno
 *    solo** degli indirizzi restituiti è interno: chi controlla il DNS può
 *    rispondere con una coppia — uno pubblico e uno privato — e non si sa quale
 *    verrà scelto. «Almeno uno va bene» qui non è una garanzia.
 *
 * ⚠️ **Resta una finestra, e va detta invece che nascosta**: fra la risoluzione
 *    e la connessione il nome può essere ri-risolto altrove (DNS rebinding).
 *    Chiuderla del tutto richiede un connettore che verifichi l'indirizzo al
 *    momento di aprire il socket — cioè una dipendenza HTTP sostituibile, che
 *    oggi il progetto non ha. Il rischio residuo è dichiarato in `DA-FARE` §31.28.
 */
export async function destinazioneRisoltaPubblica(
  hostname: string,
  risolvi: RisolutoreNomi = risolutorePredefinito,
): Promise<EsitoDestinazione> {
  const nome = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  // Un indirizzo letterale non si risolve: è già la destinazione.
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(nome) || nome.includes(':')) {
    return isIndirizzoIpPrivato(nome)
      ? { pubblica: false, motivo: `l'indirizzo ${nome} non è pubblico` }
      : { pubblica: true };
  }

  let risolti: readonly { readonly address: string }[];
  try {
    risolti = await risolvi(nome);
  } catch {
    return { pubblica: false, motivo: `il nome ${nome} non si risolve` };
  }

  if (risolti.length === 0) {
    return { pubblica: false, motivo: `il nome ${nome} non risolve a nessun indirizzo` };
  }

  const interni = risolti.filter((voce) => isIndirizzoIpPrivato(voce.address));
  if (interni.length > 0) {
    return {
      pubblica: false,
      motivo: `${nome} risolve a un indirizzo interno (${interni.map((v) => v.address).join(', ')})`,
    };
  }

  return { pubblica: true };
}
