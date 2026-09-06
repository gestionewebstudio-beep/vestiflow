import { Prisma } from '@prisma/client';

/**
 * **Il tipo di un valore COME ESCE dall'API**, dopo che
 * `DecimalSerializationInterceptor` ha convertito ogni `Prisma.Decimal` in
 * `number`.
 *
 * ⛔ **Serve perché senza di lui il tipo del controller è una bugia.** Un
 * service che dichiara `Promise<Product>` promette `purchasePriceMinor:
 * Decimal`, ma al client arriva un `number`: il compilatore non può più
 * verificare niente, e chi legge la firma crede a una cosa che non succede.
 *
 * ⭐ **È l'`Omit` che il proprietario ha chiesto il 22/08/2026, con l'elenco dei
 * campi DERIVATO invece che copiato.** Un elenco scritto a mano —
 * `Omit<Product, 'purchasePriceMinor' | 'sellingPriceMinor' | …>` — smette di
 * essere completo alla prima colonna `NUMERIC` che qualcuno aggiunge, e nessun
 * test se ne accorge: è esattamente la fuga silenziosa che stiamo chiudendo.
 * Qui la sostituzione segue il tipo, quindi non può divergere.
 *
 * ⚠️ **Non converte niente**: descrive. La conversione la fa l'interceptor, in
 * un punto solo. Questi due pezzi vanno insieme — il tipo senza l'interceptor
 * mentirebbe al contrario.
 */
export type Serialized<T> = T extends Prisma.Decimal
  ? number
  : // Date, Buffer e simili escono così come sono: l'interceptor non li
    // attraversa, e mapparli campo per campo li distruggerebbe.
    T extends Date | Buffer
    ? T
    : T extends readonly (infer U)[]
      ? readonly Serialized<U>[]
      : T extends (infer U)[]
        ? Serialized<U>[]
        : T extends object
          ? { [K in keyof T]: Serialized<T[K]> }
          : T;
