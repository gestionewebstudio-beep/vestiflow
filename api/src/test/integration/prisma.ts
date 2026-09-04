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

  return new PrismaClient({
    datasources: { db: { url: ambiente.databaseUrl } },
    // Silenzioso salvo errori: una suite che stampa ogni query rende
    // illeggibile il fallimento che si sta cercando.
    log: ['error'],
  });
}
