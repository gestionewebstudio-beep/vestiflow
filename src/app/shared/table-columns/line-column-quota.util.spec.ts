import { describe, expect, it } from 'vitest';

import type { TableColumnDef } from './table-column.model';
import { lineColumnQuotaWidth, sumVisibleLineColumnsPx } from './line-column-quota.util';

const defs: readonly TableColumnDef[] = [
  { id: 'code', label: 'Codice' },
  { id: 'product', label: 'Articolo' },
  { id: 'qty', label: 'Q.tà' },
  { id: 'total', label: 'Totale' },
];

const px: Readonly<Record<string, number>> = { code: 100, product: 300, qty: 100, total: 100 };
const pxOf = (id: string): number => px[id] ?? 0;
const allVisible = (): boolean => true;

describe('sumVisibleLineColumnsPx', () => {
  it('somma i px delle sole colonne visibili', () => {
    expect(sumVisibleLineColumnsPx(defs, allVisible, pxOf)).toBe(600);
  });

  it('esclude le colonne non visibili dalla somma', () => {
    const isVisible = (id: string): boolean => id !== 'qty';
    expect(sumVisibleLineColumnsPx(defs, isVisible, pxOf)).toBe(500);
  });

  it('vale 0 se nessuna colonna è visibile', () => {
    expect(sumVisibleLineColumnsPx(defs, () => false, pxOf)).toBe(0);
  });
});

describe('lineColumnQuotaWidth', () => {
  it('calcola la quota percentuale sul totale', () => {
    expect(lineColumnQuotaWidth('product', 600, pxOf)).toBe('50.0000%');
    expect(lineColumnQuotaWidth('code', 600, pxOf)).toBe('16.6667%');
  });

  it('restituisce "auto" quando il totale non è ancora positivo', () => {
    expect(lineColumnQuotaWidth('product', 0, pxOf)).toBe('auto');
    expect(lineColumnQuotaWidth('product', -10, pxOf)).toBe('auto');
  });

  it('la somma delle quote di tutte le colonne visibili torna a 100%', () => {
    // Ogni quota è arrotondata a 4 decimali prima della somma (come nel
    // template, che legge le stringhe già formattate): la tolleranza copre
    // l'errore di arrotondamento cumulato, non un difetto di precisione.
    const total = sumVisibleLineColumnsPx(defs, allVisible, pxOf);
    const sum = defs.reduce(
      (acc, def) => acc + Number.parseFloat(lineColumnQuotaWidth(def.id, total, pxOf)),
      0,
    );
    expect(sum).toBeCloseTo(100, 2);
  });
});
