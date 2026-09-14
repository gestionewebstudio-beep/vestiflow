import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { BackgroundBlobExportService } from '@core/services/background-blob-export.service';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';

import { SHOPIFY_PROBLEMI_COLUMN_DEFS } from '../../models/shopify-problemi-table-columns.config';
import type { ShopifySetupProblemaDto } from '../../models/shopify-setup.dto';
import { ShopifyProblemiComponent } from './shopify-problemi.component';

/** Il doppio delle preferenze colonne: rende le colonne predefinite e non salva niente. */
const COLONNE_FINTE = {
  provide: TableColumnPreferenceService,
  useValue: {
    registerView: vi.fn(),
    columnDefs: vi.fn(() => SHOPIFY_PROBLEMI_COLUMN_DEFS),
    visibleColumns: vi.fn(() =>
      signal(
        SHOPIFY_PROBLEMI_COLUMN_DEFS.filter((c) => c.defaultVisible).map((c) => ({
          ...c,
          pinned: false,
        })),
      ).asReadonly(),
    ),
    visibleColumnIds: vi.fn(() => SHOPIFY_PROBLEMI_COLUMN_DEFS.map((c) => c.id)),
    state: vi.fn(() =>
      signal({
        presetId: 'default',
        columnOrder: SHOPIFY_PROBLEMI_COLUMN_DEFS.map((c) => c.id),
        hiddenColumnIds: [] as string[],
        pinnedColumnIds: [] as string[],
        columnWidths: {},
      }).asReadonly(),
    ),
    presetMap: vi.fn(() => ({})),
    isColumnVisible: vi.fn(() => true),
    moveColumn: vi.fn(),
    toggleColumn: vi.fn(),
    togglePin: vi.fn(),
    applyPreset: vi.fn(),
    resetToDefault: vi.fn(),
    columnWidth: vi.fn((_vista: unknown, _colonna: string, ripiego: number) => ripiego),
    setColumnWidths: vi.fn(),
  },
};

function problema(sovrascrivi: Partial<ShopifySetupProblemaDto>): ShopifySetupProblemaDto {
  return {
    tipo: 'coppia',
    causa: 'coppia_lettura_fallita',
    riferimento: 'v1:l1',
    nome: 'Maglia (SKU-1)',
    dettaglio: 'M',
    sede: 'Sede B',
    conseguenza: 'Base non stabilita: la lettura del canale è fallita.',
    azione: { tipo: 'allinea', etichetta: 'Allinea giacenze su Shopify', riferimento: null },
    apri: { tipo: 'apri_articolo', etichetta: 'Apri l’articolo', riferimento: 'p1' },
    rilevatoAt: '2026-09-13T01:14:00.000Z',
    ...sovrascrivi,
  };
}

const PROBLEMI: readonly ShopifySetupProblemaDto[] = [
  problema({
    tipo: 'ordine',
    causa: 'ordine_permesso_fulfillment_orders',
    riferimento: 'o1',
    nome: '#1010',
    dettaglio: null,
    sede: null,
    conseguenza: 'Nessun impegno per le sue righe: la quantità resta ferma.',
    azione: {
      tipo: 'permessi',
      etichetta: 'Disconnetti e Connetti Shopify',
      riferimento: null,
    },
    apri: { tipo: 'apri_ordine', etichetta: 'Apri l’ordine', riferimento: 'o1' },
  }),
  ...Array.from({ length: 3 }, (_, i) =>
    problema({ riferimento: `v${i}:l1`, nome: `Articolo ${i}` }),
  ),
  problema({
    causa: 'coppia_non_stoccata',
    riferimento: 'v9:l1',
    nome: 'Cintura',
    conseguenza: 'Su Shopify l’articolo non è stoccato in questa location.',
    azione: {
      tipo: 'shopify',
      etichetta: 'Su Shopify: stocca l’articolo nella location; poi «Allinea giacenze» qui',
      riferimento: null,
    },
  }),
];

async function apri(problemi: readonly ShopifySetupProblemaDto[]) {
  const esportazione = { start: vi.fn() };
  const azione = vi.fn();
  await render(ShopifyProblemiComponent, {
    inputs: { problemi },
    on: { azione },
    providers: [
      provideRouter([]),
      COLONNE_FINTE,
      { provide: BackgroundBlobExportService, useValue: esportazione },
    ],
  });
  return { esportazione, azione };
}

/**
 * ⭐ I problemi si leggono per CAUSA (conteggio, conseguenza, azione), poi uno
 *    per uno sul motore comune con ricerca ed esportazione; l'azione riusa i
 *    comandi di chi ospita, ordine e articolo si aprono da un collegamento
 *    (13/09/2026, `docs/27` §4-bis).
 */
describe('ShopifyProblemiComponent', () => {
  it('senza problemi lo dice, e non mostra strumenti', async () => {
    await apri([]);
    expect(screen.getByText('Nessun problema aperto: la sincronizzazione lavora.')).toBeVisible();
    expect(screen.queryByRole('table')).toBeNull();
  });

  /** Le righe della tabella delle cause (una per causa), senza l'intestazione. */
  function righeDelleCause() {
    const tabella = screen.getByRole('table', { name: 'Le cause dei problemi aperti' });
    return within(tabella).getAllByRole('row').slice(1);
  }

  it('raggruppa per causa: 3 coppie con la stessa causa sono UNA riga da 3', async () => {
    await apri(PROBLEMI);

    // ⭐ Una TABELLA delle cause (14/09/2026): N. · causa · effetto · azione con DOVE si fa.
    //    Il titolo e il conteggio li dà chi ospita: qui le cause, e basta.
    const righe = righeDelleCause();
    expect(righe).toHaveLength(3);
    expect(righe[0]).toHaveTextContent('1');
    expect(righe[0]).toHaveTextContent('Ordine senza sede: manca il permesso di leggerla');
    expect(righe[1]).toHaveTextContent('3');
    expect(righe[1]).toHaveTextContent('Quantità senza base: lettura del canale fallita');
    // I primi nomi stanno sotto la causa, piccoli: di chi si parla senza aprire l'elenco.
    expect(righe[1]).toHaveTextContent('Articolo 0');
    // ⭐ L'azione dice DOVE si fa (docs/29 §2.3): «da fare su Shopify» non è «nessuna
    //    azione», e non è un pulsante.
    expect(righe[2]).toHaveTextContent('Articolo non stoccato nella location Shopify');
    expect(screen.getByRole('columnheader', { name: 'Effetto' })).toBeVisible();
    expect(
      screen.getAllByText('Su Shopify', { selector: '.problemi__dove' }).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Su Shopify/ })).toBeNull();
    expect(screen.queryByText('Nessuna azione')).toBeNull();
  });

  /**
   * ⛔ Le notifiche sulla sede degli ordini mancano perché manca il PERMESSO: Shopify
   *    rifiuta la registrazione. Mostrare «Registra le notifiche mancanti» come rimedio
   *    farebbe ripetere un comando che fallisce (proprietario, 14/09/2026): la riga dice
   *    prima la nuova autorizzazione, e il rimando va ai permessi.
   */
  it('notifiche mancanti PER il permesso mancante: prima la nuova autorizzazione, non «Registra»', async () => {
    const utente = userEvent.setup();
    const { azione } = await apri([
      problema({
        tipo: 'connessione',
        causa: 'connessione_ambiti_mancanti',
        riferimento: 'ambiti',
        nome: 'read_merchant_managed_fulfillment_orders',
        sede: null,
        dettaglio: null,
        azione: {
          tipo: 'permessi',
          etichetta:
            'Disconnetti e Connetti Shopify: la nuova autorizzazione chiede i permessi mancanti',
          riferimento: null,
        },
        apri: null,
      }),
      problema({
        tipo: 'connessione',
        causa: 'connessione_webhook_mancanti',
        riferimento: 'webhook',
        nome: 'fulfillment_orders/moved, fulfillment_orders/order_routing_complete',
        sede: null,
        dettaglio: null,
        azione: { tipo: 'webhook', etichetta: 'Registra le notifiche mancanti', riferimento: null },
        apri: null,
      }),
    ]);

    const righe = righeDelleCause();
    expect(righe).toHaveLength(2);
    const notifiche = righe.find((r) =>
      r.textContent?.includes('Notifiche Shopify non registrate'),
    )!;
    expect(notifiche).toHaveTextContent(/Prima la nuova autorizzazione/);
    expect(notifiche).toHaveTextContent(/Registrarle senza il permesso non riesce/);
    expect(within(notifiche).queryByRole('button', { name: /Vai alle notifiche/ })).toBeNull();
    await utente.click(within(notifiche).getByRole('button', { name: /Vai a Connessione e sedi/ }));
    expect(azione).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'permessi' }));
  });

  it('notifiche mancanti SENZA un permesso mancante: il rimando resta alle notifiche', async () => {
    await apri([
      problema({
        tipo: 'connessione',
        causa: 'connessione_webhook_mancanti',
        riferimento: 'webhook',
        nome: 'orders/cancelled',
        sede: null,
        dettaglio: null,
        azione: { tipo: 'webhook', etichetta: 'Registra le notifiche mancanti', riferimento: null },
        apri: null,
      }),
    ]);
    const [riga] = righeDelleCause();
    expect(riga).toHaveTextContent('Registra le notifiche mancanti');
    expect(
      within(riga!).getByRole('button', { name: /Vai alle notifiche dal negozio/ }),
    ).toBeVisible();
  });

  it('l’azione di un gruppo è un RIMANDO a chi ospita: porta al posto in cui si fa, con il perimetro', async () => {
    const utente = userEvent.setup();
    const { azione } = await apri(PROBLEMI);

    // ⭐ Il gruppo dice la frase intera e rimanda; l'elenco ripete la forma breve.
    //    «Allinea» si esegue in un posto solo: qui si va, non si allinea
    //    (proprietario, 13/09/2026).
    const gruppoPermessi = righeDelleCause()[0]!;
    expect(gruppoPermessi).toHaveTextContent('In questa pagina');
    await utente.click(
      within(gruppoPermessi).getByRole('button', {
        name: 'Vai a Connessione e sedi (Disconnetti, poi Connetti) ›',
      }),
    );
    expect(azione).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'permessi', etichetta: 'Disconnetti e Connetti Shopify' }),
    );

    // La forma breve dichiara il perimetro: mai «allinea questa riga».
    const rimandiAllinea = screen.getAllByRole('button', {
      name: 'Vai ad Allinea giacenze (tutti gli articoli, tutte le sedi) ›',
    });
    expect(rimandiAllinea.length).toBeGreaterThan(1);
    expect(screen.queryByRole('button', { name: /Allinea giacenze su Shopify$/ })).toBeNull();
  });

  it('l’elenco è sul motore: una riga per problema, l’ordine e l’articolo sono collegamenti', async () => {
    await apri(PROBLEMI);

    const tabella = screen.getByRole('table', {
      name: 'Problemi aperti della sincronizzazione Shopify',
    });
    expect(within(tabella).getAllByRole('link', { name: '#1010' })[0]).toHaveAttribute(
      'href',
      '/app/sales/o1',
    );
    expect(within(tabella).getAllByRole('link', { name: 'Articolo 0' })[0]).toHaveAttribute(
      'href',
      '/app/products/p1',
    );
    // Il codice della causa non compare: si legge la frase.
    expect(within(tabella).queryByText('coppia_lettura_fallita')).toBeNull();
  });

  it('la ricerca restringe l’elenco e l’esportazione porta SOLO ciò che si vede', async () => {
    const utente = userEvent.setup();
    const { esportazione } = await apri(PROBLEMI);

    await utente.type(screen.getByRole('searchbox', { name: 'Cerca fra i problemi' }), 'Cintura');
    const tabella = screen.getByRole('table', {
      name: 'Problemi aperti della sincronizzazione Shopify',
    });
    expect(within(tabella).getAllByRole('link', { name: 'Cintura' }).length).toBeGreaterThan(0);
    expect(within(tabella).queryByRole('link', { name: '#1010' })).toBeNull();

    await utente.click(screen.getByRole('button', { name: 'Esporta CSV' }));
    expect(esportazione.start).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'problemi-shopify.csv',
        successMessage: 'Esportati 1 problemi.',
      }),
    );
  });
});
