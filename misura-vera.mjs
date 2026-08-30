import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

/**
 * MISURA REALE, non derivata dai token: apre il Registro Corrispettivi in un
 * Chromium vero, alle tre larghezze richieste, e legge le altezze e gli stili
 * CALCOLATI dal browser.
 */
const BASE = process.env.BASE ?? 'http://127.0.0.1:4210';
const FUORI = process.argv[2] ?? '.';
mkdirSync(FUORI, { recursive: true });

const VISTE = [
  { nome: '320', width: 320, height: 720 },
  { nome: '390', width: 390, height: 844 },
  { nome: 'desktop', width: 1440, height: 900 },
];

const browser = await chromium.launch();
const context = await browser.newContext({ deviceScaleFactor: 2 });
const page = await context.newPage();

// Login con l'auth mock della build e2e.
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.fill('#login-email', 'owner@vestiflow.test');
await page.fill('#login-password', 'owner123');
await page.click('button[type="submit"]');
await page.waitForURL(/\/app\/dashboard/, { timeout: 30_000 });
console.log('✓ autenticato');

const risultati = [];

for (const vista of VISTE) {
  await page.setViewportSize({ width: vista.width, height: vista.height });
  await page.goto(`${BASE}/app/sales/corrispettivi`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const dati = await page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const box = (el) => (el ? el.getBoundingClientRect() : null);
    const calc = (el, props) => {
      if (!el) return null;
      const c = getComputedStyle(el);
      return Object.fromEntries(props.map((p) => [p, c.getPropertyValue(p)]));
    };

    const stats = q('.corrispettivi-summary__band--stats');
    const money = q('.corrispettivi-summary__band--money');
    const actions = q('app-list-actions-bar');
    const foot = q('.list-page__foot');
    const summary = q('app-corrispettivi-summary');
    const data = q('.list-page__data');

    // Traboccamenti: un elemento trabocca se il contenuto è più largo del box.
    const trabocca = [];
    for (const el of document.querySelectorAll(
      '.corrispettivi-summary__item dt, .corrispettivi-summary__item dd, .corrispettivi-summary__count',
    )) {
      if (el.scrollWidth > el.clientWidth + 1) {
        trabocca.push({
          testo: (el.textContent ?? '').trim().slice(0, 28),
          contenuto: el.scrollWidth,
          cella: el.clientWidth,
        });
      }
    }

    // Va a capo? Altezza > 1,6 righe di testo.
    const aCapo = [];
    for (const el of document.querySelectorAll('.corrispettivi-summary__band--money dd')) {
      const c = getComputedStyle(el);
      const riga = parseFloat(c.lineHeight) || parseFloat(c.fontSize) * 1.2;
      if (el.getBoundingClientRect().height > riga * 1.6) {
        aCapo.push((el.textContent ?? '').trim());
      }
    }

    // Chi scorre davvero.
    const scorrono = [];
    for (const el of document.querySelectorAll('*')) {
      const c = getComputedStyle(el);
      const puo = /(auto|scroll)/.test(c.overflowY);
      if (puo && el.scrollHeight > el.clientHeight + 2) {
        scorrono.push({
          sel:
            el.tagName.toLowerCase() +
            (el.className && typeof el.className === 'string'
              ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
              : ''),
          scroll: el.scrollHeight,
          client: el.clientHeight,
        });
      }
    }

    const primary = q('app-button button.app-button--primary, button.app-button--primary');
    const navAttiva = q('.app-sidebar__link--active, .app-sidebar__item--active, [class*="nav"][class*="active"]');

    return {
      altezze: {
        'band--stats': box(stats)?.height ?? null,
        'band--money': box(money)?.height ?? null,
        'app-list-actions-bar': box(actions)?.height ?? null,
        'riepilogo (app-corrispettivi-summary)': box(summary)?.height ?? null,
        'dock (.list-page__foot)': box(foot)?.height ?? null,
        'zona dati (.list-page__data)': box(data)?.height ?? null,
      },
      calcolati: {
        'band--stats': calc(stats, ['padding-top', 'padding-bottom', 'gap', 'line-height', 'display']),
        'band--money': calc(money, ['padding-top', 'padding-bottom', 'gap', 'line-height', 'display', 'grid-template-columns']),
        'list-actions': calc(actions?.querySelector('.list-actions'), ['padding-top', 'padding-bottom', 'gap', 'line-height']),
        'foot': calc(foot, ['display', 'position', 'gap', 'flex']),
        'data': calc(data, ['overflow-y', 'flex', 'min-height']),
      },
      trabocca,
      aCapo,
      scorrono,
      colori: {
        'app-button--primary (background)': primary ? getComputedStyle(primary).backgroundColor : null,
        'app-button--primary (color)': primary ? getComputedStyle(primary).color : null,
        'voce attiva sidebar (background)': navAttiva ? getComputedStyle(navAttiva).backgroundColor : null,
        'voce attiva sidebar (color)': navAttiva ? getComputedStyle(navAttiva).color : null,
        '--color-primary': getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim(),
        '--color-ok': getComputedStyle(document.documentElement).getPropertyValue('--color-ok').trim(),
        '--color-nav-selected-bg': getComputedStyle(document.documentElement).getPropertyValue('--color-nav-selected-bg').trim(),
      },
      // Dov'e' il pulsante «Nuovo»?
      nuovo: Array.from(document.querySelectorAll('button')).
        filter((b) => /nuovo/i.test(b.textContent ?? '')).
        map((b) => {
          const dentroFoot = !!b.closest('.list-page__foot');
          const dentroHeader = !!b.closest('.list-page__header');
          return { testo: (b.textContent ?? '').trim().slice(0, 20), dentroFoot, dentroHeader };
        }),
    };
  });

  await page.screenshot({ path: `${FUORI}/corrispettivi-${vista.nome}.png`, fullPage: false });
  risultati.push({ vista: vista.nome, larghezza: vista.width, ...dati });
  console.log(`✓ ${vista.nome} (${vista.width}px) — schermata salvata`);
}

await browser.close();
console.log('\n' + JSON.stringify(risultati, null, 2));
