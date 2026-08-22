import { describe, expect, it } from 'vitest';

import { TableViewPresetId } from '@shared/table-columns/table-column.model';
import {
  createDefaultViewState,
  reconcileStateWithDefs,
  resolveVisibleColumns,
} from '@shared/table-columns/table-column.util';

import { STORE_SALE_LINE_COLUMNS, STORE_SALE_LINE_PRESETS } from './store-sale-line-columns.config';

/**
 * Le colonne della riga al banco. Due proprietà che nessun compilatore vede, e
 * che si rompono in silenzio la prima volta che qualcuno ne aggiunge una.
 */
describe('STORE_SALE_LINE_COLUMNS', () => {
  const idsDichiarati = STORE_SALE_LINE_COLUMNS.map((column) => column.id);

  it('⭐ l’EAN è DISPONIBILE: sta nel selettore', () => {
    // Deciso dal proprietario il 22/08/2026: chi spara il codice deve poterlo
    // verificare a schermo. «Disponibile» significa offerto, non acceso.
    expect(idsDichiarati).toContain('barcode');
  });

  it('⭐ …e SPENTO di default, per chi non ha mai toccato le colonne', () => {
    const stato = createDefaultViewState(STORE_SALE_LINE_COLUMNS, STORE_SALE_LINE_PRESETS);

    expect(resolveVisibleColumns(STORE_SALE_LINE_COLUMNS, stato).map((c) => c.id)).not.toContain(
      'barcode',
    );
  });

  it('⛔ …e spento anche per chi HA preferenze salvate da prima', () => {
    // È la metà che si dimentica: la proprietà defaultVisible governa la
    // riconciliazione, l'assenza dai preset governa lo stato iniziale. Se i due
    // non concordano, la colonna nasce accesa per una metà degli operatori e
    // spenta per l'altra — e nessuno dei due gruppi l'ha chiesta.
    const salvatoPrimaDellEan = {
      presetId: TableViewPresetId.Default,
      columnOrder: ['sku', 'product', 'quantity', 'unitPrice', 'discount', 'vat', 'lineTotal'],
      hiddenColumnIds: [],
      pinnedColumnIds: [],
      columnWidths: {},
    };

    const riconciliato = reconcileStateWithDefs(salvatoPrimaDellEan, STORE_SALE_LINE_COLUMNS);

    expect(riconciliato.columnOrder).toContain('barcode');
    expect(riconciliato.hiddenColumnIds).toContain('barcode');
    // Le scelte già fatte dall'operatore non si toccano.
    expect(riconciliato.columnOrder.slice(0, 7)).toEqual(salvatoPrimaDellEan.columnOrder);
  });

  it('⛔ il COSTO non è dichiarato, quindi non è nemmeno accendibile', () => {
    // Il costo d’acquisto non sta davanti a chi batte gli scontrini, spesso
    // davanti al cliente. La sola via per non offrirlo è non dichiararlo: una
    // colonna «spenta» resterebbe raggiungibile dal selettore.
    expect(idsDichiarati).not.toContain('purchaseCost');
  });

  it('⛔ i preset elencano le mostrate, e restano allineati alle definizioni', () => {
    // La derivazione non si sostituisce con un elenco a mano: divergerebbe alla
    // prima colonna aggiunta, e nessun test di compilazione lo vedrebbe.
    const attese = STORE_SALE_LINE_COLUMNS.filter((c) => c.defaultVisible !== false).map(
      (c) => c.id,
    );

    for (const preset of Object.values(STORE_SALE_LINE_PRESETS)) {
      expect([...preset]).toEqual(attese);
    }
  });
});
