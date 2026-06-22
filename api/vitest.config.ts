import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
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
        lines: 42,
        branches: 34.5,
        functions: 54,
        statements: 42.5,
      },
    },
  },
});
