/**
 * Chi sto per toccare, e devo dirlo prima di toccarlo.
 *
 * ⛔ **Questo modulo esiste per il RESIDUO, non per i comandi di migration.**
 *    Quelli passano da `directUrl`, che non sta piu' in `api/.env`: falliscono
 *    con P1012 prima di connettersi, e non c'e' niente da confermare.
 *
 *    `db seed`, `prisma studio` e gli script `.mjs` passano invece dal CLIENT
 *    Prisma, che usa `DATABASE_URL` — e quella nel `.env` ci resta, perche'
 *    serve all'applicazione. Non e' un buco che si puo' tappare togliendo una
 *    variabile: si chiudera' davvero quando `DATABASE_URL` locale puntera' al
 *    database di prova duplicato.
 *
 * ⭐ **Fino ad allora, l'attrito. E scatta SOLO se il bersaglio non e' locale**,
 *    che e' la parte pensata per durare: il giorno in cui `DATABASE_URL` punta
 *    al duplicato in locale, la conferma smette di comparire da sola. Nessuno
 *    dovra' ricordarsi di togliere niente.
 *
 * ⚠️ **Non si stampa mai l'URL, nemmeno mascherata a meta'.** Del bersaglio si
 *    dice cio' che serve a riconoscerlo — locale o no, la porta, il nome del
 *    database — e nient'altro: host, utente e password restano fuori.
 */
import { createInterface } from 'node:readline';

const ROSSO = '[31m';
const GIALLO = '[33m';
const VERDE = '[32m';
const GRASSETTO = '[1m';
const FINE = '[0m';

/** Host che stanno su questa macchina. */
const HOST_LOCALI = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Descrive un bersaglio senza esporlo.
 *
 * @param {string|undefined} url
 * @returns {{locale: boolean, valida: boolean, descrizione: string}}
 */
export function descriviBersaglio(url) {
  const grezza = url?.trim() ?? '';
  if (!grezza) {
    return { locale: false, valida: false, descrizione: 'non impostato' };
  }
  let analizzata;
  try {
    analizzata = new URL(grezza);
  } catch {
    return { locale: false, valida: false, descrizione: 'non interpretabile' };
  }
  const locale = HOST_LOCALI.has(analizzata.hostname);
  const porta = analizzata.port || '(predefinita)';
  const database = analizzata.pathname.replace(/^\//, '') || '(nessuno)';
  return {
    locale,
    valida: true,
    // ⛔ Niente hostname: su Supabase l'identificativo del progetto sta li'.
    descrizione: locale
      ? `LOCALE (${analizzata.hostname}) · porta ${porta} · database «${database}»`
      : `REMOTO · porta ${porta} · database «${database}»`,
  };
}

function chiediSullaConsole(domanda) {
  return new Promise((risolvi) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    rl.question(domanda, (risposta) => {
      rl.close();
      risolvi(risposta.trim());
    });
  });
}

/**
 * Mostra il bersaglio e, se non e' locale, pretende una conferma.
 *
 * ⚠️ **Senza un terminale la conferma non si puo' chiedere**, e allora si
 *    pretende che sia stata data prima: `--conferma` sulla riga di comando, o
 *    `VESTIFLOW_CONFERMA_BERSAGLIO=1` nell'ambiente. Un comando che in uno
 *    script CI si blocca ad aspettare una risposta e' peggio di uno che
 *    rifiuta: si vede solo dal fatto che non finisce mai.
 *
 * @param {{azione: string, url?: string, argomenti?: string[]}} opzioni
 */
export async function confermaBersaglioOEsci({ azione, url, argomenti = [] }) {
  const bersaglio = descriviBersaglio(url);

  if (!bersaglio.valida) {
    console.error(
      `\n${ROSSO}${GRASSETTO}  Fermo: ${azione} — bersaglio ${bersaglio.descrizione}.${FINE}\n\n` +
        '  DATABASE_URL non e’ utilizzabile. Controlla api/.env.\n',
    );
    process.exit(1);
  }

  if (bersaglio.locale) {
    console.error(`${VERDE}  ${azione} → ${bersaglio.descrizione}${FINE}`);
    return;
  }

  const giaConfermato =
    argomenti.includes('--conferma') || process.env['VESTIFLOW_CONFERMA_BERSAGLIO'] === '1';

  console.error(
    `\n${GIALLO}${GRASSETTO}  ⚠️  ${azione} → ${bersaglio.descrizione}${FINE}\n\n` +
      '  Non e’ un database di prova: e’ il database di sviluppo, ed e’\n' +
      '  condiviso. Quello che scrivi lo vede anche chi ci lavora sopra.\n',
  );

  if (giaConfermato) {
    console.error(`${GIALLO}  Confermato senza chiedere (--conferma).${FINE}\n`);
    return;
  }

  if (!process.stdin.isTTY) {
    console.error(
      `${ROSSO}${GRASSETTO}  Fermo: nessun terminale per chiedere conferma.${FINE}\n\n` +
        '  Rilancia con --conferma, oppure VESTIFLOW_CONFERMA_BERSAGLIO=1.\n',
    );
    process.exit(1);
  }

  const risposta = await chiediSullaConsole('  Scrivi «continua» per procedere: ');
  if (risposta.toLowerCase() !== 'continua') {
    console.error(`\n${ROSSO}  Annullato.${FINE}\n`);
    process.exit(1);
  }
  console.error('');
}
