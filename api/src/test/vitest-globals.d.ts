// I globali di Vitest (`describe`, `it`, `expect`) per il type-check dei test.
//
// ⛔ NON si dichiarano con `"types": ["vitest/globals", …]` in `tsconfig.spec.json`:
//    quella chiave SOSTITUISCE l'elenco dei pacchetti `@types` caricati invece di
//    aggiungersi, quindi toglie `multer`, `express` e gli altri tipi ambientali che i
//    file applicativi usano. Misurato il 04/09/2026: 28 errori `TS2694` su
//    `Express.Multer` in `products.controller.ts`, `inventory.controller.ts` e
//    `user-avatar.service.ts` — file di PRODUZIONE che compilano nella build vera.
//
// ⭐ Una direttiva di riferimento AGGIUNGE, e non toglie niente: la configurazione
//    resta quella del progetto, con i globali in piu'. Ed e' a prova di dipendenza
//    nuova, che con un elenco chiuso andrebbe ricordata a mano.
//
// ⚠️ Vive sotto `src/test/`, che `tsconfig.build.json` esclude: non finisce in `dist/`.

/// <reference types="vitest/globals" />
