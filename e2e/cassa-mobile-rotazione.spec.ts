import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

import { intercetta } from './helpers/cash-register-fixtures';
import { test } from './helpers/isolated-test';

/**
 * Il caso mobile riprodotto come GESTO dell'utente (11/09/2026), senza
 * scorrimenti forzati dalla prova: si scorre col dito (eventi di scroll veri,
 * uno per gesto), si ruota il telefono, si scorre di nuovo.
 *
 * ⛔ La prova «filtro in fondo» di `cassa-mobile.spec.ts` era rossa in due
 * passate complete su quattro: scriveva `scrollTop = scrollHeight` subito dopo
 * il cambio di larghezza, prima che la finestra avesse rimisurato le card —
 * e nessun gesto successivo la riportava in fondo. Qui la domanda è un'altra,
 * e riguarda il MOTORE: **dopo la rotazione, l'ultima riga si raggiunge
 * ancora scorrendo?** E chi era in fondo, ruotando, resta vicino al fondo?
 */

test.use({ viewport: { width: 600, height: 960 }, isMobile: true, hasTouch: true });

const ULTIMA = '.data-table__row[data-row-id="d-299"]';

/** Scorre col dito finché la riga cercata non è in vista, o si arrende dopo N gesti. */
async function scorriFinoA(page: Page, selettore: string, gesti = 120): Promise<number> {
  const scroller = page.locator('.data-table-scroll');
  const scatola = (await scroller.boundingBox())!;
  const centro = { x: scatola.x + scatola.width / 2, y: scatola.y + scatola.height / 2 };
  for (let i = 0; i < gesti; i += 1) {
    if (await page.locator(selettore).isVisible()) {
      const inVista = await page.locator(selettore).evaluate(
        (el, box) => {
          const r = el.getBoundingClientRect();
          return r.top >= box.y && r.bottom <= box.y + box.h;
        },
        { y: scatola.y, h: scatola.height },
      );
      if (inVista) {
        return i;
      }
    }
    await page.mouse.move(centro.x, centro.y);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(40);
  }
  return -1;
}

test('⭐ col dito si arriva in fondo prima e dopo la rotazione, e chi era in fondo ci resta', async ({
  page,
}, info) => {
  await intercetta(page, 300);
  await page.goto('/app/cassa/operazioni');
  await expect(page.getByText('300 operazioni')).toBeVisible();
  await expect(page.locator('.data-table__card').first()).toBeVisible();

  // 1. In fondo col dito, in verticale.
  const gesti1 = await scorriFinoA(page, ULTIMA);
  expect(gesti1, 'in verticale l’ultima card si raggiunge scorrendo').toBeGreaterThanOrEqual(0);
  await page.screenshot({ path: info.outputPath('01-verticale-in-fondo.png') });

  // 2. Rotazione a orizzontale: chi era in fondo deve restare in fondo, o vicino.
  //    Qui la rotazione è quella di un telefono grande, dove l’elenco ha spazio
  //    senza far scorrere la pagina; il telefono da 390 è la prova qui sotto.
  await page.setViewportSize({ width: 960, height: 600 });
  await page.waitForTimeout(300);
  const dopoRotazione = await page.evaluate(() => {
    const s = document.querySelector<HTMLElement>('.data-table-scroll')!;
    const ultima = document.querySelector('.data-table__row[data-row-id="d-299"]');
    const rese = Array.from(
      document.querySelectorAll<HTMLElement>('.data-table__row[data-row-id]'),
    );
    return {
      scrollTop: s.scrollTop,
      scrollHeight: s.scrollHeight,
      clientHeight: s.clientHeight,
      ultimaResa: rese.at(-1)?.dataset['rowId'] ?? null,
      ultimaPresente: ultima !== null,
    };
  });
  await page.screenshot({ path: info.outputPath('02-orizzontale-dopo-rotazione.png') });
  info.annotations.push({ type: 'misura', description: JSON.stringify(dopoRotazione) });
  console.log('DOPO ROTAZIONE', JSON.stringify(dopoRotazione));

  // 3. Dopo la rotazione si scorre ancora col dito: l'ultima card si raggiunge?
  const gesti2 = await scorriFinoA(page, ULTIMA);
  await page.screenshot({ path: info.outputPath('03-orizzontale-in-fondo.png') });
  expect(gesti2, 'dopo la rotazione l’ultima card si raggiunge scorrendo').toBeGreaterThanOrEqual(
    0,
  );

  // 4. Di nuovo verticale, e di nuovo in fondo col dito.
  await page.setViewportSize({ width: 600, height: 960 });
  await page.waitForTimeout(300);
  const gesti3 = await scorriFinoA(page, ULTIMA);
  await page.screenshot({ path: info.outputPath('04-verticale-di-nuovo-in-fondo.png') });
  expect(
    gesti3,
    'tornati in verticale l’ultima card si raggiunge scorrendo',
  ).toBeGreaterThanOrEqual(0);

  // Chi era in fondo, ruotando, resta vicino al fondo: la riga resa più in
  // basso subito dopo la rotazione non deve essere lontana dalla coda.
  const indiceUltimaResa = Number(dopoRotazione.ultimaResa?.replace('d-', '') ?? -1);
  expect(
    indiceUltimaResa,
    `dopo la rotazione l’ultima riga resa era ${dopoRotazione.ultimaResa}`,
  ).toBeGreaterThanOrEqual(280);
});

/**
 * ⛔ **Il telefono da 390px in orizzontale lasciava all’elenco ZERO pixel**
 * (misurato l’11/09/2026: testata 25, schede 34, barra 68, piede 139 e i passi
 * fra le zone riempivano i 330px sotto la topbar). Chiuso lo stesso giorno: la
 * zona dati ha un’altezza minima (`--list-data-min-h`) e sotto quella è la
 * pagina a scorrere. Qui si verifica col dito che, ruotato il telefono:
 * l’elenco ha almeno quell’altezza, scorrendo la pagina sulla testata si
 * arriva al piede coi totali, e scorrendo le card si arriva all’ultima.
 */
test('⭐ telefono da 390 in orizzontale: l’elenco ha spazio, il piede si raggiunge, l’ultima card pure', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await intercetta(page, 300);
  await page.goto('/app/cassa/operazioni');
  await expect(page.getByText('300 operazioni')).toBeVisible();
  await expect(page.locator('.data-table__card').first()).toBeVisible();

  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: info.outputPath('05-390-orizzontale.png') });

  const minimo = await page.evaluate(
    () =>
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--list-data-min-h')) *
      parseFloat(getComputedStyle(document.documentElement).fontSize),
  );
  const scroller = page.locator('.data-table-scroll');
  const altezzaElenco = await scroller.evaluate((el) => el.clientHeight);
  info.annotations.push({
    type: 'misura',
    description: `zona dati minima ${minimo}px, scroller ${altezzaElenco}px`,
  });
  // ⚠️ Il contenitore di scorrimento è la zona dati meno la cornice del motore:
  //    si chiede il minimo meno una manciata di pixel, non l’uguaglianza.
  expect(
    altezzaElenco,
    'in orizzontale l’elenco ha almeno l’altezza minima',
  ).toBeGreaterThanOrEqual(minimo - 8);

  // Scorrendo la PAGINA fuori dalle card si arriva al piede coi totali.
  // ⚠️ Il dito si posa ogni volta dove NON ci sono le card: la pagina scorre
  //    sotto il punto toccato e, posato sempre nello stesso posto, il secondo
  //    gesto finirebbe sull’elenco. È quello che fa una persona: prende la
  //    fascia dei totali o la barra, non le righe.
  const piede = page.locator('.list-page__foot');
  const piedeInVista = () =>
    piede.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.bottom <= window.innerHeight + 1 && r.height > 0;
    });
  for (let gesto = 0; gesto < 10 && !(await piedeInVista()); gesto += 1) {
    const presa = await page.evaluate(() => {
      for (const sel of [
        '.list-page__foot',
        '.list-page__tools',
        'app-nav-tabs',
        '.list-page__header',
      ]) {
        const r = document.querySelector(sel)?.getBoundingClientRect();
        if (!r) continue;
        const alto = Math.max(r.top, 0);
        const basso = Math.min(r.bottom, window.innerHeight);
        if (basso - alto >= 24) return { x: r.left + r.width / 2, y: (alto + basso) / 2 };
      }
      return null;
    });
    expect(presa, 'c’è sempre una fascia fuori dalle card su cui posare il dito').not.toBeNull();
    await page.mouse.move(presa!.x, presa!.y);
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(40);
  }
  await expect(piede).toBeInViewport({ ratio: 0.98 });
  await expect(page.getByRole('region', { name: 'Riepilogo del periodo' })).toBeInViewport();
  await page.screenshot({ path: info.outputPath('06-390-orizzontale-piede.png') });

  // E scorrendo le CARD si arriva all’ultima, con la pagina ferma dov’è.
  const gesti = await scorriFinoA(page, ULTIMA);
  await page.screenshot({ path: info.outputPath('07-390-orizzontale-in-fondo.png') });
  expect(gesti, 'in orizzontale l’ultima card si raggiunge scorrendo').toBeGreaterThanOrEqual(0);
  await expect(piede).toBeInViewport({ ratio: 0.98 });
});
