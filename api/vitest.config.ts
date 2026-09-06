import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts', '../scripts/backup/**/*.spec.mjs'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        // Stesso perimetro applicativo di tsconfig.build: fixture e test non sono prodotto.
        'src/**/*.integration-spec.ts',
        'src/test/**',
        'src/main.ts',
        'src/**/*.module.ts',
        'src/**/*.dto.ts',
        'src/**/dto/**',
      ],
      reporter: ['text', 'lcov'],
      /*
        ⭐ **SOGLIE ALLA MISURA REALE, arrotondata per difetto — 06/09/2026.**

        Il criterio e' quello gia' applicato al gate del frontend il 17/08/2026:
        la soglia si porta al numero che il progetto raggiunge davvero, troncato
        all'intero inferiore. Da li' puo' solo salire, e una regressione la ferma
        il giorno stesso.

        ```text
                     misurato   soglia   prima   scarto colmato
        statements      67,52       67      44        +23
        branches        59,65       59    35,5      +23,5
        functions       69,17       69      56        +13
        lines           67,65       67      43        +24
        ```

        ⛔ **Lo scarto NON era solo sulle funzioni.** Branches e lines erano i piu'
        lontani, oltre 23 punti: un gate a quella distanza dalla realta' non ferma
        nessuna regressione, perche' per farlo scattare bisognerebbe cancellare
        meta' dei test.

        ⚠️ **Nessuna esclusione toccata e nessun test indebolito**: l'elenco
        `exclude` qui sopra e' quello del 05/09 (perimetro di `tsconfig.build`,
        fixture e test fuori dal prodotto) e non cambia con questa modifica. Il
        divario nasceva dal fatto che le soglie non erano mai state rilette dopo
        quel cambio di perimetro.

        ⭐ **Misura riproducibile**: `npm run test:coverage --prefix api` su
        `2f9abf1c`, albero pulito — due esecuzioni, stesso risultato al centesimo
        su tutti e quattro gli indici (220 file, 2.446 test verdi).

        ⚠️ **Troncare all'intero e' l'unico margine**: mezzo punto scarso. Un file
        nuovo scoperto fa scattare il gate, ed e' quello che deve fare. Alzarle
        ancora si fa aggiungendo test, non ritoccando il numero.
      */
      thresholds: {
        lines: 67,
        branches: 59,
        functions: 69,
        statements: 67,
      },
    },
  },
});
