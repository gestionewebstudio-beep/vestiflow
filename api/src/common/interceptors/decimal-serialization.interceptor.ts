import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import type { Serialized } from '../serialized.type';

/**
 * **Il confine fra `Prisma.Decimal` e il JSON che esce dall'API.**
 *
 * ⛔ **Il difetto che chiude**, misurato il 22/08/2026: una colonna
 * `NUMERIC(16,6)` arriva a Prisma come `Prisma.Decimal`, e `JSON.stringify` di
 * un Decimal produce una **stringa** — `"2049.1803"`, non `2049.1803`. Il
 * compilatore non se ne accorge, perché il tipo di ritorno del controller è
 * inferito e nessuno dichiara la forma del JSON.
 *
 * Il frontend se n'era accorto e aveva compensato dichiarando `number | string`
 * in **sedici** punti, con un `Number(...)` a ogni lettura. Il proprietario ha
 * deciso il 22/08/2026 che quello non è un contratto: si normalizza **qui**, e
 * lato client resta `number`.
 *
 * ⭐ **Perché un interceptor e non un `Number()` in ogni service.** I punti di
 * uscita sono decine e crescono: uno dimenticato non fa fallire niente, e il
 * difetto ricompare in un solo campo di una sola risposta — cioè nel modo più
 * difficile da trovare. Qui il contratto vale per costruzione, anche per le
 * risposte che nessuno ha ancora scritto.
 *
 * ⚠️ **Non tocca la precisione.** `Decimal.toNumber()` su un valore con al più
 * 4 cifre di centesimo è esatto: il dominio di VestiFlow sta larghissimo dentro
 * i 53 bit di mantissa di un double (verificato fino a un miliardo di euro per
 * valore unitario). La precisione canonica e i calcoli persistiti restano
 * comunque sul backend, in Decimal: il client riceve numeri per mostrarli e
 * per comporre il prossimo payload, non per farci contabilità.
 */
@Injectable()
export class DecimalSerializationInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((body) => normalizeDecimals(body)));
  }
}

/**
 * Converte ogni `Prisma.Decimal` in `number`, ovunque si trovi nella risposta.
 *
 * ⭐ **Restituisce l'oggetto ORIGINALE quando non c'è niente da convertire.**
 * Non è micro-ottimizzazione: attraversare ogni risposta ricopiandola costerebbe
 * su elenchi da centinaia di righe, ed è il genere di costo che si nota solo in
 * produzione.
 */
export function normalizeDecimals<T>(value: T): Serialized<T> {
  return convert(value, new WeakSet()) as Serialized<T>;
}

function convert(value: unknown, visti: WeakSet<object>): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (Prisma.Decimal.isDecimal(value)) {
    return (value as Prisma.Decimal).toNumber();
  }

  // ⛔ Tipi che NON si attraversano: una Date perderebbe la sua identità, un
  // Buffer verrebbe ricopiato elemento per elemento (una stampa PDF diventerebbe
  // un array di byte), e uno stream non è ispezionabile senza consumarlo.
  if (
    value instanceof Date ||
    value instanceof Buffer ||
    value instanceof RegExp ||
    typeof (value as { pipe?: unknown }).pipe === 'function'
  ) {
    return value;
  }

  // Un ciclo in una risposta non dovrebbe esistere, ma se esistesse questo
  // attraversamento non tornerebbe più: la guardia costa una WeakSet.
  if (visti.has(value as object)) {
    return value;
  }
  visti.add(value as object);

  if (Array.isArray(value)) {
    let cambiato = false;
    const out = value.map((item) => {
      const convertito = convert(item, visti);
      if (convertito !== item) {
        cambiato = true;
      }
      return convertito;
    });
    return cambiato ? out : value;
  }

  let cambiato = false;
  const out: Record<string, unknown> = {};
  for (const [chiave, item] of Object.entries(value as Record<string, unknown>)) {
    const convertito = convert(item, visti);
    if (convertito !== item) {
      cambiato = true;
    }
    out[chiave] = convertito;
  }
  return cambiato ? out : value;
}
