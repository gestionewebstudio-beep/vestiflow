import { defineConfig } from 'vitest/config';

/**
 * Config caricata dal builder `@angular/build:unit-test` (runnerConfig: true).
 *
 * Solo override di stabilità.
 *
 * 1. `unstubGlobals`: annulla automaticamente ogni `vi.stubGlobal` a fine
 *    test. Un global stubbato e mai ripristinato (es. `URL` sostituita da un
 *    oggetto fittizio) sopravvive al file nel worker riusato e fa fallire il
 *    CARICAMENTO dei file successivi con «TypeError: URL is not a
 *    constructor» (il module-runner di vite usa la URL del realm) — suite
 *    casuali rosse con 0 test eseguiti.
 *
 * 2. `maxThreads`: un worker per core FISICO, non per thread logico. Questi
 *    non sono unit test da microsecondi: ogni file monta un TestBed Angular e
 *    un DOM, e due worker che si dividono un core fisico ci mettono piu' del
 *    doppio. Con un worker per thread logico i test che aspettano un debounce
 *    reale sforavano i 20 secondi — e non sempre gli stessi, il che rende una
 *    suite verde indistinguibile da una fortunata.
 */
export default defineConfig({
  test: {
    unstubGlobals: true,
    poolOptions: {
      threads: { maxThreads: 8, minThreads: 1 },
      forks: { maxForks: 8, minForks: 1 },
    },
  },
});
