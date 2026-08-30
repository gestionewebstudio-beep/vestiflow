import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

/**
 * MISURA REALE del Registro Corrispettivi in un Chromium vero.
 *
 * Le chiamate API sono intercettate con i numeri dello screenshot del
 * proprietario — 12 righe, 8 vendite, 2 annullamenti, 4 rettifiche — così i
 * valori a schermo sono quelli di cui si discute, e le larghezze misurate sono
 * quelle vere.
 */
const BASE = process.env.BASE ?? 'http://localhost:4210';
const FUORI = process.argv[2] ?? '.';
mkdirSync(FUORI, { recursive: true });

const riga = (i, kind, num, source, loc, taxable, tax, total, refundKind) => ({
  rowId: `r-${i}`,
  kind,
  salesOrderId: kind === 'sale' ? `so-${i}` : null,
  manualReceiptId: source === 'manual_receipt' ? `mr-${i}` : null,
  orderNumber: num,
  occurredAt: i < 3 ? '2026-08-17' : '2026-08-14',
  source,
  customerName: '',
  locationName: loc,
  currency: 'EUR',
  taxableMinor: taxable,
  taxMinor: tax,
  totalMinor: total,
  financialStatus: kind === 'sale' ? 'paid' : null,
  refundKind: refundKind ?? null,
});

const RIGHE = [
  riga(0, 'sale', '3', 'manual_receipt', 'Magazzino test 3', 2049, 451, 2500),
  riga(1, 'sale', '2', 'manual_receipt', 'Magazzino test 3', 29344, 6456, 35800),
  riga(2, 'sale', '1', 'manual_receipt', 'Magazzino test 3', 2049, 451, 2500),
  riga(3, 'sale', '#1009', 'shopify_online', null, 9950, 1151, 11101),
  riga(4, 'refund', '#1008', 'shopify_online', null, -500, 0, -500, 'refund_only'),
  riga(5, 'refund', '#1008', 'shopify_online', null, -7324, -677, -8001, 'return_with_restock'),
  riga(6, 'sale', '#1008', 'shopify_online', null, 11423, 1578, 13001),
  riga(7, 'refund', '#1006', 'shopify_online', null, -5769, -231, -6000, 'return_with_restock'),
  riga(8, 'sale', '#1006', 'shopify_online', null, 5769, 231, 6000),
  riga(9, 'refund', '#1005', 'shopify_online', null, -5769, -231, -6000, 'return_with_restock'),
  riga(10, 'sale', '#1005', 'shopify_online', null, 5769, 231, 6000),
  riga(11, 'sale', '#1004', 'shopify_online', null, 4808, 192, 5000),
];

const RIEPILOGO = {
  orderCount: 8,
  undatedFulfilmentCount: 0,
  refundsCount: 4,
  subtotalMinor: 51799,
  taxMinor: 9602,
  shippingMinor: 0,
  discountMinor: 0,
  totalMinor: 81902,
  taxableMinor: 51799,
  refundCount: 4,
  refundTotalMinor: 20501,
  refundTaxMinor: 3699,
  cancellationCount: 2,
  cancellationTotalMinor: 0,
  netTotalMinor: 61401,
  netTaxMinor: 9602,
  netTaxableMinor: 51799,
  locationUndeterminedExcludedCount: 0,
  perGiornata: [],
};

const VISTE = [
  { nome: '320', width: 320, height: 720 },
  { nome: '390', width: 390, height: 844 },
  { nome: 'desktop', width: 1440, height: 900 },
];

const browser = await chromium.launch();
const context = await browser.newContext({ deviceScaleFactor: 2 });

await context.route('**/corrispettivi/orders*', (r) =>
  r.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ items: RIGHE, total: RIGHE.length, page: 1, pageSize: 200 }),
  }),
);
await context.route('**/corrispettivi/summary*', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RIEPILOGO) }),
);
await context.route('**/corrispettivi/locations*', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
);

const page = await context.newPage();
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
  await page.waitForTimeout(1500);

  const dati = await page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const h = (el) => (el ? +el.getBoundingClientRect().height.toFixed(1) : null);
    const calc = (el, props) => {
      if (!el) return null;
      const c = getComputedStyle(el);
      return Object.fromEntries(props.map((p) => [p, c.getPropertyValue(p)]));
    };

    const stats = q('.corrispettivi-summary__band--stats');
    const money = q('.corrispettivi-summary__band--money');
    const actionsHost = q('app-list-actions-bar');
    const actions = q('.list-actions');
    const foot = q('.list-page__foot');
    const summary = q('app-corrispettivi-summary');
    const data = q('.list-page__data');

    const trabocca = [];
    for (const el of document.querySelectorAll(
      '.corrispettivi-summary__item dt, .corrispettivi-summary__item dd, .corrispettivi-summary__count',
    )) {
      if (el.scrollWidth > el.clientWidth + 1) {
        trabocca.push({
          testo: (el.textContent ?? '').trim().slice(0, 30),
          contenuto: el.scrollWidth,
          cella: el.clientWidth,
        });
      }
    }

    const aCapo = [];
    for (const el of document.querySelectorAll('.corrispettivi-summary__item dd')) {
      const c = getComputedStyle(el);
      const riga = parseFloat(c.lineHeight) || parseFloat(c.fontSize) * 1.2;
      if (el.getBoundingClientRect().height > riga * 1.6) aCapo.push((el.textContent ?? '').trim());
    }

    const scorrono = [];
    for (const el of document.querySelectorAll('*')) {
      const c = getComputedStyle(el);
      if (/(auto|scroll)/.test(c.overflowY) && el.scrollHeight > el.clientHeight + 2) {
        scorrono.push({
          sel:
            el.tagName.toLowerCase() +
            (typeof el.className === 'string' && el.className.trim()
              ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
              : ''),
          scroll: el.scrollHeight,
          client: el.clientHeight,
        });
      }
    }

    // L'ultima card e' raggiungibile?
    const righe = document.querySelectorAll('.data-table__row');
    const ultima = righe[righe.length - 1];
    const scrollport = q('.data-table-scroll') ?? q('.corrispettivi__panel-scroll') ?? data;
    let ultimaRaggiungibile = null;
    if (ultima && scrollport) {
      scrollport.scrollTop = scrollport.scrollHeight;
      const r = ultima.getBoundingClientRect();
      const f = foot?.getBoundingClientRect();
      ultimaRaggiungibile = f ? +(f.top - r.bottom).toFixed(1) : null;
    }

    const primary = q('button.app-button--primary');
    const navAttiva = q('[class*="nav"][class*="--active"], .app-sidebar__link--active');

    const nuovo = Array.from(document.querySelectorAll('button'))
      .filter((b) => /nuovo/i.test(b.textContent ?? ''))
      .map((b) => ({
        testo: (b.textContent ?? '').trim().slice(0, 24),
        nelPiede: !!b.closest('.list-page__foot'),
        nellaTestata: !!b.closest('.list-page__header'),
      }));

    return {
      altezze: {
        'band--stats': h(stats),
        'band--money': h(money),
        'app-list-actions-bar': h(actionsHost),
        'riepilogo completo': h(summary),
        'dock (.list-page__foot)': h(foot),
        'zona dati': h(data),
      },
      calcolati: {
        'band--stats': calc(stats, ['padding-top', 'padding-bottom', 'gap', 'line-height', 'display']),
        'band--money': calc(money, ['padding-top', 'padding-bottom', 'gap', 'line-height', 'display', 'grid-template-columns']),
        'list-actions': calc(actions, ['padding-top', 'padding-bottom', 'gap', 'line-height']),
        foot: calc(foot, ['display', 'position', 'gap', 'flex']),
        data: calc(data, ['overflow-y', 'flex', 'min-height']),
      },
      trabocca,
      aCapo,
      scorrono,
      ultimaRaggiungibile,
      colori: {
        'app-button--primary bg': primary ? getComputedStyle(primary).backgroundColor : null,
        'app-button--primary fg': primary ? getComputedStyle(primary).color : null,
        'voce attiva sidebar bg': navAttiva ? getComputedStyle(navAttiva).backgroundColor : null,
        '--color-primary': getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim(),
        '--color-ok': getComputedStyle(document.documentElement).getPropertyValue('--color-ok').trim(),
        '--color-nav-selected-bg': getComputedStyle(document.documentElement).getPropertyValue('--color-nav-selected-bg').trim(),
      },
      nuovo,
    };
  });

  await page.screenshot({ path: `${FUORI}/corrispettivi-${vista.nome}.png` });
  risultati.push({ vista: vista.nome, larghezza: vista.width, ...dati });
  console.log(`✓ ${vista.nome} (${vista.width}px)`);
}

await browser.close();
writeFileSync(`${FUORI}/misure.json`, JSON.stringify(risultati, null, 2), 'utf8');
console.log(`\nmisure in ${FUORI}/misure.json`);
