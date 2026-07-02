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
        'src/main.ts',
        'src/**/*.module.ts',
        'src/**/*.dto.ts',
        'src/**/dto/**',
      ],
      reporter: ['text', 'lcov'],
      // Soglia globale anti-regressione; alza gradualmente man mano che si aggiungono test su controller/service.
      thresholds: {
        lines: 43,
        branches: 35.5,
        functions: 56,
        statements: 44,
      },
    },
  },
});
