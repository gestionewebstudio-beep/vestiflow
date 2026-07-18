import { defineConfig } from 'vitest/config';

/**
 * Config caricata dal builder `@angular/build:unit-test` (runnerConfig: true).
 *
 * SOLO override di stabilità: annulla automaticamente ogni `vi.stubGlobal`
 * a fine test. Un global stubbato e mai ripristinato (es. `URL` sostituita
 * da un oggetto fittizio) sopravvive al file nel worker riusato e fa fallire
 * il CARICAMENTO dei file successivi con «TypeError: URL is not a
 * constructor» (il module-runner di vite usa la URL del realm) — suite
 * casuali rosse con 0 test eseguiti.
 */
export default defineConfig({
  test: {
    unstubGlobals: true,
  },
});
