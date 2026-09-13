import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ShopifySetupAnteprimaDto, ShopifySetupDto } from '../../models/shopify-setup.dto';
import { ShopifySetupPanelComponent } from './shopify-setup-panel.component';

const BASE: ShopifySetupDto = {
  presente: true,
  status: 'scelte',
  direction: null,
  locations: [
    {
      shopifyLocationId: '11',
      name: 'Negozio centro',
      active: true,
      choice: null,
      locationId: null,
      locationName: null,
    },
    {
      shopifyLocationId: '22',
      name: 'Deposito',
      active: false,
      choice: 'lascia',
      locationId: null,
      locationName: null,
    },
  ],
  sediVestiFlow: [
    { id: 'loc-1', name: 'Sede 1', code: 'S1', shopifyLocationId: null },
    { id: 'loc-2', name: 'Sede già presa', code: 'S2', shopifyLocationId: '99' },
  ],
  anteprima: null,
  esito: null,
  confirmedAt: null,
  activatedAt: null,
  blocchiAttivazione: [],
  irrisolti: [],
  trasferimentoInCorso: false,
  situazione: { calcolataAt: '2026-09-13T01:00:00.000Z', problemi: [] },
};

const ANTEPRIMA: ShopifySetupAnteprimaDto = {
  computedAt: '2026-09-12T10:00:00.000Z',
  direction: 'shopify_to_vestiflow',
  catalogo: {
    remoti: 10,
    locali: 3,
    collegati: 0,
    daImportare: 9,
    daAggiornare: 0,
    daPubblicare: 0,
    ambigui: [
      {
        sku: 'ABC',
        locale: { productId: 'p1', nome: 'Maglia' },
        remoto: { shopifyProductId: '777', titolo: 'Maglia Shopify' },
      },
    ],
  },
  sedi: {
    collegate: [
      {
        locationId: 'loc-1',
        nome: 'Sede 1',
        shopifyLocationId: '11',
        shopifyName: 'Negozio centro',
      },
    ],
    lasciate: [{ shopifyLocationId: '22', shopifyName: 'Deposito' }],
    daDecidere: [],
  },
  quantita: { coppie: 4, righe: [], righeTotali: 0, nonDeterminabili: [], articoliNuovi: 9 },
  ordini: {
    aperti: 1,
    parziali: 0,
    senzaSede: 1,
    giaInVestiFlow: 0,
    elenco: [
      {
        shopifyOrderId: '9001',
        nome: '#9001',
        stato: 'aperto',
        righe: 2,
        sedeDeterminabile: false,
        giaInVestiFlow: false,
      },
    ],
  },
  blocchi: [],
};

async function apri(setup: ShopifySetupDto) {
  const esiti = {
    direzioneScelta: vi.fn(),
    sedeScelta: vi.fn(),
    anteprimaRichiesta: vi.fn(),
    confermata: vi.fn(),
    indietro: vi.fn(),
    attivazioneRichiesta: vi.fn(),
  };
  await render(ShopifySetupPanelComponent, { inputs: { setup }, on: esiti });
  return esiti;
}

describe('ShopifySetupPanelComponent — le tre fasi visibili', () => {
  it('le tre fasi stanno sempre a schermo, e la prima chiede la direzione', async () => {
    const utente = userEvent.setup();
    const esiti = await apri(BASE);

    expect(screen.getByRole('heading', { name: /1 Scelte iniziali/ })).toBeVisible();
    expect(screen.getByRole('heading', { name: /2 Sedi/ })).toBeVisible();
    expect(screen.getByRole('heading', { name: /3 Controllo e conferma/ })).toBeVisible();

    await utente.click(screen.getByRole('button', { name: 'Shopify → VestiFlow' }));
    expect(esiti.direzioneScelta).toHaveBeenCalledWith('shopify_to_vestiflow');
  });

  it('fase Sedi: una scelta per location; una sede già collegata ad ALTRA location non si offre', async () => {
    const utente = userEvent.setup();
    const esiti = await apri({ ...BASE, status: 'sedi', direction: 'shopify_to_vestiflow' });

    await utente.click(
      screen.getByRole('button', { name: /Scelta per la location Negozio centro/ }),
    );
    const voci = screen.getAllByRole('option').map((o) => o.textContent?.trim());
    // La prima voce è il segnaposto del menu; «Sede già presa» (collegata a #99) non c’è.
    expect(voci).toEqual([
      'Decidi…',
      'Lascia fuori da VestiFlow',
      'Crea la sede «Negozio centro»',
      'Collega a «Sede 1»',
    ]);
    await utente.click(screen.getByRole('option', { name: 'Collega a «Sede 1»' }));
    expect(esiti.sedeScelta).toHaveBeenCalledWith({
      shopifyLocationId: '11',
      scelta: { choice: 'collega', locationId: 'loc-1' },
    });

    // Una location ancora da decidere tiene chiuso il passaggio al controllo.
    expect(screen.getByRole('button', { name: 'Vai al controllo' })).toBeDisabled();
  });

  it('fase Controllo: senza anteprima si può solo calcolarla; con blocchi non si conferma', async () => {
    const utente = userEvent.setup();
    const esiti = await apri({
      ...BASE,
      status: 'controllo',
      direction: 'shopify_to_vestiflow',
      anteprima: { ...ANTEPRIMA, blocchi: ['Location «Deposito» senza scelta.'] },
    });

    expect(screen.getByText('Location «Deposito» senza scelta.')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Conferma e avvia il trasferimento' }),
    ).toBeDisabled();
    expect(screen.getByText(/1 articoli esclusi: stesso SKU/)).toBeVisible();
    // Gli ordini aperti si vedono, e chi resterà fuori è nominato.
    expect(screen.getByText(/1 aperti su Shopify: diventano impegni/)).toBeVisible();
    expect(screen.getByText(/Ordini che resteranno senza impegno: 1/)).toBeVisible();
    // Dentro il `details` chiuso: c’è, si apre col riassunto.
    expect(screen.getByText(/#9001 · 2 righe/)).toBeInTheDocument();

    await utente.click(screen.getByRole('button', { name: 'Ricalcola anteprima' }));
    expect(esiti.anteprimaRichiesta).toHaveBeenCalledTimes(1);
  });

  it('fase Controllo: le variazioni previste stanno sul motore comune, ordinabili', async () => {
    const utente = userEvent.setup();
    await apri({
      ...BASE,
      status: 'controllo',
      direction: 'shopify_to_vestiflow',
      anteprima: {
        ...ANTEPRIMA,
        quantita: {
          coppie: 3,
          righeTotali: 3,
          nonDeterminabili: [],
          articoliNuovi: 0,
          righe: [
            {
              sku: 'B-2',
              articolo: 'Borsa',
              variante: null,
              sede: 'Sede 1',
              attuale: 1,
              prevista: 7,
              delta: 6,
            },
            {
              sku: 'A-1',
              articolo: 'Maglia',
              variante: 'M · Rosso',
              sede: 'Sede 1',
              attuale: 0,
              prevista: 4,
              delta: 4,
            },
          ],
        },
      },
    });

    const riassunto = screen.getByText(/Variazioni previste/);
    expect(riassunto.textContent?.replace(/\s+/g, ' ')).toContain('(2 su 3)');
    await utente.click(riassunto);
    const tabella = screen.getByRole('table', { name: 'Quantità attuali e previste' });
    expect(within(tabella).getByRole('columnheader', { name: /Attuale/ })).toBeInTheDocument();
    expect(within(tabella).getByRole('columnheader', { name: /Prevista/ })).toBeInTheDocument();
    // Le righe del motore, non quelle di riempimento.
    const righe = tabella.querySelectorAll('tr.data-table__row');
    expect(righe).toHaveLength(2);
    expect(righe[0]?.textContent).toContain('Borsa');
    expect(righe[1]?.textContent).toContain('M · Rosso');

    // Ordinamento numerico su «Attuale»: 0 (Maglia) sale sopra 1 (Borsa).
    await utente.click(within(tabella).getByRole('button', { name: /Attuale/ }));
    const dopo = tabella.querySelectorAll('tr.data-table__row');
    expect(dopo[0]?.textContent).toContain('Maglia');
    expect(dopo[1]?.textContent).toContain('Borsa');
  });

  it('fase Controllo: anteprima senza blocchi → si conferma; la conferma non dichiara niente riuscito', async () => {
    const utente = userEvent.setup();
    const esiti = await apri({
      ...BASE,
      status: 'controllo',
      direction: 'shopify_to_vestiflow',
      anteprima: ANTEPRIMA,
    });

    await utente.click(screen.getByRole('button', { name: 'Conferma e avvia il trasferimento' }));
    expect(esiti.confermata).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/l’esito si legge sotto, non si dà per riuscito/)).toBeVisible();
  });

  it('trasferito ma bloccato: l’attivazione resta chiusa e il blocco si legge', async () => {
    await apri({
      ...BASE,
      status: 'trasferito',
      direction: 'shopify_to_vestiflow',
      anteprima: ANTEPRIMA,
      esito: {
        fase: 'concluso',
        startedAt: '2026-09-12T10:00:00.000Z',
        finishedAt: '2026-09-12T10:05:00.000Z',
        interruzione: null,
        catalogo: { imported: 9, updated: 0, skipped: 0, failed: 0, esclusiAmbigui: 1 },
        quantita: { coppie: 4, scritte: 3, invariate: 1, giaScritte: 0, nonDeterminabili: 0 },
        allinea: null,
        esclusi: [
          { tipo: 'articolo', riferimento: '777', nome: 'Maglia Shopify', motivo: 'sku_ambiguo' },
        ],
      },
      // Uno dei tre blocchi veri di `ShopifySetupService.blocchiAttivazione`.
      blocchiAttivazione: ['La connessione Shopify non è attiva.'],
    });

    expect(screen.getByText('Trasferito, da attivare')).toBeVisible();
    expect(screen.getByText(/Catalogo: 9 importati/)).toBeVisible();
    expect(screen.getByText(/La connessione Shopify non è attiva/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Attiva la sincronizzazione' })).toBeDisabled();
  });

  /**
   * ⭐ Nessun caso irrisolto si dichiara pronto (12/09/2026): i casi che
   *    l’attivazione non risolve stanno APERTI davanti al pulsante, con il tipo
   *    e il motivo — non in un dettaglio chiuso — e dopo l’attivazione il
   *    badge li conta. Solo con l’elenco vuoto si legge «nessun caso escluso».
   */
  const TRASFERITO_CON_CASI: ShopifySetupDto = {
    ...BASE,
    status: 'trasferito',
    direction: 'shopify_to_vestiflow',
    anteprima: ANTEPRIMA,
    esito: {
      fase: 'concluso',
      startedAt: '2026-09-12T10:00:00.000Z',
      finishedAt: '2026-09-12T10:05:00.000Z',
      interruzione: null,
      catalogo: { imported: 9, updated: 0, skipped: 0, failed: 0, esclusiAmbigui: 1 },
      quantita: { coppie: 4, scritte: 3, invariate: 1, giaScritte: 0, nonDeterminabili: 0 },
      allinea: null,
      esclusi: [
        { tipo: 'articolo', riferimento: '777', nome: 'Maglia Shopify', motivo: 'sku_ambiguo' },
      ],
    },
    irrisolti: [
      { tipo: 'articolo', riferimento: '777', nome: 'Maglia Shopify', motivo: 'sku_ambiguo' },
      { tipo: 'ordine', riferimento: '9001', nome: '#9001', motivo: 'sede non collegata' },
    ],
  };

  it('trasferito con casi irrisolti: l’elenco sta aperto davanti al pulsante, e niente dice «pronto»', async () => {
    const utente = userEvent.setup();
    const esiti = await apri(TRASFERITO_CON_CASI);

    const avviso = screen.getByRole('status');
    expect(avviso).toHaveTextContent(/riguarda solo le parti preparate: 2 casi restano esclusi/);
    expect(within(avviso).getByText(/Maglia Shopify — sku_ambiguo/)).toBeVisible();
    expect(within(avviso).getByText(/#9001 — sede non collegata/)).toBeVisible();
    expect(screen.queryByText(/Nessun caso escluso/)).toBeNull();
    expect(screen.queryByText(/pront[oa]/i)).toBeNull();
    // Si attiva lo stesso: le parti preparate. Ma chi preme ha letto l’elenco.
    await utente.click(screen.getByRole('button', { name: 'Attiva la sincronizzazione' }));
    expect(esiti.attivazioneRichiesta).toHaveBeenCalledTimes(1);
  });

  it('trasferito senza casi irrisolti: lo dice, ed è l’unico caso in cui lo dice', async () => {
    await apri({
      ...TRASFERITO_CON_CASI,
      esito: { ...TRASFERITO_CON_CASI.esito!, esclusi: [] },
      irrisolti: [],
    });

    expect(screen.getByText('Nessun caso escluso: tutte le parti sono preparate.')).toBeVisible();
    expect(screen.queryByRole('status')).toBeNull();
  });

  /**
   * ⭐ Dopo l'attivazione (13/09/2026): il badge conta i PROBLEMI APERTI letti
   *    ora (`situazione`), non una fotografia; il percorso è uno storico
   *    richiudibile, chiuso, e dentro dice dove stanno i problemi; l'elenco
   *    degli esclusi di allora NON si ripete.
   */
  it('conclusa con problemi aperti: percorso concluso ed esito sono due stati, le fasi si leggono, il rimando ai problemi va a chi ospita', async () => {
    await apri({
      ...TRASFERITO_CON_CASI,
      status: 'attivato',
      activatedAt: '2026-09-12T11:00:00.000Z',
      situazione: {
        calcolataAt: '2026-09-13T01:00:00.000Z',
        problemi: [
          {
            tipo: 'ordine',
            causa: 'ordine_permesso_fulfillment_orders',
            riferimento: 'o1',
            nome: '#1010',
            dettaglio: null,
            sede: null,
            conseguenza: 'Nessun impegno.',
            azione: { tipo: 'permessi', etichetta: 'Disconnetti e Connetti', riferimento: null },
            apri: { tipo: 'apri_ordine', etichetta: 'Apri', riferimento: 'o1' },
            rilevatoAt: '2026-09-13T00:49:00.000Z',
          },
          {
            tipo: 'coppia',
            causa: 'coppia_lettura_fallita',
            riferimento: 'v:l',
            nome: 'Maglia',
            dettaglio: null,
            sede: 'Sede B',
            conseguenza: 'Base non stabilita.',
            azione: { tipo: 'allinea', etichetta: 'Allinea', riferimento: null },
            apri: null,
            rilevatoAt: null,
          },
        ],
      },
    });

    // ⭐ «Percorso concluso» (con la data) e «esito» sono DUE stati, col loro colore.
    expect(screen.getByText(/conclusa il/)).toBeVisible();
    expect(screen.getByText('riuscita con 1 escluso')).toBeVisible();
    expect(screen.queryByText(/Attivata/)).toBeNull();
    // I problemi di oggi: un rimando a chi ospita, non un conteggio nel badge.
    expect(screen.getByRole('button', { name: '2 problemi aperti oggi ›' })).toBeVisible();
    // Niente storico chiuso: le tre fasi si leggono normalmente, con la sintesi
    // (i `details` che restano sono quelli dell'anteprima: articoli esclusi, variazioni).
    expect(document.querySelector('details.setup__storico')).toBeNull();
    expect(screen.getByText(/catalogo 9 importati\/pubblicati/)).toBeVisible();
    expect(screen.getByRole('heading', { name: /1 Scelte iniziali/ })).toBeVisible();
    expect(screen.getByRole('heading', { name: /3 Controllo e conferma/ })).toBeVisible();
    // Niente fotografia ripetuta: l'elenco «casi rimasti esclusi» non c'è più.
    expect(screen.queryByText(/casi sono rimasti esclusi/)).toBeNull();
    // L'esito resta, datato: è l'ultimo tentativo.
    expect(screen.getByText(/Esito dell’ultimo tentativo/)).toBeVisible();
    // I comandi non più utilizzabili: spenti, con il motivo.
    expect(screen.getByRole('button', { name: 'Attiva la sincronizzazione' })).toBeDisabled();
    expect(screen.getByText(/già attivata il/)).toBeVisible();
  });

  it('conclusa senza problemi aperti: nessun rimando ai problemi', async () => {
    await apri({
      ...TRASFERITO_CON_CASI,
      status: 'attivato',
      activatedAt: '2026-09-12T11:00:00.000Z',
    });

    expect(screen.getByText(/conclusa il/)).toBeVisible();
    expect(screen.queryByRole('button', { name: /problemi aperti oggi/ })).toBeNull();
  });

  /**
   * ⛔ Misurato sul negozio vero il 13/09/2026: l'attivazione era riuscita (webhook,
   *    ordini) mentre l'allineamento non era partito. Sono DUE esiti e si leggono
   *    separati; il fermo porta il motivo e l'azione, non un numero a zero.
   */
  it('attivata con allineamento FERMO: attivazione riuscita e fermo con motivo, separati', async () => {
    await apri({
      ...TRASFERITO_CON_CASI,
      status: 'attivato',
      activatedAt: '2026-09-12T11:00:00.000Z',
      esito: {
        ...TRASFERITO_CON_CASI.esito!,
        attivazione: {
          ordini: {
            totale: 4,
            acquisiti: 4,
            giaPresenti: 0,
            senzaSede: 2,
            parziali: 0,
            falliti: 0,
          },
          base: {
            totale: 0,
            allineate: 0,
            giaAllineate: 0,
            nonAllineate: 0,
            fermo: {
              motivo:
                'Quantità ferma verso Shopify: gli ordini #1010, #1011 sono aperti senza una sede determinabile.',
              ordini: ['#1010', '#1011'],
            },
          },
          ordersSinceId: '1',
        },
      },
    });

    // Lo stato dell'esito, separato dal «concluso»: l'allineamento è fermo.
    expect(screen.getByText('allineamento delle quantità fermo')).toBeVisible();
    expect(screen.getByText(/Attivazione riuscita: 4 ordini aperti acquisiti/)).toBeVisible();
    expect(screen.getByText(/2 senza sede \(nessun impegno\)/)).toBeVisible();
    // ⭐ Il fermo è UNA riga corta — il perché e l'azione stanno in «Situazione
    //    attuale», raggiunta da «Vedi problemi» — non un banner che ripete il motivo.
    const fermo = screen.getByText(/Allineamento delle quantità/, { selector: 'p' });
    expect(fermo).toHaveTextContent('fermo');
    expect(fermo).toHaveTextContent('2 ordini aperti senza sede (#1010, #1011)');
    expect(fermo).not.toHaveTextContent('Quantità ferma verso Shopify');
    // «Vedi problemi» va a chi ospita il pannello: la scheda dei problemi è sua.
    expect(screen.getByRole('button', { name: 'Vedi problemi ›' })).toBeVisible();
    expect(screen.queryByText(/Allineamento delle quantità: /)).toBeNull();
  });

  it('interrotto: si riprende, e lo dice come interruzione — mai come riuscito', async () => {
    const utente = userEvent.setup();
    const esiti = await apri({
      ...BASE,
      status: 'interrotto',
      direction: 'vestiflow_to_shopify',
      esito: {
        fase: 'quantita',
        startedAt: '2026-09-12T10:00:00.000Z',
        finishedAt: null,
        interruzione: { at: '2026-09-12T10:03:00.000Z', message: 'Shopify non ha risposto' },
        catalogo: { imported: 2, updated: 0, skipped: 0, failed: 0, esclusiAmbigui: 0 },
        quantita: null,
        allinea: { totale: 4, allineate: 1, giaAllineate: 0, nonAllineate: 0 },
        esclusi: [],
      },
    });

    expect(screen.getByText('Trasferimento interrotto')).toBeVisible();
    expect(screen.getByText(/interrotto: Shopify non ha risposto/)).toBeVisible();
    await utente.click(screen.getByRole('button', { name: 'Riprendi il trasferimento' }));
    expect(esiti.confermata).toHaveBeenCalledTimes(1);
  });
});
