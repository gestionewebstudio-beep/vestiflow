import '@testing-library/jest-dom/vitest';

import { vi } from 'vitest';

// I form pesanti (arrivo merce, registrazione fattura) superano il timeout
// di default (5s) quando l'intera suite gira in parallelo su macchine
// cariche: da soli passano in 2-3s. Il margine evita falsi negativi.
vi.setConfig({ testTimeout: 20_000 });
