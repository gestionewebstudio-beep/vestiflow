import { describe, expect, it, vi } from 'vitest';

import { sospendiLaPrimaRichiesta } from './concorrenza.util';

/**
 * Gli aiutanti di concorrenza devono TERMINARE anche quando falliscono.
 *
 * ⛔ **Non serve un database**: qui si prova la meccanica delle promesse, ed e'
 *    proprio quella che sa appendersi. Il finto `$transaction` riproduce in un
 *    millisecondo cio' che sul database vero capita quando il pool e' saturo.
 *
 * ⚠️ **Il timeout di ogni prova e' basso APPOSTA** (2 secondi): il difetto che
 *    si cerca non e' «lento», e' «non finisce mai». Con il timeware alto la
 *    prova resterebbe appesa insieme al codice che dovrebbe accusare.
 */
describe('sospendiLaPrimaRichiesta — chiusura delle risorse', () => {
  const AGGIORNAMENTO = 'UPDATE prova SET x = 1';

  it(
    '⛔ transazione FALLITA prima di dichiarare il pid: rifiuta, non resta appesa',
    async () => {
      // ⛔ **Il caso non coperto**, indicato dal proprietario: fino a oggi la
      //    chiusura era garantita solo se il corpo PARTIVA e falliva dentro.
      //    Se la transazione non parte affatto — pool saturo, `maxWait`
      //    scaduto — nessuno risolveva la promessa del pid, e `await` restava
      //    appeso finche' vitest non abbatteva l'intero file.
      const prisma = {
        $transaction: vi.fn().mockRejectedValue(new Error('pool esaurito')),
      } as never;

      await expect(sospendiLaPrimaRichiesta(prisma, AGGIORNAMENTO, [])).rejects.toThrow(
        /pool esaurito/,
      );
    },
    2_000,
  );

  it(
    '⛔ transazione CONCLUSA senza dichiarare il pid: rifiuta dicendo cosa manca',
    async () => {
      // ⚠️ Caso gemello e meno ovvio: la transazione finisce BENE senza aver
      //    eseguito il corpo che dichiara il pid. Non c'e' errore da propagare,
      //    quindi va costruito — altrimenti l'attesa non ha nulla che la chiuda.
      const prisma = { $transaction: vi.fn().mockResolvedValue(undefined) } as never;

      await expect(sospendiLaPrimaRichiesta(prisma, AGGIORNAMENTO, [])).rejects.toThrow(
        /senza aver dichiarato/i,
      );
    },
    2_000,
  );

  it(
    "l'aggiornamento che fallisce DENTRO la transazione continua a rifiutare",
    async () => {
      // ⭐ La regressione del caso gia' coperto: la correzione non deve
      //    sostituire una chiusura con l'altra.
      const prisma = {
        $transaction: vi.fn(async (corpo: (tx: unknown) => Promise<unknown>) =>
          corpo({
            $executeRawUnsafe: vi.fn().mockRejectedValue(new Error('colonna assente')),
            $queryRawUnsafe: vi.fn(),
          }),
        ),
      } as never;

      await expect(sospendiLaPrimaRichiesta(prisma, AGGIORNAMENTO, [])).rejects.toThrow(
        /colonna assente/,
      );
    },
    2_000,
  );

  it(
    'chiudi() sblocca e attende, ed e` idempotente',
    async () => {
      let corpoConcluso = false;
      const prisma = {
        $transaction: vi.fn(async (corpo: (tx: unknown) => Promise<unknown>) => {
          await corpo({
            $executeRawUnsafe: vi.fn().mockResolvedValue(1),
            $queryRawUnsafe: vi.fn().mockResolvedValue([{ pid: 4242 }]),
          });
          corpoConcluso = true;
        }),
      } as never;

      const sospesa = await sospendiLaPrimaRichiesta(prisma, AGGIORNAMENTO, []);
      expect(sospesa.pid).toBe(4242);
      expect(corpoConcluso).toBe(false);

      // ⭐ Due chiamate: chi chiude in un `finally` non deve dover sapere se
      //    qualcuno ha gia` chiuso lungo il percorso felice.
      await sospesa.chiudi();
      await sospesa.chiudi();
      expect(corpoConcluso).toBe(true);
    },
    2_000,
  );

  it(
    'chiudi() non propaga il fallimento della transazione: e` una PULIZIA',
    async () => {
      // ⚠️ Chiamata in un `finally`, se rilanciasse coprirebbe l'errore vero
      //    della prova con quello della pulizia.
      const prisma = {
        $transaction: vi.fn(async (corpo: (tx: unknown) => Promise<unknown>) => {
          await corpo({
            $executeRawUnsafe: vi.fn().mockResolvedValue(1),
            $queryRawUnsafe: vi.fn().mockResolvedValue([{ pid: 7 }]),
          });
          throw new Error('transazione annullata');
        }),
      } as never;

      const sospesa = await sospendiLaPrimaRichiesta(prisma, AGGIORNAMENTO, []);
      await expect(sospesa.chiudi()).resolves.toBeUndefined();
    },
    2_000,
  );
});
