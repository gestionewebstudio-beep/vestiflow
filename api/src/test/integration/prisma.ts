import { PrismaClient } from '@prisma/client';

import { ambienteIntegrazione } from './env';

/**
 * Il client Prisma dei test di integrazione.
 *
 * ⛔ **NON usa `PrismaService`, ed è deliberato.** `PrismaService` costruisce
 *    `super({ transactionOptions })` senza alcun override del datasource:
 *    legge `DATABASE_URL` dall'ambiente del processo, cioè DEV. È proprio il
 *    componente che non si può riusare qui — usarlo significherebbe affidare
 *    l'isolamento a una variabile d'ambiente invece che al codice.
 *
 * ⭐ **L'URL arriva nel COSTRUTTORE.** Un client con `datasources.db.url`
 *    esplicito non guarda `DATABASE_URL` nemmeno se qualcuno la imposta: la
 *    connessione è decisa dal codice, non dall'ambiente in cui gira.
 */
export function creaClientIntegrazione(): PrismaClient {
  // Lancia se la variabile manca, se l'host non è locale, o se coincide con
  // DEV. Sta PRIMA della costruzione del client: nessuna connessione viene
  // aperta finché le barriere non sono passate.
  const ambiente = ambienteIntegrazione();

  // ── §21-bis · nessuna attesa di lock puo' consumare l'hook ───────────────
  //
  // ⛔ **Il `lock_timeout` della sola pulizia non bastava**, e l'ha mostrato la
  //    riproduzione dell'08/09/2026: con una transazione lasciata appesa da una
  //    prova caduta, a bloccarsi non era solo il `TRUNCATE` — erano anche gli
  //    `INSERT` di `creaDataset()`, che nella transazione di pulizia non stanno.
  //    L'hook scadeva lo stesso, e il messaggio tornava a essere muto.
  //
  // ⭐ **A livello di SESSIONE**, quindi vale per ogni query di ogni prova: chi
  //    aspetta un lock oltre la soglia riceve `55P03 lock timeout` con la
  //    query che lo stava aspettando, invece di consumare i 60 s dell'hook.
  //
  // ⚠️ **30 s, non 10**: le prove di concorrenza aspettano lock **apposta**, e
  //    devono poterlo fare. Le loro attese durano meno di un secondo; 30 s
  //    restano sotto l'hook e sopra qualunque attesa legittima misurata.
  //
  // ⚠️ Confinato ai test: questa funzione la usa solo la suite di integrazione.
  const url = new URL(ambiente.databaseUrl);
  url.searchParams.set('options', '-c lock_timeout=30000');

  return new PrismaClient({
    datasources: { db: { url: url.toString() } },
    // Silenzioso salvo errori: una suite che stampa ogni query rende
    // illeggibile il fallimento che si sta cercando.
    log: ['error'],
  });
}
