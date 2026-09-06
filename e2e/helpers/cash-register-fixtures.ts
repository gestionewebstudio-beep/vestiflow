import type { Page } from '@playwright/test';

const SEDE = { id: 'loc-1', name: 'Negozio di prova' };

export function pagina(quante: number) {
  const items = Array.from({ length: quante }, (_, i) => ({
    id: `d-${i}`,
    kind: i % 7 === 0 ? 'return' : 'sale',
    reference: `CS/2026/${i + 1}`,
    number: i + 1,
    documentDate: '2026-09-04T00:00:00.000Z',
    createdAt: new Date(Date.UTC(2026, 8, 4, 8, 0, 0) + i * 60_000).toISOString(),
    status: i % 23 === 0 ? 'cancelled' : 'confirmed',
    locationId: SEDE.id,
    locationName: SEDE.name,
    operatorId: 'u-1',
    operatorName: i % 5 === 0 ? 'Anna Maria Giuseppina Della Valle' : 'Bruno',
    sessionId: 'sess-1',
    customerName: null,
    // Decrescente: un ordinamento crescente deve portare in cima l'ULTIMA.
    totalMinor: 1000 + (quante - i),
    payments: [
      {
        paymentOptionId: 'pay-1',
        optionName: i % 3 === 0 ? 'Carta' : 'Contanti',
        tenderKind: i % 3 === 0 ? 'electronic' : 'cash',
        amountMinor: 1000 + (quante - i),
        tenderedMinor: 1000 + (quante - i),
        refundedFromPaymentId: null,
      },
    ],
    mixed: false,
    changeMinor: 0,
    sourceDocumentId: null,
    sourceReference: null,
    anomalies: i % 23 === 0 ? ['annullato'] : [],
  }));
  return {
    items,
    total: quante,
    page: 1,
    pageSize: quante,
    summary: {
      grossSalesMinor: 1_000_000,
      returnsMinor: 10_000,
      netSalesMinor: 990_000,
      cashMinor: 600_000,
      electronicMinor: 390_000,
      saleCount: quante,
      returnCount: 0,
      operationCount: quante,
      averageMinor: 1_500,
    },
  };
}

export async function intercetta(page: Page, quante: number): Promise<void> {
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
        {
          id: 'pay-1',
          name: 'Contanti',
          kind: 'method',
          isActive: true,
          sortOrder: 1,
          tenderKind: 'cash',
        },
      ]),
    }),
  );
  await page.route('**/api/v1/cash-sessions/operations**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(pagina(quante)),
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
