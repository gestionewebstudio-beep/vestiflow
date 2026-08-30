#!/usr/bin/env node
/**
 * ⛔ **Le classi orfane non falliscono: non fanno niente** — e in una direzione
 * rompono la grafica in silenzio.
 *
 * Misurato il 30/08/2026, portando il Registro Corrispettivi sul motore comune:
 * potando lo scheletro sono state tolte anche le regole che davano alla card
 * l'accento laterale e la cornice. Build verde, lint verde, 2.986 test verdi —
 * e la card a schermo senza accento. **L'ha vista il proprietario.**
 *
 * Le due direzioni sono difetti diversi, e solo una fa fallire:
 *
 * ```text
 * classe nel MARKUP senza regola   ⛔ la grafica si rompe, e non lo dice nessuno
 * regola nel FOGLIO senza markup   ⏸ codice morto: pesa, confonde, non nuoce
 * ```
 *
 * ⚠️ **Il confine è il COMPONENTE, non l'applicazione**: una classe può essere
 * vestita dal foglio di un altro componente — tutto ciò che il motore tabella
 * disegna — quindi si cerca anche nei fogli globali e in quelli dichiarati qui
 * sotto.
 *
 * ⚠️ **L'annidamento SCSS si espande**: `&--refund` dentro `.card` è `.card--refund`,
 * e una guardia che non lo sapesse griderebbe al lupo su mezza applicazione —
 * cioè verrebbe spenta.
 */
import { readFileSync, globSync } from 'node:fs';

/** I fogli che vestono chiunque. */
const GLOBALI = [...globSync('src/styles/*.scss'), ...globSync('src/styles.scss')];

/**
 * I componenti che vestono il markup altrui, verificati. Chi ne aggiunge uno lo
 * dichiara qui: meglio una riga in più che una guardia che indovina.
 */
const VESTONO_ALTRUI = [
  'src/app/shared/components/data-table/data-table.component.scss',
  'src/app/shared/components/list-page/list-page.component.scss',
];

function leggi(f) {
  try {
    return readFileSync(f, 'utf8');
  } catch {
    return '';
  }
}

const fogliCondivisi = [...GLOBALI, ...VESTONO_ALTRUI].map(leggi).join('\n');

/**
 * ⚠️ **I mixin vestono per SUFFISSO, non per nome.** `_responsive-table.scss`
 * scrive `.#{$block}__cell--select`: il nome del blocco è una variabile, quindi
 * cercare `.data-table__cell--select` nel foglio condiviso non trova niente — e
 * la guardia griderebbe al lupo su ogni tabella dell'applicazione.
 *
 * Si raccolgono quindi i suffissi (tutto ciò che segue l'interpolazione), e una
 * classe si considera vestita se il suo suffisso è fra questi.
 */
const suffissiDaMixin = new Set();
for (const m of fogliCondivisi.matchAll(/#\{\$\w+\}((?:__|--)[\w-]+)/g)) {
  suffissiDaMixin.add(m[1]);
}

/** Il suffisso di una classe BEM: da `blocco__elemento--mod` a `__elemento--mod`. */
function suffisso(classe) {
  const i = classe.search(/__|--/);
  return i < 0 ? '' : classe.slice(i);
}

/**
 * Le classi che un foglio SCSS dichiara, con l'annidamento espanso.
 *
 * Tiene una pila dei selettori aperti: `&--x` e `&__x` si concatenano al
 * selettore che li contiene, come fa il compilatore.
 */
function classiDelFoglio(scss) {
  const trovate = new Set();
  const pila = [];

  for (const rigaGrezza of scss.split(/\r?\n/)) {
    const riga = rigaGrezza.trim();
    if (riga.startsWith('//') || riga.startsWith('/*') || riga.startsWith('*')) continue;

    if (riga.includes('{')) {
      const testa = riga.slice(0, riga.indexOf('{')).trim();
      const corrente = pila.at(-1) ?? '';
      const espansi = [];
      for (const parte of testa.split(',')) {
        const p = parte.trim();
        if (!p) continue;
        const risolto = p.startsWith('&') ? corrente + p.slice(1) : p;
        espansi.push(risolto);
        for (const m of risolto.matchAll(/\.([a-z][\w-]*)/g)) trovate.add(m[1]);
      }
      // Per l'annidamento conta il primo selettore, che è la convenzione BEM.
      pila.push(espansi[0] ?? corrente);
    }

    for (let k = 0; k < (riga.match(/\}/g) ?? []).length; k += 1) pila.pop();
  }

  return trovate;
}

const coppie = globSync('src/app/**/*.component.html')
  .map((html) => ({ html, scss: html.replace(/\.html$/, '.scss') }))
  .filter(({ scss }) => leggi(scss) !== '');

/**
 * ⏸ **LA FOTOGRAFIA DI OGGI — 30/08/2026.**
 *
 * Queste classi sono nel markup e non le veste nessuno. Sono **preesistenti**:
 * la guardia è nata dopo di loro, e ripararle tutte è un lavoro a sé.
 *
 * ⭐ **La guardia serve lo stesso, e da subito**: fallisce sulla 177ª. Chi
 * scrive una classe nuova senza vestirla lo scopre al lint, non a schermo.
 *
 * ⚠️ **Quando ne ripari una, TOGLILA da qui.** Un elenco che non si accorcia mai
 * è un elenco che nessuno guarda — e questa guardia esiste perché una potatura
 * del 30/08/2026 ha tolto l'accento laterale alle card del Registro senza che
 * build, lint e 2.986 test dicessero niente.
 */
const NOTE = new Set([
  'admin-users__hint',
  'analytics-panel--reports',
  'app-sidebar__logout-item',
  'category-attributes__hint',
  'chrono-warning__why',
  'co-form__cards',
  'co-form__dirty-dot',
  'co-form__header-menu',
  'co-form__header-menu-btn',
  'co-form__header-menu-group',
  'co-form__header-menu-item',
  'co-form__header-menu-list',
  'co-form__header-section--main',
  'co-form__row--reference',
  'co-lines__action--empty',
  'co-lines__action--product',
  'company-page',
  'corrispettivi-export__field--date',
  'corrispettivi-print__orders',
  'corrispettivi-table__payment',
  'count-detail',
  'count-detail__col--numeric',
  'count-detail__meta',
  'count-detail__notes',
  'count-detail__table',
  'count-table',
  'count-table__col--numeric',
  'count-table__scroll',
  'create-client__actions--page-footer',
  'create-client__alert',
  'create-client__field--channel-profile',
  'create-client__field--select-wide',
  'create-client__field--span-full',
  'create-client__field-error',
  'create-client__field-label',
  'create-client__form',
  'create-client__hint',
  'create-client__muted',
  'create-client__page-footer-alert',
  'create-client__section',
  'create-client__section-title',
  'create-client__table-actions',
  'customer-detail',
  'customer-fields',
  'customer-form__body',
  'customer-table',
  'detail-facts__item',
  'detail-facts__text',
  'doc-detail',
  'doc-detail__revision-date',
  'doc-detail__revision-item',
  'doc-detail__revision-list',
  'doc-detail__revision-meta',
  'doc-detail__revision-number',
  'doc-detail__revision-summary',
  'doc-detail__revision-who',
  'doc-form__th--menu',
  'doc-include__kind-list',
  'doc-lines',
  'doc-lines__cell--discount',
  'doc-lines__cell--price',
  'doc-lines__cell--qty',
  'doc-lines__cell--stock',
  'doc-lines__cell--vat',
  'doc-list',
  'doc-list__field--date',
  'doc-number__field--series',
  'doc-product-cell--linked',
  'doc-suggestions__item--active',
  'doc-suggestions__tail--active',
  'edit-client',
  'edit-client__actions--page-footer',
  'edit-client__field--channel-profile',
  'edit-client__field--span-full',
  'edit-client__field-error',
  'edit-client__field-label',
  'edit-client__field-row',
  'edit-client__form',
  'edit-client__hint',
  'edit-client__input--readonly',
  'edit-client__page-footer-alert',
  'edit-client__section',
  'edit-client__section--user-access',
  'edit-client__section-title',
  'general-step',
  'general-step__checkbox',
  'general-step__field--checkbox',
  'inventory-count-list',
  'inventory-import__col--numeric',
  'inventory-import__table',
  'inventory-levels',
  'inventory-levels__reservation-order',
  'inventory-situation',
  'inventory-situation__field--search',
  'inventory-situation__field--select',
  'inventory-situation__search-input',
  'level-table',
  'level-table__cell--pinned',
  'list-filters__range',
  'list-filters__trigger',
  'location-licensing__counter',
  'location-licensing__empty',
  'location-licensing__hint',
  'location-table',
  'low-stock__col',
  'mr-form__table',
  'os-detail',
  'pagination__page-btn',
  'pagination__range',
  'pagination__status-sep',
  'payment-options',
  'payment-options__add-input',
  'permissions-editor--compact',
  'permissions-editor__item',
  'picker__back',
  'picker__row--variant',
  'po-detail',
  'po-detail__linked-item',
  'po-lines',
  'po-list',
  'product-detail',
  'product-form--embedded',
  'product-form__step',
  'product-import__code-note',
  'product-import__col--numeric',
  'product-import__table',
  'product-label__sku-value',
  'product-list',
  'product-table__brand',
  'product-table__category',
  'product-table__cell--source',
  'product-table__code',
  'product-table__select-all',
  'product-table__source-value',
  'recent-sales__col',
  'report-table',
  'review-step-table',
  'sales-list',
  'sales-list__field--date',
  'settings-users',
  'settings__shopify-locations-empty',
  'shopify-integration__bulk-sync-hint',
  'shopify-integration__bulk-sync-title',
  'shopify-integration__field--connect',
  'shopify-integration__post-connect-title',
  'shopify-integration__shopify-management-hint',
  'shopify-integration__shopify-management-title',
  'situation-table',
  'situation-table__cell--pinned',
  'stock-lookup__reservation-order',
  'stock-lookup__result-header',
  'stock-movements',
  'stock-movements__field--date',
  'stock-movements__field--search',
  'stock-movements__field--select',
  'stock-movements__search-input',
  'supplier-detail',
  'supplier-fields',
  'supplier-form__body',
  'supplier-table',
  'supplier-table__cell--pinned',
  'table-column-picker__icon-btn--active',
  'taxonomy-picker__empty',
  'tenant-client-card__details-note',
  'tenant-client-table',
  'tenant-ops__inline',
  'tenant-ops__listino-label',
  'tenant-ops__value',
  'uom-manager__icon-btn--default',
  'variant-table',
  'variants-step-table',
  'variants-step__barcode',
  'variants-step__field--readonly',
  'variants-step__input--barcode',
  'variants-step__input--sku',
  'vat-codes__group-title',
]);

const rotte = [];
const morte = [];

for (const { html, scss } of coppie) {
  const markup = leggi(html);
  const foglio = leggi(scss);

  const nelFoglio = classiDelFoglio(foglio);
  if (nelFoglio.size === 0) continue;

  // I blocchi BEM di questo componente: solo le sue classi si giudicano.
  const blocchi = new Set([...nelFoglio].map((c) => c.split(/__|--/)[0]));
  const nostra = (c) => blocchi.has(c.split(/__|--/)[0]);

  const nelMarkup = new Set();
  for (const m of markup.matchAll(/class="([^"]*)"/g)) {
    for (const c of m[1].split(/\s+/)) if (c && nostra(c)) nelMarkup.add(c);
  }
  for (const m of markup.matchAll(/\[class\.([\w-]+)\]/g)) if (nostra(m[1])) nelMarkup.add(m[1]);

  // Le classi composte a runtime: `'blocco--' + funzione(x)`.
  const dinamiche = [...markup.matchAll(/'([\w-]*(?:__|--))'\s*\+/g)].map((m) => m[1]);

  for (const c of nelMarkup) {
    if (nelFoglio.has(c)) continue;
    if (fogliCondivisi.includes(`.${c}`)) continue;
    if (suffissiDaMixin.has(suffisso(c))) continue;
    // Le interpolazioni Angular nel markup (`toast--{{ tono }}`) non sono classi.
    if (c.includes('{')) continue;
    if (NOTE.has(c)) continue;
    rotte.push(`${html}\n     «${c}» è nel markup e non la veste nessuno.`);
  }

  for (const c of nelFoglio) {
    if (nelMarkup.has(c)) continue;
    if (dinamiche.some((p) => c.startsWith(p))) continue;
    if (markup.includes(c)) continue;
    morte.push(`${scss} — «${c}»`);
  }
}

if (morte.length > 0) {
  console.log(`⏸ ${morte.length} regole senza markup (codice morto, non bloccante)`);
}

if (rotte.length > 0) {
  console.error(`⛔ ${rotte.length} classe/i nel markup senza regola — la grafica si rompe:\n`);
  for (const r of rotte) console.error(`   ${r}`);
  process.exit(1);
}

console.log(
  `check:classi-orfane — ${coppie.length} componenti, nessuna classe nel markup resta senza veste.`,
);
