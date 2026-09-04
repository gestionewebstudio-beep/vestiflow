import { expect, type Page } from '@playwright/test';

/** Attende la lista documenti (titolo visibile; tabella opzionale se API assente). */
export async function waitForDocumentsListReady(page: Page): Promise<void> {
  // ⛔ **`registro` nel motivo, non solo `documents`.** `/app/documents` e'
  //    ora una pagina-INDICE che fa scegliere il tipo di documento, e la
  //    vecchia espressione combaciava con entrambe: il test passava questa
  //    riga stando sulla pagina sbagliata, e falliva dopo sul titolo.
  await expect(page).toHaveURL(/\/app\/documents\/registro/, { timeout: 30_000 });
  // Due derive in una sola riga, entrambe verificate su `src/`:
  //  - la classe: il titolo lo rende ora il telaio `app-list-page`, e
  //    `doc-list__title` non esiste piu';
  //  - il testo: `pageTitle()` per il profilo generico vale «Registro
  //    documenti» — `salesDocumentRegisterConfig` ritorna `null` per
  //    `generic`, e questa non e' la lista arrivi merce. «Documenti» non e'
  //    mai stato uno dei valori possibili.
  await expect(page.locator('h1.list-page__title')).toHaveText('Registro documenti', {
    timeout: 45_000,
  });
}

/** Verifica vista filtrata DDT da fatturare (query URL + banner + checkbox). */
export async function expectPendingInvoiceDocumentsView(page: Page): Promise<void> {
  const url = new URL(page.url());

  expect(url.searchParams.get('pendingInvoice')).toBe('1');
  expect(url.searchParams.get('type')).toBe('sales_ddt');
  expect(url.searchParams.get('dateFrom')).toBeTruthy();
  expect(url.searchParams.get('dateTo')).toBeTruthy();

  await expect(
    page.getByRole('status').filter({ hasText: 'DDT vendita confermati senza fattura collegata' }),
  ).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'DDT da fatturare' })).toBeChecked();
}

/** URL lista documenti con filtro DDT da fatturare. */
export function buildPendingInvoiceDocumentsPath(dateFrom: string, dateTo: string): string {
  const params = new URLSearchParams({
    dateFrom,
    dateTo,
    type: 'sales_ddt',
    pendingInvoice: '1',
  });
  // ⛔ Il registro vive sotto `/registro` da quando `/app/documents` e'
  //    diventata la pagina-indice (documents.routes.ts: `path: ''` ->
  //    `documents-hub`, `path: 'registro'` -> `document-list`). Con il
  //    percorso vecchio i filtri finivano sull'indice, che li ignora.
  return `/app/documents/registro?${params.toString()}`;
}
