import { describe, expect, it } from 'vitest';

import { irrisoltiDelPercorso } from './shopify-setup-irrisolti.util';
import type { ShopifySetupAnteprimaDto, ShopifySetupEsitoDto } from './shopify-setup.model';

const ANTEPRIMA: ShopifySetupAnteprimaDto = {
  computedAt: '2026-09-12T10:00:00.000Z',
  direction: 'shopify_to_vestiflow',
  catalogo: {
    remoti: 1,
    locali: 0,
    collegati: 0,
    daImportare: 1,
    daAggiornare: 0,
    daPubblicare: 0,
    ambigui: [],
  },
  sedi: { collegate: [], lasciate: [], daDecidere: [] },
  quantita: { coppie: 0, righe: [], righeTotali: 0, nonDeterminabili: [], articoliNuovi: 0 },
  ordini: {
    aperti: 3,
    parziali: 1,
    senzaSede: 1,
    giaInVestiFlow: 0,
    elenco: [
      {
        shopifyOrderId: '9001',
        nome: '#9001',
        stato: 'aperto',
        righe: 1,
        sedeDeterminabile: true,
        giaInVestiFlow: false,
      },
      {
        shopifyOrderId: '9002',
        nome: '#9002',
        stato: 'aperto',
        righe: 1,
        sedeDeterminabile: false,
        giaInVestiFlow: false,
      },
      {
        shopifyOrderId: '9003',
        nome: '#9003',
        stato: 'parziale',
        righe: 2,
        sedeDeterminabile: true,
        giaInVestiFlow: false,
      },
    ],
  },
  blocchi: [],
};

const ESITO: ShopifySetupEsitoDto = {
  fase: 'concluso',
  startedAt: '2026-09-12T10:00:00.000Z',
  finishedAt: '2026-09-12T10:05:00.000Z',
  interruzione: null,
  catalogo: { imported: 1, updated: 0, skipped: 0, failed: 1, esclusiAmbigui: 0 },
  quantita: { coppie: 2, scritte: 1, invariate: 0, giaScritte: 0, nonDeterminabili: 1 },
  allinea: null,
  esclusi: [
    { tipo: 'articolo', riferimento: '777', nome: 'Maglia', motivo: 'import fallito' },
    {
      tipo: 'coppia',
      riferimento: 'v1·l1',
      nome: 'Borsa · Sede 1',
      motivo: 'quantità non determinabile',
      dettaglio: 'articolo assente sul canale',
    },
  ],
};

describe('irrisoltiDelPercorso — i casi che l’attivazione non risolve, nominati', () => {
  it('unisce gli esclusi del trasferimento e gli ordini che non diventano impegni', () => {
    const irrisolti = irrisoltiDelPercorso(ANTEPRIMA, ESITO);

    expect(irrisolti.map((i) => [i.tipo, i.nome])).toEqual([
      ['articolo', 'Maglia'],
      ['coppia', 'Borsa · Sede 1'],
      ['ordine', '#9002'],
      ['ordine', '#9003'],
    ]);
    // Il dettaglio dell’escluso entra nel motivo: chi legge non apre altro.
    expect(irrisolti[1]?.motivo).toBe('quantità non determinabile — articolo assente sul canale');
    expect(irrisolti[2]?.motivo).toMatch(/sede non collegata/);
    expect(irrisolti[3]?.motivo).toMatch(/evaso in parte/);
  });

  it('l’ordine con sede e aperto NON è un caso irrisolto: diventa impegno', () => {
    const irrisolti = irrisoltiDelPercorso(ANTEPRIMA, null);
    expect(irrisolti.map((i) => i.riferimento)).not.toContain('9001');
  });

  it('gli ordini oltre le prime righe si CONTANO, non spariscono', () => {
    const irrisolti = irrisoltiDelPercorso(
      { ...ANTEPRIMA, ordini: { ...ANTEPRIMA.ordini, senzaSede: 4, parziali: 1 } },
      null,
    );
    // Due nominati (#9002, #9003) su cinque contati: gli altri tre restano dichiarati.
    expect(irrisolti.at(-1)).toMatchObject({ tipo: 'ordine', nome: 'altri 3 ordini' });
  });

  it('gli ordini falliti all’attivazione si dichiarano', () => {
    const irrisolti = irrisoltiDelPercorso(null, {
      ...ESITO,
      esclusi: [],
      attivazione: {
        ordini: { totale: 2, acquisiti: 0, giaPresenti: 0, senzaSede: 0, parziali: 0, falliti: 2 },
        base: { totale: 0, allineate: 0, giaAllineate: 0, nonAllineate: 0 },
        ordersSinceId: '0',
      },
    });
    expect(irrisolti).toEqual([
      expect.objectContaining({
        tipo: 'ordine',
        nome: '2 ordini',
        motivo: expect.stringMatching(/fallita/),
      }),
    ]);
  });

  it('senza esclusi e senza ordini fuori: vuoto — l’unico caso in cui niente resta escluso', () => {
    expect(
      irrisoltiDelPercorso(
        { ...ANTEPRIMA, ordini: { ...ANTEPRIMA.ordini, senzaSede: 0, parziali: 0, elenco: [] } },
        { ...ESITO, esclusi: [] },
      ),
    ).toEqual([]);
  });
});
