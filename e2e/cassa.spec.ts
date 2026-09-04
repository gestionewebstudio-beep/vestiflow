import { expect, test, type Page } from '@playwright/test';

/**
 * ⭐ **LA CASSA, GUARDATA DA UN BROWSER VERO.**
 *
 * ⛔ **Esiste per due cose che jsdom non può dire.** La prima è la resa: la
 * Vendita tiene ricerca, carrello e incasso visibili INSIEME su scrivania, ed è
 * una griglia — un motore di layout la dispone, jsdom no. La seconda è la
 * navigazione fra le tre aree, che passa dal router vero.
 *
 * ⚠️ **Le risposte arrivano da un'INTERCETTAZIONE, non dal database.** L'API non
 * accetta il token dell'auth finta, quindi con l'utente di prova ogni chiamata
 * finirebbe in errore e le schermate non si renderebbero affatto. Qui il dato
 * non è il soggetto: lo sono la disposizione e le parole.
 */

const SEDE = { id: 'loc-1', name: 'Negozio di prova' };

const SESSIONE_APERTA = {
  id: 'sess-1',
  tenantId: 'ten-1',
  locationId: SEDE.id,
  status: 'open',
  openedAt: '2026-09-04T08:00:00.000Z',
  openedById: 'u-1',
  openedByName: 'Cassiere',
  openingFloatMinor: 5000,
  closedAt: null,
  closedByName: null,
  fiscalDeviceId: null,
  notes: null,
  countedCashMinor: null,
  declaredElectronicMinor: null,
  expectedCashMinor: null,
  expectedElectronicMinor: null,
};

const OPERAZIONI = {
  page: 1,
  pageSize: 100,
  total: 1,
  summary: {
    grossSalesMinor: 20000,
    returnsMinor: 0,
    netSalesMinor: 20000,
    cashMinor: 20000,
    electronicMinor: 0,
    saleCount: 1,
    returnCount: 0,
    operationCount: 1,
    averageMinor: 20000,
  },
  items: [
    {
      id: 'doc-1',
      kind: 'sale',
      reference: 'CS/2026/1',
      documentDate: '2026-09-04T00:00:00.000Z',
      createdAt: '2026-09-04T10:00:00.000Z',
      status: 'confirmed',
      locationId: SEDE.id,
      locationName: SEDE.name,
      operatorId: 'u-1',
      operatorName: 'Cassiere',
      sessionId: 'sess-1',
      customerName: null,
      totalMinor: 20000,
      payments: [
        {
          paymentOptionId: 'pay-1',
          optionName: 'Contanti',
          tenderKind: 'cash',
          amountMinor: 20000,
          tenderedMinor: 20000,
          refundedFromPaymentId: null,
        },
      ],
      mixed: false,
      changeMinor: 0,
      sourceDocumentId: null,
      sourceReference: null,
      anomalies: [],
    },
  ],
};

async function intercetta(page: Page): Promise<void> {
  // ⚠️ **`/inventory/locations`, e un ARRAY NUDO.** Le sedi non arrivano da
  //    `/locations` e non hanno un involucro paginato: sbagliando endpoint la
  //    Cassa resta su «Scegli la sede» e la prova misura una schermata vuota.
  await page.route('**/api/v1/inventory/locations**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          ...SEDE,
          tenantId: 'ten-1',
          isActive: true,
          licensedInVf: true,
          shopifySyncStatus: 'not_synced',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    }),
  );
  await page.route('**/api/v1/payment-options**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 'pay-1', name: 'Contanti', kind: 'method', isActive: true, sortOrder: 1, tenderKind: 'cash' },
      ]),
    }),
  );
  await page.route('**/api/v1/cash-sessions/current**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ session: SESSIONE_APERTA, depositsMinor: 0, withdrawalsMinor: 0 }),
    }),
  );
  await page.route('**/api/v1/cash-sessions/operations**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(OPERAZIONI),
    }),
  );
  await page.route('**/api/v1/cash-sessions/sessions**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], page: 1, pageSize: 100, total: 0 }),
    }),
  );
}

test.describe('Cassa — resa nel browser', () => {
  test('⭐ la Vendita tiene ricerca, carrello e incasso visibili insieme', async ({ page }) => {
    await intercetta(page);
    await page.goto('/app/cassa');

    await expect(page.getByRole('heading', { name: 'Cassa', level: 1 })).toBeVisible({
      timeout: 45_000,
    });

    const ricerca = page.locator('.cassa__search');
    const carrello = page.locator('.cassa__cart');
    const incasso = page.locator('.cassa__payment');

    // ⛔ Tutte e tre insieme, senza scorrere: al banco non si naviga fra
    //    schede col cliente davanti.
    await expect(ricerca).toBeInViewport();
    await expect(carrello).toBeInViewport();
    await expect(incasso).toBeInViewport();

    /*
      ⛔ **E non basta che ci stiano: devono stare AFFIANCATE.** Misurato il
      04/09/2026 togliendo la griglia: con una colonna sola le tre zone
      restavano comunque nella finestra — a carrello vuoto ci stanno — e la
      prova passava senza misurare niente. La posizione, invece, la griglia
      la decide: l'incasso comincia DOVE il carrello finisce.
    */
    const scatolaCarrello = await carrello.boundingBox();
    const scatolaIncasso = await incasso.boundingBox();
    expect(scatolaCarrello).not.toBeNull();
    expect(scatolaIncasso).not.toBeNull();
    expect(scatolaIncasso!.x).toBeGreaterThanOrEqual(
      scatolaCarrello!.x + scatolaCarrello!.width,
    );

    // ⭐ E la ricerca sta SOPRA il carrello, nella stessa colonna.
    const scatolaRicerca = await ricerca.boundingBox();
    expect(scatolaRicerca!.x).toBeCloseTo(scatolaCarrello!.x, 0);
    expect(scatolaRicerca!.y).toBeLessThan(scatolaCarrello!.y);
  });

  test('⛔ nessuna schermata promette una fiscalizzazione avvenuta', async ({ page }) => {
    await intercetta(page);

    for (const rotta of ['/app/cassa', '/app/cassa/operazioni', '/app/cassa/sessioni']) {
      await page.goto(rotta);
      await page.waitForLoadState('networkidle');
      const testo = (await page.locator('main').innerText()).toLowerCase();
      expect(testo).not.toContain('scontrino emesso');
      expect(testo).not.toContain('trasmesso');
      expect(testo).not.toContain('agenzia');
    }
  });

  test('⭐ le tre aree si raggiungono l_una dall_altra', async ({ page }) => {
    await intercetta(page);
    await page.goto('/app/cassa');

    await page.getByRole('link', { name: 'Operazioni' }).first().click();
    await expect(page.getByRole('heading', { name: 'Operazioni di cassa' })).toBeVisible();

    await page.getByRole('link', { name: 'Sessioni' }).first().click();
    await expect(page.getByRole('heading', { name: 'Sessioni di cassa' })).toBeVisible();

    await page.getByRole('link', { name: 'Vendita' }).first().click();
    await expect(page.getByRole('heading', { name: 'Cassa', level: 1 })).toBeVisible();
  });

  test('⭐ il richiamo scontrino non chiede nessun identificativo', async ({ page }) => {
    await intercetta(page);
    await page.goto('/app/cassa/operazioni');

    await page.getByRole('button', { name: 'Richiama scontrino' }).click();

    // ⛔ Si cerca per numero, articolo o cliente: mai per un id.
    await expect(page.getByText('Numero, articolo o cliente')).toBeVisible();
  });
});
