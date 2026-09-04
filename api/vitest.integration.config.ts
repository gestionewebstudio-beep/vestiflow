import { defineConfig } from 'vitest/config';

/**
 * Suite di INTEGRAZIONE: gira contro un PostgreSQL vero, in un container
 * locale. Configurazione separata da `vitest.config.ts` apposta.
 *
 * ⛔ **Il suffisso `.integration-spec.ts` sta FUORI da `src/**\/*.spec.ts`**,
 *    che è ciò che raccoglie `npm test`. Quindi la suite normale non la esegue
 *    e non apre nessuna connessione — nemmeno per sbaglio, nemmeno in CI, e
 *    nemmeno se il database di prova non esiste.
 *
 * ⛔ **`vitest.config.ts` non è stato toccato** e `test:everything` non cambia:
 *    l'integrazione è un comando che si invoca apposta.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.integration-spec.ts'],
    /**
     * ⛔ **Il collaudo della migration è a DUE FASI e resta fuori da qui.**
     *
     * Semina le fixture legacy PRIMA della migration, salva uno snapshot, e
     * confronta DOPO. Nella suite ordinaria sarebbe rosso per sempre: le sue
     * tabelle di snapshot vengono azzerate da ogni altro dataset, e la fase 1
     * fallisce apposta per dire «ora applica la migration».
     *
     * ⚠️ Non lo si è reso saltabile: un test che diventa verde quando non ha
     * verificato niente è l’anti-pattern che questo progetto combatte. Si
     * esegue a mano:  npm run test:migration
     */
    exclude: ['**/node_modules/**', 'src/**/*-backfill.integration-spec.ts'],
    // Carica api/.env (Vitest non lo fa) e TOGLIE dal processo la connessione
    // a DEV: dentro questa suite non deve nemmeno esistere come variabile.
    setupFiles: ['src/test/integration/setup.ts'],
    // ⚠️ Un solo file alla volta: i file condividono UN database, e il
    // troncamento fra un file e l'altro non può correre in parallelo con le
    // scritture di un altro.
    fileParallelism: false,
    // Un database vero è più lento dei mock: 5s di default farebbero fallire
    // per attesa ciò che funziona.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Nessuna soglia di copertura: questa suite prova il COMPORTAMENTO contro
    // un database, non copre righe. Misurarla insieme al resto darebbe un
    // numero che non significa niente.
    coverage: { enabled: false },
  },
});
