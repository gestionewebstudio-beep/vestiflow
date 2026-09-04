import { DOCUMENT } from '@angular/common';
import { ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';

import { createLineColumnWidths } from './line-column-widths.store';
import type { LineColumnWidths } from './line-column-widths.store';
import { TableColumnPreferenceService } from './table-column-preference.service';
import { TableViewId, TableViewPresetId } from './table-column.model';
import type { TableColumnDef } from './table-column.model';
import { TableViewPreferenceApiService } from './table-view-preference-api.service';

/**
 * **Il punto unico delle larghezze di riga documento.**
 *
 * ⭐ Questi test presidiano ciò che le sette maschere NON devono piu' decidere
 * da sole: quanto e' larga una colonna, che cosa entra nel totale, che cosa
 * succede alle altre quando una si trascina, e che cosa si ritrova riaprendo.
 *
 * ⛔ La prova che conta e' quella sulla ridistribuzione: **trascinando una
 * maniglia la tabella non deve cambiare larghezza**. Era il difetto vero delle
 * cinque maschere a meta' — al rilascio, la colonna nuova alzava il totale e
 * ogni altra quota si restringeva con lui.
 */

const DEFS: readonly TableColumnDef[] = [
  { id: 'code', label: 'Codice', defaultWidthPx: 100, minWidthPx: 60 },
  { id: 'product', label: 'Articolo', defaultWidthPx: 300, minWidthPx: 120 },
  { id: 'qty', label: 'Q.ta', defaultWidthPx: 100, minWidthPx: 50 },
  { id: 'total', label: 'Totale', defaultWidthPx: 100, minWidthPx: 50 },
];

const PRESETS = {
  [TableViewPresetId.Default]: ['code', 'product', 'qty', 'total'],
  [TableViewPresetId.Warehouse]: ['code', 'qty'],
  [TableViewPresetId.Accountant]: ['code', 'total'],
  [TableViewPresetId.Supplier]: ['code', 'product'],
  [TableViewPresetId.Analysis]: ['code'],
  [TableViewPresetId.Operational]: ['code', 'product', 'qty', 'total'],
};

const VISTA = TableViewId.CustomerOrderLines;

/** Larghezza resa del contenitore: la scala in cui i minimi contano. */
const LARGHEZZA_TABELLA = 1000;

interface Banco {
  readonly preferenze: TableColumnPreferenceService;
  readonly nascoste: Set<string>;
  /** Ricrea il punto delle larghezze come farebbe una riapertura di maschera. */
  readonly riapri: () => LineColumnWidths;
}

function banco(opzioni: { larghezzaTabella?: number } = {}): Banco {
  const memoria = new Map<string, string>();
  const documentMock = {
    defaultView: {
      localStorage: {
        getItem: (key: string) => memoria.get(key) ?? null,
        setItem: (key: string, value: string) => void memoria.set(key, value),
        removeItem: (key: string) => void memoria.delete(key),
      },
    },
  };

  TestBed.configureTestingModule({
    providers: [
      TableColumnPreferenceService,
      { provide: DOCUMENT, useValue: documentMock },
      {
        provide: AuthService,
        useValue: { currentUser: () => ({ id: 'user-1', tenantId: 'tenant-1' }) },
      },
      {
        provide: TableViewPreferenceApiService,
        useValue: { load: vi.fn().mockReturnValue(of(null)), save: vi.fn().mockReturnValue(of(undefined)) },
      },
    ],
  });

  const preferenze = TestBed.inject(TableColumnPreferenceService);
  preferenze.registerView(VISTA, DEFS, PRESETS);

  const nascoste = new Set<string>();
  // Un finto contenitore misurabile: la ridistribuzione lavora in pixel resi,
  // e senza una larghezza vera non avrebbe una scala in cui convertirli.
  const wrap = { clientWidth: opzioni.larghezzaTabella ?? LARGHEZZA_TABELLA };
  Object.setPrototypeOf(wrap, HTMLElement.prototype);
  const host = new ElementRef({
    querySelector: () => wrap,
  } as unknown as HTMLElement);

  const riapri = (): LineColumnWidths =>
    createLineColumnWidths({
      defs: DEFS,
      viewId: VISTA,
      preferences: preferenze,
      isVisible: (id) => DEFS.some((def) => def.id === id) && !nascoste.has(id),
      host,
    });

  return { preferenze, nascoste, riapri };
}

/** La quota letta dal `[style.width]`, in numero. */
const percento = (quota: string): number => Number.parseFloat(quota);

describe('LineColumnWidths', () => {
  describe('quote', () => {
    it('la larghezza e una quota percentuale, non pixel', () => {
      const larghezze = banco().riapri();
      expect(larghezze.width('product')).toMatch(/^\d+\.\d{4}%$/);
    });

    it('il totale comprende la colonna numero riga', () => {
      const larghezze = banco().riapri();
      // 100 + 300 + 100 + 100 + 48 (numero riga) = 648
      expect(percento(larghezze.width('product'))).toBeCloseTo((300 / 648) * 100, 3);
      expect(percento(larghezze.indexWidth())).toBeCloseTo((48 / 648) * 100, 3);
    });

    it('⭐ le quote di TUTTE le colonne, numero riga compreso, sommano 100%', () => {
      const larghezze = banco().riapri();
      const somma =
        percento(larghezze.indexWidth()) +
        DEFS.reduce((acc, def) => acc + percento(larghezze.width(def.id)), 0);
      expect(somma).toBeCloseTo(100, 2);
    });

    it('una colonna nascosta esce dal totale, e le altre si riprendono lo spazio', () => {
      const b = banco();
      const prima = percento(b.riapri().width('product'));
      b.nascoste.add('qty');
      const dopo = percento(b.riapri().width('product'));
      expect(dopo).toBeGreaterThan(prima);
      // e le quote tornano comunque a 100%
      const larghezze = b.riapri();
      const somma =
        percento(larghezze.indexWidth()) +
        DEFS.filter((def) => def.id !== 'qty').reduce(
          (acc, def) => acc + percento(larghezze.width(def.id)),
          0,
        );
      expect(somma).toBeCloseTo(100, 2);
    });

    it('senza colonne visibili resta la quota del numero riga, non NaN', () => {
      const b = banco();
      for (const def of DEFS) {
        b.nascoste.add(def.id);
      }
      expect(b.riapri().indexWidth()).toBe('100.0000%');
    });
  });

  describe('minimi', () => {
    it('il minimo della colonna viene dalla configurazione', () => {
      const larghezze = banco().riapri();
      expect(larghezze.minWidth('product')).toBe(120);
      expect(larghezze.minWidth('qty')).toBe(50);
    });

    it('una colonna senza minimo dichiarato ne riceve uno di sistema', () => {
      const larghezze = banco().riapri();
      expect(larghezze.minWidth('sconosciuta')).toBe(48);
    });

    it('il minimo protegge una PREDEFINITA scritta troppo stretta', () => {
      const b = banco();
      const larghezze = createLineColumnWidths({
        defs: [
          { id: 'code', label: 'Codice', defaultWidthPx: 20, minWidthPx: 60 },
          { id: 'product', label: 'Articolo', defaultWidthPx: 300, minWidthPx: 120 },
        ],
        viewId: VISTA,
        preferences: b.preferenze,
        isVisible: () => true,
        host: new ElementRef({ querySelector: () => null } as unknown as HTMLElement),
      });
      // 60 (minimo) + 300 + 48 = 408, non 20 + 300 + 48
      expect(percento(larghezze.width('code'))).toBeCloseTo((60 / 408) * 100, 3);
    });

    it('⛔ ma NON si applica a una larghezza salvata: quella e un rapporto', () => {
      // Guardia di una regressione misurata il 24/08/2026, e introdotta da una
      // correzione precedente. Il minimo e' in pixel RESI; un peso salvato vale
      // meno dei pixel ogni volta che la tabella e' piu' larga della somma dei
      // default, quindi una colonna ferma al proprio minimo si salva sotto di
      // esso — legittimamente. Rialzarla gonfiava il denominatore e ricalcolava
      // OGNI quota su un totale diverso: la colonna appena rilasciata saltava
      // indietro e tutte le altre si spostavano.
      const b = banco();
      b.preferenze.setColumnWidth(VISTA, 'product', 40);
      const larghezze = b.riapri();
      // 40 (il peso salvato, non 120) + 100 + 100 + 100 + 48 = 388
      expect(percento(larghezze.width('product'))).toBeCloseTo((40 / 388) * 100, 3);
    });
  });

  describe('ridistribuzione al trascinamento', () => {
    it('⭐ trascinando una maniglia la tabella NON cambia larghezza', () => {
      const larghezze = banco().riapri();
      const sommaPrima =
        percento(larghezze.indexWidth()) +
        DEFS.reduce((acc, def) => acc + percento(larghezze.width(def.id)), 0);

      larghezze.onResizing('code', 260);

      const sommaDopo =
        percento(larghezze.indexWidth()) +
        DEFS.reduce((acc, def) => acc + percento(larghezze.width(def.id)), 0);
      expect(sommaPrima).toBeCloseTo(100, 2);
      expect(sommaDopo).toBeCloseTo(100, 2);
    });

    it('la colonna trascinata cresce e le altre cedono, non il contrario', () => {
      const larghezze = banco().riapri();
      const primaCode = percento(larghezze.width('code'));
      const primaProduct = percento(larghezze.width('product'));

      larghezze.onResizing('code', 260);

      expect(percento(larghezze.width('code'))).toBeGreaterThan(primaCode);
      expect(percento(larghezze.width('product'))).toBeLessThan(primaProduct);
    });

    it('⛔ nessuna colonna scende sotto il proprio minimo, nemmeno tirando molto', () => {
      const b = banco();
      const larghezze = b.riapri();
      larghezze.onResizing('code', 5000);

      // ⚠️ Il minimo si misura sui pixel RESI, non sui pesi salvati: e' l'unica
      // scala in cui «60 pixel» vuol dire qualcosa a schermo.
      for (const def of DEFS) {
        const resi = (percento(larghezze.width(def.id)) / 100) * LARGHEZZA_TABELLA;
        expect(resi).toBeGreaterThanOrEqual(def.minWidthPx! - 1);
      }
    });

    it('⭐ quello che si vede al rilascio e quello che si ritrova riaprendo', () => {
      const b = banco();
      const larghezze = b.riapri();
      larghezze.onResizing('code', 5000);
      larghezze.onResize('code', 5000);
      const alRilascio = DEFS.map((def) => percento(larghezze.width(def.id)));

      const riaperta = b.riapri();
      for (const [i, def] of DEFS.entries()) {
        expect(percento(riaperta.width(def.id))).toBeCloseTo(alRilascio[i]!, 1);
      }
    });

    it('la colonna numero riga non partecipa: la sua quota resta quella', () => {
      const larghezze = banco().riapri();
      const prima = percento(larghezze.indexWidth());
      larghezze.onResizing('code', 260);
      expect(percento(larghezze.indexWidth())).toBeCloseTo(prima, 2);
    });

    it('⭐ al RILASCIO la colonna resta dove e stata lasciata', () => {
      // Guardia del difetto peggiore trovato dalla verifica avversariale: il
      // clamp del minimo applicato ai pesi faceva saltare indietro la colonna
      // nell'istante in cui il risultato diventava definitivo — misurato in
      // 83px su una tabella da 1650. La somma resta costante fino in fondo.
      const b = banco();
      const larghezze = b.riapri();
      larghezze.onResizing('code', 5000);
      const durante = DEFS.map((def) => percento(larghezze.width(def.id)));

      larghezze.onResize('code', 5000);
      const dopo = DEFS.map((def) => percento(larghezze.width(def.id)));

      // Tolleranza mezzo punto percentuale: i pesi si salvano interi, quindi
      // un arrotondamento c'e' sempre (~0,06%). Il difetto che questa prova
      // guarda valeva il **5%** — e' fuori di due ordini di grandezza.
      for (const [i] of DEFS.entries()) {
        expect(dopo[i]).toBeCloseTo(durante[i]!, 0);
      }
    });

    it('senza un contenitore misurabile non ridistribuisce, e non sbaglia', () => {
      const larghezze = banco({ larghezzaTabella: 0 }).riapri();
      const prima = larghezze.width('code');
      larghezze.onResizing('code', 260);
      expect(larghezze.width('code')).toBe(prima);
    });
  });

  describe('preferenze', () => {
    it('⛔ un clic sull impugnatura senza trascinare non scrive niente', () => {
      const b = banco();
      const larghezze = b.riapri();
      larghezze.onResize('code', 100);
      expect(b.preferenze.state(VISTA)().columnWidths).toEqual({});
    });

    it('il rilascio scrive TUTTE le colonne in una volta sola', () => {
      const b = banco();
      const scritture = vi.spyOn(b.preferenze, 'setColumnWidths');
      const larghezze = b.riapri();
      larghezze.onResizing('code', 260);
      larghezze.onResize('code', 260);
      expect(scritture).toHaveBeenCalledTimes(1);
      expect(Object.keys(scritture.mock.calls[0]![1]).sort()).toEqual([
        'code',
        'product',
        'qty',
        'total',
      ]);
    });

    it('⭐ riaprendo la maschera le quote sono quelle lasciate', () => {
      const b = banco();
      const prima = b.riapri();
      prima.onResizing('code', 260);
      prima.onResize('code', 260);
      const quoteLasciate = DEFS.map((def) => prima.width(def.id));

      // Una nuova istanza legge dalle preferenze, senza bozza in corso.
      const dopo = b.riapri();
      for (const [i, def] of DEFS.entries()) {
        expect(percento(dopo.width(def.id))).toBeCloseTo(percento(quoteLasciate[i]!), 1);
      }
    });

    it('le larghezze salvate sono PESI: contano i rapporti, non i pixel', () => {
      const b = banco();
      const larghezze = b.riapri();
      larghezze.onResizing('code', 260);
      larghezze.onResize('code', 260);
      const salvate = b.preferenze.state(VISTA)().columnWidths;
      // La somma salvata e quella dei pixel RESI, non dei default di partenza.
      const somma = DEFS.reduce((acc, def) => acc + salvate[def.id]!, 0);
      expect(somma).toBeGreaterThan(0);
      // e le quote che ne derivano tornano comunque a 100%
      const dopo = b.riapri();
      const totale =
        percento(dopo.indexWidth()) + DEFS.reduce((acc, def) => acc + percento(dopo.width(def.id)), 0);
      expect(totale).toBeCloseTo(100, 2);
    });

    it('una colonna nascosta conserva la propria larghezza salvata', () => {
      const b = banco();
      b.preferenze.setColumnWidth(VISTA, 'qty', 222);
      b.nascoste.add('qty');
      b.riapri().width('code');
      b.nascoste.delete('qty');
      expect(percento(b.riapri().width('qty'))).toBeCloseTo((222 / 770) * 100, 3);
    });
  });

  describe('alias di colonna', () => {
    it('un id storico si risolve nel canonico prima di ogni conto', () => {
      const b = banco();
      const larghezze = createLineColumnWidths({
        defs: DEFS,
        viewId: VISTA,
        preferences: b.preferenze,
        isVisible: () => true,
        host: new ElementRef({ querySelector: () => null } as unknown as HTMLElement),
        normalizeId: (id) => (id === 'articolo' ? 'product' : id),
      });
      expect(larghezze.minWidth('articolo')).toBe(120);
      expect(larghezze.width('articolo')).toBe(larghezze.width('product'));
    });
  });
});
