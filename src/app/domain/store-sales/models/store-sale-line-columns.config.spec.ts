import { describe, expect, it } from 'vitest';

import {
  createDefaultViewState,
  resolveVisibleColumns,
} from '@shared/table-columns/table-column.util';

import { STORE_SALE_LINE_COLUMNS, STORE_SALE_LINE_PRESETS } from './store-sale-line-columns.config';

/**
 * Le colonne della riga al banco: **quali** si dichiarano.
 *
 * ⭐ Che si comportino come negli altri documenti lo verifica
 * `src/app/document-line-columns.consistency.spec.ts`, che è l'unico punto da
 * cui si vedono tutte e sei le configurazioni senza che `domain/` debba
 * importare da `features/`.
 */
describe('STORE_SALE_LINE_COLUMNS', () => {
  const idsDichiarati = STORE_SALE_LINE_COLUMNS.map((column) => column.id);

  it('⭐ l’EAN è dichiarato: chi spara il codice lo verifica a schermo', () => {
    // Deciso dal proprietario il 22/08/2026 (`11` A15).
    expect(idsDichiarati).toContain('barcode');
  });

  it('⭐ e si vede di default, come in ogni altro documento', () => {
    // Era nato spento, ed era una decisione presa senza guardare gli altri.
    const stato = createDefaultViewState(STORE_SALE_LINE_COLUMNS, STORE_SALE_LINE_PRESETS);

    expect(resolveVisibleColumns(STORE_SALE_LINE_COLUMNS, stato).map((c) => c.id)).toContain(
      'barcode',
    );
  });

  it('⛔ il COSTO non è dichiarato, quindi non è nemmeno accendibile', () => {
    // L'unica differenza voluta del banco, e sta nel COSA si dichiara — non nel
    // come. Il costo d'acquisto non sta davanti a chi batte gli scontrini,
    // spesso davanti al cliente, e la sola via per non offrirlo è non
    // dichiararlo: una colonna «spenta» resterebbe raggiungibile dal selettore.
    expect(idsDichiarati).not.toContain('purchaseCost');
  });

  it('⛔ i preset restano derivati dalle definizioni, mai scritti a mano', () => {
    // Un elenco copiato divergerebbe alla prima colonna aggiunta, e la
    // divergenza non la vedrebbe nessuna compilazione.
    for (const preset of Object.values(STORE_SALE_LINE_PRESETS)) {
      expect([...preset]).toEqual(idsDichiarati);
    }
  });
});
