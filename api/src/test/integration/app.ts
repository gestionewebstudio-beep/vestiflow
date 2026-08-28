import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SignJWT } from 'jose';

import { AppModule } from '../../app.module';
import { AllExceptionsFilter } from '../../common/filters/all-exceptions.filter';
import { createValidationExceptionFactory } from '../../common/validation/validation-exception.factory';
import { EMITTENTE_INTEGRAZIONE, SEGRETO_INTEGRAZIONE } from './setup';

/**
 * L'applicazione Nest **vera**, in ascolto su una porta effimera.
 *
 * ⭐ **Le richieste passano da un socket, non da un mock.** Il percorso
 *    esercitato è quello di produzione per intero:
 *
 * ```text
 *   HTTP → JwtAuthGuard → controller → service → PrismaService → PostgreSQL TEST
 * ```
 *
 * ⛔ **Nessuna guardia è sostituita, nessun `@CurrentUser()` è iniettato a
 *    mano.** È il punto: una prova che chiamasse il service direttamente non
 *    certificherebbe la sola cosa che qui va certificata — che l'identità
 *    ARRIVI dal controller al service. È esattamente il difetto trovato sei
 *    volte in `docs/21`: guardia presente nel codice, assente nell'esecuzione,
 *    con i test del servizio verdi.
 *
 * ⚠️ **Zero dipendenze nuove.** Niente `@nestjs/testing`, niente `supertest`:
 *    `NestFactory.create` + `fetch` (nativo da Node 18) bastano, e danno una
 *    richiesta più vera di quella sintetica di supertest.
 */

/**
 * Replica di `main.ts`: prefisso, filtro e validazione DEVONO essere quelli
 * veri.
 *
 * ⚠️ Le opzioni della `ValidationPipe` sono copiate alla lettera —
 * `forbidNonWhitelisted: true`, `enableImplicitConversion: false`, la stessa
 * `exceptionFactory`. Una pipe più permissiva accetterebbe corpi che in
 * produzione vengono rifiutati, e la prova direbbe di sorvegliare una regola
 * che non sta esercitando.
 */
async function creaApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      exceptionFactory: createValidationExceptionFactory(),
    }),
  );
  app.setGlobalPrefix('api/v1');
  return app;
}

export interface AppIntegrazione {
  readonly baseUrl: string;
  /**
   * Un token che `JwtAuthGuard` verifica DAVVERO.
   *
   * ⭐ Firmato HS256 col segreto che `setup.ts` ha dichiarato per la suite, con
   *    l'emittente locale: la verifica avviene in memoria e non parte nessuna
   *    chiamata di rete verso Supabase.
   *
   * ⚠️ `aal: 'aal2'` non è un trucco per saltare un controllo di autorizzazione:
   *    evita il solo ramo MFA, che interrogherebbe l'Admin API di Supabase. I
   *    controlli di sede restano tutti, e girano sul profilo che il guard legge
   *    dal database di prova.
   */
  token(authUserId: string): Promise<string>;
  chiudi(): Promise<void>;
}

export async function avviaApp(): Promise<AppIntegrazione> {
  const app = await creaApp();
  // Porta 0 = il sistema ne sceglie una libera: due esecuzioni in parallelo non
  // si contendono un numero fisso.
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl();
  const segreto = new TextEncoder().encode(SEGRETO_INTEGRAZIONE);

  return {
    baseUrl: `${url.replace('[::1]', '127.0.0.1')}/api/v1`,
    async token(authUserId: string): Promise<string> {
      return new SignJWT({ aal: 'aal2', role: 'authenticated' })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(authUserId)
        .setIssuer(`${EMITTENTE_INTEGRAZIONE}/auth/v1`)
        .setAudience('authenticated')
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(segreto);
    },
    async chiudi(): Promise<void> {
      await app.close();
    },
  };
}

/** Esito grezzo di una chiamata: stato e corpo, senza interpretazioni. */
export interface Risposta {
  readonly stato: number;
  readonly corpo: unknown;
}

export async function chiama(
  app: AppIntegrazione,
  metodo: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  percorso: string,
  opzioni: { readonly token?: string; readonly corpo?: unknown } = {},
): Promise<Risposta> {
  const intestazioni: Record<string, string> = {};
  if (opzioni.token) {
    intestazioni['authorization'] = `Bearer ${opzioni.token}`;
  }
  if (opzioni.corpo !== undefined) {
    intestazioni['content-type'] = 'application/json';
  }

  const risposta = await fetch(`${app.baseUrl}${percorso}`, {
    method: metodo,
    headers: intestazioni,
    body: opzioni.corpo === undefined ? undefined : JSON.stringify(opzioni.corpo),
  });

  const testo = await risposta.text();
  let corpo: unknown = testo;
  try {
    corpo = testo ? JSON.parse(testo) : null;
  } catch {
    // Non JSON: resta il testo grezzo, che in un fallimento dice più del null.
  }
  return { stato: risposta.status, corpo };
}
