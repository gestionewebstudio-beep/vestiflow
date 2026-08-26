import { DocumentType } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { isManualUnloadDisabled } from './manual-unload-feature.util';

/**
 * ⭐ **`=== true`, e la differenza non è pedanteria.**
 *
 * Il default della Vendita manuale è SPENTA, e la riga di
 * `tenant_feature_settings` si materializza solo quando qualcuno apre il
 * pannello Impostazioni. Scritta `!== false`, la funzione sarebbe accesa per
 * ogni azienda che non ha mai aperto le Impostazioni — cioè quasi tutte, e
 * proprio quelle che non hanno mai deciso niente.
 */
describe('isManualUnloadDisabled', () => {
  const acceso = { manualUnloadEnabled: true };
  const spento = { manualUnloadEnabled: false };

  it('⭐ accesa: la Vendita manuale si può fare', () => {
    expect(isManualUnloadDisabled(acceso, DocumentType.manual_unload)).toBe(false);
  });

  it('⛔ spenta: non si può', () => {
    expect(isManualUnloadDisabled(spento, DocumentType.manual_unload)).toBe(true);
  });

  it('⛔ profilo senza il campo: spenta, non accesa', () => {
    expect(isManualUnloadDisabled({} as never, DocumentType.manual_unload)).toBe(true);
  });

  it('⛔ nessun utente: spenta', () => {
    expect(isManualUnloadDisabled(undefined, DocumentType.manual_unload)).toBe(true);
    expect(isManualUnloadDisabled(null, DocumentType.manual_unload)).toBe(true);
  });

  it('⭐ e non tocca NESSUN altro tipo documento, nemmeno a funzione spenta', () => {
    // ⚠️ È il confine dell'interruttore: spegne una funzione, non il registro.
    for (const tipo of [
      DocumentType.sales_ddt,
      DocumentType.customer_order,
      DocumentType.quote,
      DocumentType.goods_receipt,
      DocumentType.transfer,
      DocumentType.adjustment,
      DocumentType.invoice,
    ]) {
      expect(isManualUnloadDisabled(spento, tipo), tipo).toBe(false);
      expect(isManualUnloadDisabled(undefined, tipo), tipo).toBe(false);
    }
  });
});
