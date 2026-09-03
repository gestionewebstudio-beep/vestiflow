import { defineConfig } from 'vitest/config';

/**
 * GATE DI CONTRATTO: le primitive GraphQL contro Shopify VERO, su uno shop di
 * sviluppo. È il terzo ingresso di Vitest, accanto a quello unitario e a quello
 * di integrazione — non un secondo strumento: stesso framework, perimetro suo.
 *
 * ```
 * VESTIFLOW_SHOPIFY_CONTRACT_SHOP=xxx.myshopify.com  npm run test:shopify:contract
 * ```
 *
 * ⛔ **Il suffisso `.contract-spec.ts` sta FUORI da entrambe le suite ordinarie:**
 *    `vitest.config.ts` raccoglie `src/**\/*.spec.ts`, `vitest.integration.config.ts`
 *    raccoglie `src/**\/*.integration-spec.ts`. Né l'uno né l'altro corrisponde,
 *    quindi `npm test`, `npm run test:everything`, il `pre-push` e la CI non lo
 *    eseguono — nemmeno per sbaglio, nemmeno con la rete disponibile.
 *
 * ⛔ **Nessun `skip` condizionale.** Senza dominio, senza credenziali o senza
 *    rete la suite FALLISCE. Vale qui la stessa ragione di `integration/env.ts`:
 *    un gate che diventa verde quando non ha verificato niente fa credere
 *    provato ciò che non lo è, ed è il difetto che questo progetto combatte.
 *
 * ⚠️ **Nessun `setupFiles` che dirotti il database.** L'integrazione riscrive
 *    `DATABASE_URL` perché TRONCA tabelle; questo gate fa una sola `findFirst`
 *    per leggere il token cifrato di uno shop collegato, e deve quindi vedere
 *    il database di sviluppo — che è l'unico posto in cui quel token esiste.
 *    L'`.env` lo carica il file di prova, non un setup globale, così il
 *    perimetro resta leggibile da dentro il test.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.contract-spec.ts'],
    exclude: ['**/node_modules/**'],
    // Un solo file alla volta, e i test dentro un file in ordine: agiscono
    // tutti sullo STESSO prodotto remoto, e l'ordine è parte della prova.
    fileParallelism: false,
    // La rete verso Shopify, più il throttle dell'Admin API: 5s di default
    // farebbero fallire per attesa ciò che funziona.
    testTimeout: 120_000,
    hookTimeout: 180_000,
    // Nessuna soglia: qui si prova un CONTRATTO esterno, non si coprono righe.
    coverage: { enabled: false },
  },
});
