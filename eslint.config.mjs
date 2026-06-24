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
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],

      // ── RxJS (igiene observable) ─────────────────────────────────────
      'rxjs/no-ignored-replay-buffer': 'error',
      'rxjs/no-unsafe-takeuntil': 'error',
      'rxjs/no-ignored-subscription': 'warn',
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
