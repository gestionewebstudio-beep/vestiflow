import { HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { NotificaDaRinviareException } from './shopify-notifica-rinviata.exception';
import { ShopifyTrasportoException } from './shopify-trasporto.util';

/**
 * Le attese fra un fallimento e il ritentativo successivo (docs/30 §7.1.2, D1 —
 * decisione del proprietario, 15/09/2026): un tentativo immediato, poi cinque
 * ritentativi dopo 1, 5, 15, 30 e 60 minuti DAL FALLIMENTO PRECEDENTE.
 *
 * ⚠️ La somma (111 min) non è un tempo massimo garantito: contano anche le
 *    elaborazioni, l'arretrato della corsia e le indisponibilità.
 */
export const ATTESE_RITENTATIVO_MS: readonly number[] = [1, 5, 15, 30, 60].map(
  (minuti) => minuti * 60_000,
);

/** Tentativi conclusi ammessi in automatico: il primo più i cinque ritentativi. */
export const TENTATIVI_MASSIMI = 1 + ATTESE_RITENTATIVO_MS.length;

/**
 * L'attesa prima del prossimo tentativo dopo `tentativiConclusi` fallimenti, o
 * `null` se i ritentativi automatici sono finiti.
 */
export function attesaDopoIlFallimento(tentativiConclusi: number): number | null {
  return ATTESE_RITENTATIVO_MS[tentativiConclusi - 1] ?? null;
}

export type NaturaErroreWebhook = 'transitorio' | 'permanente';

/** Il database non raggiungibile, la connessione caduta, il pool esaurito, un conflitto di scrittura. */
const CODICI_PRISMA_TRANSITORI = new Set(['P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'P2034']);

/**
 * Che cosa si ritenta in automatico (docs/30 §7.1.2, D1 e punto 6 del proprietario):
 * SOLO gli errori transitori, riconosciuti dalla CAUSA e dalla natura, non dal nome
 * della classe.
 *
 * | transitorio                                                                 | permanente                                                    |
 * | --------------------------------------------------------------------------- | ------------------------------------------------------------- |
 * | `NotificaDaRinviareException`: l'effetto non si applica ORA (articolo `syncing`) | —                                                          |
 * | trasporto verso Shopify di una lettura: timeout, rete, 502/503/504, scadenza | lo stesso trasporto con `esitoIncerto` (una scrittura partita) |
 * | 429 / `THROTTLED` oltre i limiti del trasporto                              | ogni altro 4xx, `userErrors`, rifiuti di dominio               |
 * | database irraggiungibile, connessione chiusa, pool esaurito, deadlock       | dati non validi, vincoli, qualunque altro errore              |
 *
 * ⛔ Un esito incerto NON si ritenta da qui: una scrittura remota che può essere
 *    partita ha già il proprio stato (le quantità: chiave e `tentativo_incerto`);
 *    ripeterla alla cieca è il difetto che la coda deve evitare, non produrre.
 */
export function naturaDellErrore(error: unknown): NaturaErroreWebhook {
  if (error instanceof NotificaDaRinviareException) {
    return 'transitorio';
  }
  if (error instanceof ShopifyTrasportoException) {
    return error.esitoIncerto ? 'permanente' : 'transitorio';
  }
  if (error instanceof HttpException) {
    return error.getStatus() === HttpStatus.TOO_MANY_REQUESTS ? 'transitorio' : 'permanente';
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return CODICI_PRISMA_TRANSITORI.has(error.code) ? 'transitorio' : 'permanente';
  }
  if (error instanceof Prisma.PrismaClientInitializationError) {
    // Il motore non ha raggiunto il database (P1001/P1002 arrivano anche in questa veste).
    return error.errorCode === undefined || CODICI_PRISMA_TRANSITORI.has(error.errorCode)
      ? 'transitorio'
      : 'permanente';
  }
  return 'permanente';
}
