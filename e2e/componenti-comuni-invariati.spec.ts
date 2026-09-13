import { expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

import { intercetta, pagina } from './helpers/cash-register-fixtures';
import { test } from './helpers/isolated-test';

/**
 * ⛔ **I COMPONENTI COMUNI, GUARDATI SU SCHERMATE CHE NON SONO STATE TOCCATE.**
 *
 * L'11/09/2026 (`docs/26` §5) due pezzi condivisi sono cambiati:
 *
 * ```text
 * motore tabella   `.data-table { block-size: 100% }` solo CON i totali (`--con-totali`)
 * select-menu      `panelFixed`: pannello `position: fixed`, acceso dal motore sui filtri di colonna
 * ```
 *
 * Le prove di A1–A3 guardano le schermate migrate. Queste guardano **le altre**:
 * un elenco sul telaio con i totali, uno sul telaio senza totali, i menu che
 * la modifica non riguarda, e il pannello filtri del telaio sul telefono —
 * dove i filtri di colonna restano `absolute`.
 */

function fornitore(id: string, code: string, name: string, city: string) {
  return {
    id,
    code,
    name,
    city,
    vatNumber: `IT${code}`,
    email: `${id}@esempio.it`,
    phone: null,
    paymentTerms: null,
    isActive: true,
  };
}

const FORNITORI = [
  fornitore('f-1', '0001', 'Revoll Srls', 'Casalnuovo di Napoli'),
  fornitore('f-2', '0002', 'Fornitore Test 2', 'Napoli'),
  fornitore('f-3', '0003', 'fornitore test 1', 'Napoli'),
];

async function apriFornitori(page: Page): Promise<void> {
  await page.route('**/api/v1/suppliers**', (route: Route) =>
    route.fulfill({
      status: 200,
      json: { items: FORNITORI, page: 1, pageSize: 20, total: FORNITORI.length },
    }),
  );
  await page.goto('/app/suppliers');
  await expect(page.locator('tbody tr.data-table__row')).toHaveCount(3, { timeout: 45_000 });
}

/** Rettangoli e posizionamento di un pannello aperto, visti dal browser. */
async function misuraPannello(page: Page, trigger: string) {
  // ⚠️ Il pannello si rende al prossimo giro di rendering, non dentro il clic:
  //    misurato subito, una volta su due non c'è ancora.
  await expect(page.getByRole('listbox', { name: trigger })).toBeVisible();
  return page.evaluate((nomeTrigger) => {
    const pannello = document.querySelector<HTMLElement>('.select-menu__panel');
    const bottone = Array.from(document.querySelectorAll<HTMLElement>('button')).find(
      (b) => b.getAttribute('aria-label') === nomeTrigger,
    );
    if (!pannello || !bottone) {
      return { errore: `pannello ${String(!!pannello)} · trigger ${String(!!bottone)}` };
    }
    const p = pannello.getBoundingClientRect();
    const t = bottone.getBoundingClientRect();
    const centro = document.elementFromPoint(p.x + p.width / 2, Math.min(p.y + 20, p.bottom - 1));
    return {
      posizione: getComputedStyle(pannello).position,
      sottoIlTrigger: Math.round(p.top) >= Math.round(t.bottom) - 1,
      scartoDalTrigger: Math.round(p.top - t.bottom),
      dentroLaFinestra: p.top >= 0 && p.bottom <= window.innerHeight,
      raggiungibile: pannello.contains(centro),
    };
  }, trigger);
}

test('⭐ elenco sul telaio CON totali: righe a 25px, riga totali in fondo, menu Colonne invariato', async ({
  page,
}) => {
  await apriFornitori(page);

  // La riga di riempimento continua a portare i totali in fondo alla regione.
  const misura = await page.evaluate(() => {
    const riga = document.querySelector('tbody tr.data-table__row')!.getBoundingClientRect();
    const regione = document.querySelector('.data-table-scroll')!.getBoundingClientRect();
    const totali = document.querySelector('tfoot.data-table__totals')!.getBoundingClientRect();
    return {
      altezzaRiga: Math.round(riga.height),
      totaliInFondo: Math.abs(regione.bottom - totali.bottom) <= 2,
      spazioSottoLeRighe: Math.round(regione.bottom - riga.bottom),
    };
  });
  expect(misura.altezzaRiga).toBeLessThanOrEqual(26);
  expect(misura.totaliInFondo).toBe(true);
  expect(misura.spazioSottoLeRighe).toBeGreaterThan(100);

  // «Colonne» apre un select-menu NON toccato dalla modifica: resta `absolute`.
  await page.getByRole('button', { name: /^Colonne/ }).click();
  await page.getByRole('button', { name: 'Vista colonne salvata' }).click();
  const menu = await misuraPannello(page, 'Vista colonne salvata');
  expect(menu?.posizione).toBe('absolute');
  expect(menu?.sottoIlTrigger).toBe(true);
  expect(menu?.raggiungibile).toBe(true);
  await page.keyboard.press('Escape');

  // E il filtro di colonna, dentro il telaio, è FISSO e sta sotto la sua intestazione.
  await page.getByRole('button', { name: /^Filtri/ }).click();
  await page.getByRole('button', { name: 'Filtra per Città' }).click();
  const filtro = await misuraPannello(page, 'Filtra per Città');
  expect(filtro?.posizione).toBe('fixed');
  expect(filtro?.sottoIlTrigger).toBe(true);
  expect(filtro?.scartoDalTrigger).toBeLessThanOrEqual(2);
  expect(filtro?.dentroLaFinestra).toBe(true);
  expect(filtro?.raggiungibile).toBe(true);
  await page.screenshot({ path: 'test-results/componenti-comuni/fornitori-filtro.png' });
});

test('⭐ elenco sul telaio SENZA totali: le righe non si stirano e il Periodo apre come prima', async ({
  page,
}) => {
  await intercetta(page, 3);
  await page.route('**/api/v1/cash-sessions/operations**', (route: Route) =>
    route.fulfill({ status: 200, json: pagina(3) }),
  );
  await page.goto('/app/cassa/operazioni');
  await expect(page.locator('tbody tr.data-table__row')).toHaveCount(3, { timeout: 45_000 });

  // ⛔ È il difetto di §5.1 nella sua sede naturale: tre operazioni in una
  //    regione alta mezzo schermo. Senza totali la tabella NON deve riempirla.
  const misura = await page.evaluate(() => {
    const righe = Array.from(document.querySelectorAll('tbody tr.data-table__row')).map((r) =>
      Math.round(r.getBoundingClientRect().height),
    );
    const regione = document.querySelector('.data-table-scroll')!.getBoundingClientRect();
    return { righe, regione: Math.round(regione.height) };
  });
  expect(Math.max(...misura.righe)).toBeLessThanOrEqual(26);
  expect(misura.regione).toBeGreaterThan(200);

  // ⭐ Il prefisso «Periodo:» non c'è (11/09/2026: «togliere il termine Periodo
  //    all'interno, proprio come in Corrispettivi»): lo spegne il selettore
  //    condiviso, e il pulsante mostra il solo valore. ⚠️ Non con `toContainText`:
  //    il pulsante contiene anche il misuratore nascosto con tutte le voci.
  const trigger = page.getByRole('button', { name: 'Filtra per periodo' });
  await expect(trigger.locator('.select-menu__chip-label')).toBeHidden();
  await expect(trigger).toHaveText(/Oggi/);
  await trigger.click();
  const periodo = await misuraPannello(page, 'Filtra per periodo');
  expect(periodo?.posizione).toBe('absolute');
  expect(periodo?.sottoIlTrigger).toBe(true);
  expect(periodo?.raggiungibile).toBe(true);
  // ⭐ La densità delle voci è quella dei Corrispettivi (30/08: 28px da `md` in
  //    su, non i 34 di un campo autonomo), e da oggi la dà il componente a ogni
  //    Periodo: prima, qui sulla Cassa, le voci erano a 34px.
  const altezzaVoce = await page
    .getByRole('listbox', { name: 'Filtra per periodo' })
    .getByRole('option', { name: 'Oggi' })
    .evaluate((el) => Math.round(el.getBoundingClientRect().height));
  const controlH = await page.evaluate(() =>
    Math.round(
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--control-h-button'),
      ) * parseFloat(getComputedStyle(document.documentElement).fontSize),
    ),
  );
  expect(altezzaVoce, `voce ${altezzaVoce}px, --control-h-button ${controlH}px`).toBe(controlH);
  await page.screenshot({ path: 'test-results/componenti-comuni/cassa-periodo.png' });
});

test('⭐ sul telefono il pannello filtri del telaio è quello di prima: i filtri dentro restano `absolute`', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await apriFornitori(page);

  await page.getByRole('button', { name: 'Filtri', exact: true }).click();
  await page.getByRole('button', { name: 'Filtra per Città' }).click();
  const filtro = await misuraPannello(page, 'Filtra per Città');
  expect(filtro?.posizione).toBe('absolute');
  expect(filtro?.raggiungibile).toBe(true);
  await page.getByRole('option', { name: 'Napoli', exact: true }).click();
  await page.getByRole('button', { name: 'Vedi risultati', exact: true }).click();
  await expect(page.locator('tbody tr.data-table__row')).toHaveCount(2);
  await page.screenshot({ path: 'test-results/componenti-comuni/fornitori-telefono.png' });
});
