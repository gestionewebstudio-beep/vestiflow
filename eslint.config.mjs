// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import angular from 'angular-eslint';
import rxjs from '@smarttools/eslint-plugin-rxjs';
import unusedImports from 'eslint-plugin-unused-imports';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    // api/ è il backend NestJS: ha il proprio tsconfig e non segue le regole Angular.
    ignores: [
      'dist/**',
      'out-tsc/**',
      'coverage/**',
      '.angular/**',
      'api/**',
      // HTML di stampa generati da docs/*.md (non template Angular).
      'docs/**/*.html',
      // Fragment HTML guida in-app (generati da scripts/generate-guide-html.mjs).
      'public/guide/**',
      'src/assets/guide-admin/**',
    ],
  },
  {
    files: ['**/*.ts'],
    ignores: ['e2e/**', 'playwright.config.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      ...tseslint.configs.stylistic,
      ...angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'unused-imports': unusedImports,
      rxjs,
    },
    rules: {
      // ── Non negoziabili (regole-qualita) ────────────────────────────
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      // I validator statici di Angular (Validators.required, ...) sono riferimenti
      // sicuri: ignoreStatic evita falsi positivi su questi passaggi.
      '@typescript-eslint/unbound-method': ['error', { ignoreStatic: true }],
      '@angular-eslint/no-output-on-prefix': 'error',
      '@angular-eslint/component-class-suffix': 'error',
      '@angular-eslint/use-lifecycle-interface': 'error',

      // unused-imports gestisce import e variabili inutilizzate (sostituisce
      // @typescript-eslint/no-unused-vars per evitare report duplicati).
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          vars: 'all',
          varsIgnorePattern: '^_',
        },
      ],

      // ── Selettori di progetto (prefisso app-) ───────────────────────
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      // ⚠️ Anche ATTRIBUTO, non solo elemento: un componente che rende una
      // <tr> non puo' avere un selettore di elemento — un nodo in piu' fra
      // <tbody> e <tr> romperebbe la tabella. Il prefisso resta obbligatorio.
      '@angular-eslint/component-selector': [
        'error',
        { type: ['element', 'attribute'], prefix: 'app', style: 'kebab-case' },
      ],

      // ── RxJS (igiene observable) ─────────────────────────────────────
      'rxjs/no-ignored-replay-buffer': 'error',
      'rxjs/no-unsafe-takeuntil': 'error',
      // 'rxjs/no-ignored-subscription' e' stata rimossa: chiedeva la cosa
      // giusta con il criterio sbagliato — pretende che il valore di ritorno
      // di subscribe() sia assegnato, e non conosce takeUntilDestroyed(). Su
      // questo progetto segnalava 218 casi di cui 203 corretti, e un rapporto
      // cosi' non rende un controllo severo: lo rende illeggibile. Il criterio
      // vero (in un componente la sottoscrizione deve avere una via d'uscita)
      // vive in scripts/check-subscriptions.mjs, dentro `npm run lint`.
    },
  },

  // ── Confini tra layer (regole-architettura) ────────────────────────────
  // core → shared → domain → features: ogni layer vede solo quelli sotto.
  // Le eccezioni si aprono qui, non con un commento nel file.
  // `no-restricted-imports` vede solo gli import statici: gli `import()`
  // dinamici (loadComponent/loadChildren nei routes) sono coperti dalla
  // regola gemella `no-restricted-syntax` su ImportExpression.
  {
    files: ['src/app/core/**/*.ts', 'src/app/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@domain/*', '@features/*'],
              message:
                'core/ e shared/ non conoscono il dominio: sposta il file in domain/ o inverti la dipendenza.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression > Literal[value=/^@(domain|features)\\u002F/]',
          message:
            'core/ e shared/ non conoscono il dominio (vale anche per gli import dinamici).',
        },
      ],
    },
  },
  {
    files: ['src/app/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@features/*'],
              message:
                'domain/ non dipende dalle schermate: il pezzo condiviso va in domain/, non in features/.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression > Literal[value=/^@features\\u002F/]',
          message:
            'domain/ non dipende dalle schermate (vale anche per gli import dinamici).',
        },
      ],
    },
  },
  {
    files: ['src/app/features/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@features/*'],
              message:
                'Nessun import tra feature: promuovi il file condiviso in domain/ (vedi regole-architettura).',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression > Literal[value=/^@features\\u002F/]',
          message:
            'Nessun import tra feature, nemmeno dinamico: le rotte cross-feature le monta app.routes.ts (composition root), i componenti condivisi vanno in domain/.',
        },
      ],
    },
  },
  {
    // Eccezione dichiarata: documents monta la maschera Ordine cliente
    // (sales-ddt, quote e scarico manuale sono la stessa maschera in modalità
    // diverse). La correzione vera è promuovere customer-order-form a domain/;
    // finché non avviene, l'eccezione vive qui — resta vietato ogni ALTRO
    // import dinamico cross-feature nello stesso file (negative lookahead).
    files: ['src/app/features/documents/documents.routes.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'ImportExpression > Literal[value=/^@features\\u002F(?!sales-orders\\u002Fcustomer-order-form)/]',
          message:
            'Nessun import tra feature, nemmeno dinamico: le rotte cross-feature le monta app.routes.ts (composition root), i componenti condivisi vanno in domain/.',
        },
      ],
    },
  },
  {
    files: ['e2e/**/*.ts', 'playwright.config.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      ...tseslint.configs.stylistic,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./e2e/tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'unused-imports': unusedImports,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          vars: 'all',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
    rules: {
      '@angular-eslint/template/no-negated-async': 'error',
      '@angular-eslint/template/click-events-have-key-events': 'error',
      '@angular-eslint/template/interactive-supports-focus': 'error',
    },
  },
  // Disattiva le regole stilistiche in conflitto con Prettier (deve restare ultimo).
  prettier,
);
