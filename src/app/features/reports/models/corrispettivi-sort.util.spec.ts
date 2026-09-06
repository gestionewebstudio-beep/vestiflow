import { describe, expect, it } from 'vitest';

import type { CorrispettiviRegisterRow } from './corrispettivi.model';
import { isCorrispettiviSortColumn, ordinaCorrispettivi } from './corrispettivi-sort.util';

const EUR = 'EUR';

function riga(
  rowId: string,
  occurredAt: string,
  totale: number,
  extra: Partial<CorrispettiviRegisterRow> = {},
): CorrispettiviRegisterRow {
  return {
    rowId,
    kind: 'sale',
    orderNumber: rowId,
    occurredAt,
    source: 'store',
    customerName: '',
    currency: EUR,
    taxable: { amountMinor: totale - 100, currencyCode: EUR },
    tax: { amountMinor: 100, currencyCode: EUR },
    total: { amountMinor: totale, currencyCode: EUR },
    ...extra,
  };
}

const ETICHETTE = {
  kind: (row: CorrispettiviRegisterRow) => (row.kind === 'refund' ? 'Rettifica' : 'Vendita'),
  source: (row: CorrispettiviRegisterRow) => row.source,
  location: (row: CorrispettiviRegisterRow) => row.locationName ?? 'Non determinata',
  financialStatus: (row: CorrispettiviRegisterRow) => row.financialStatus ?? '',
};

const RIGHE = [
  riga('c', '2026-08-18T10:00:00.000Z', 5000),
  riga('a', '2026-08-20T09:00:00.000Z', 1500),
  riga('b', '2026-08-19T11:00:00.000Z', 30000),
];

/**
 * ⛔ L'ordinamento manuale esiste **solo** con «Raggruppa: Nessuno» (`10` §20):
 * col raggruppamento acceso il Registro tiene il suo ordine canonico, e chi
 * chiama lo esprime non passando chiavi.
 */
describe('ordinaCorrispettivi', () => {
  it('senza chiavi le righe restano come sono arrivate', () => {
    expect(ordinaCorrispettivi(RIGHE, [], ETICHETTE)).toBe(RIGHE);
  });

  it('ordina per data', () => {
    const ordinate = ordinaCorrispettivi(
      RIGHE,
      [{ columnId: 'occurredAt', direction: 'asc' }],
      ETICHETTE,
    );

    expect(ordinate.map((r) => r.rowId)).toEqual(['c', 'b', 'a']);
  });

  it('⛔ gli importi si confrontano in unità minori, non come testo', () => {
    const ordinate = ordinaCorrispettivi(
      RIGHE,
      [{ columnId: 'total', direction: 'desc' }],
      ETICHETTE,
    );

    // 300,00 € prima di 50,00 €: come testo «30000» starebbe prima di «5000».
    expect(ordinate.map((r) => r.rowId)).toEqual(['b', 'c', 'a']);
  });

  it('⭐ Tipo si ordina per ETICHETTA, cioè per quello che si legge', () => {
    const righe = [
      riga('v', '2026-08-20T09:00:00.000Z', 1000),
      riga('r', '2026-08-20T10:00:00.000Z', 1000, { kind: 'refund' }),
    ];

    const ordinate = ordinaCorrispettivi(
      righe,
      [{ columnId: 'kind', direction: 'asc' }],
      ETICHETTE,
    );

    // «Rettifica» prima di «Vendita»: alfabetico dell'italiano, non dell'enum
    // (`refund` verrebbe comunque prima, ma per un motivo che non si vede).
    expect(ordinate.map((r) => r.rowId)).toEqual(['r', 'v']);
  });

  it('più chiavi: la prima comanda, la seconda scioglie i pari', () => {
    const righe = [
      riga('tardi', '2026-08-20T18:00:00.000Z', 1000),
      riga('presto', '2026-08-20T08:00:00.000Z', 1000),
    ];

    const ordinate = ordinaCorrispettivi(
      righe,
      [
        { columnId: 'total', direction: 'asc' },
        { columnId: 'occurredAt', direction: 'asc' },
      ],
      ETICHETTE,
    );

    expect(ordinate.map((r) => r.rowId)).toEqual(['presto', 'tardi']);
  });

  it('una colonna sconosciuta si ignora invece di rompere', () => {
    expect(isCorrispettiviSortColumn('pippo')).toBe(false);
    expect(ordinaCorrispettivi(RIGHE, [{ columnId: 'pippo', direction: 'asc' }], ETICHETTE)).toBe(
      RIGHE,
    );
  });
});
