#!/usr/bin/env node
/**
 * ⛔ **Una regola dentro `media-down` che una regola BASE successiva scavalca.**
 *
 * Misurato tre volte il 30/08/2026, sullo stesso foglio e con tre sintomi
 * diversi: il Corrispettivo non diventava verde, non diventava più grande, e il
 * filo dell'ultima cella non spariva.
 *
 * ```text
 * @include bp.media-down('lg') {
 *   .voce dd { color: var(--color-ok); }     ← riga 279
 * }
 * .voce dd { color: var(--color-primary); }  ← riga 615, VINCE ovunque
 * ```
 *
 * ⚠️ **La specificità è la STESSA**: una media query non ne aggiunge. Decide
 * l'ordine, e una regola base scritta più in basso vince a ogni larghezza — la
 * variante mobile è codice morto.
 *
 * ⛔ **Non fallisce, non avvisa, e a schermo si vede solo se si sa cosa
 * cercare**: l'elemento resta com'era, e sembra che la media query non sia mai
 * stata scritta.
 *
 * ⭐ **Il rimedio è annidare**: la variante dentro la regola che modifica, così
 * non può finire prima di lei.
 *
 * ```scss
 * .voce dd {
 *   color: var(--color-primary);
 *   @include bp.media-down('lg') { color: var(--color-ok); }
 * }
 * ```
 */
import { readFileSync, globSync } from 'node:fs';

/**
 * Le dichiarazioni di un foglio, con selettore risolto, riga, e se stanno
 * dentro una media query.
 */
function dichiarazioni(scss) {
  const out = [];
  const pila = [];
  const versi = [];
  let inMedia = 0;
  let inCommento = false;

  scss.split(/\r?\n/).forEach((r, i) => {
    const n = r.trim();
    if (n.startsWith('/*')) inCommento = true;
    if (inCommento) {
      if (n.endsWith('*/')) inCommento = false;
      return;
    }
    if (n.startsWith('//')) return;

    if (n.includes('{')) {
      const testa = n.slice(0, n.indexOf('{')).trim();
      if (/@include\s+\w+\.media-/.test(testa) || testa.startsWith('@media')) {
        inMedia += 1;
        // Il VERSO serve al secondo controllo: `order` è un difetto solo
        // scendendo, dove l'ordine del DOM deve essere quello visivo.
        versi.push(/media-down/.test(testa) ? 'down' : 'up');
        pila.push('@media');
      } else if (testa) {
        const genitore = pila.filter((p) => p !== '@media').at(-1) ?? '';
        pila.push(testa.startsWith('&') ? genitore + testa.slice(1) : testa);
      } else {
        pila.push('');
      }
    } else if (/^[a-z-]+:/.test(n)) {
      const prop = n.slice(0, n.indexOf(':')).trim();
      const sel = pila.filter((p) => p !== '@media').at(-1) ?? '';
      if (sel) {
        out.push({ sel, prop, riga: i + 1, media: inMedia > 0, verso: versi.at(-1) ?? null });
      }
    }

    for (const _ of n.match(/\}/g) ?? []) {
      if (pila.pop() === '@media') {
        inMedia -= 1;
        versi.pop();
      }
    }
  });

  return out;
}

/**
 * ⏸ **LA FOTOGRAFIA DI OGGI — 30/08/2026.**
 *
 * Varianti responsive già scavalcate quando la guardia è nata. Non sono state
 * corrette qui: alcune stanno in fogli di stampa e in pannelli che vanno
 * guardati a schermo prima di toccarli, ed è lavoro a sé.
 *
 * ⭐ **La guardia serve lo stesso, e da subito**: fallisce sulla 9ª. È
 * nata perché lo stesso difetto è tornato **tre volte in un pomeriggio** sul
 * riepilogo Corrispettivi, e la quarta l'ha trovata lei — una regola scritta
 * un'ora prima, già morta.
 *
 * ⚠️ **Quando ne correggi una, TOGLILA da qui.** La chiave è file + selettore +
 * proprietà, non la riga: così non scade a ogni modifica del foglio.
 */
const NOTE = new Set([
  'src/app/domain/analytics/components/business-analytics-panel/business-analytics-panel.component.scss | .analytics-panel__heading | flex',
  'src/app/features/products/product-label-print.component.scss | .label-print__sheet | background',
  'src/app/features/products/product-label-print.component.scss | .label-print__sheet | border',
  'src/app/features/products/product-label-print.component.scss | .label-print__sheet | padding',
  'src/app/shared/components/app-topbar/app-topbar.component.scss | .app-topbar__store app-select-menu | inline-size',
  'src/app/shared/components/app-topbar/app-topbar.component.scss | .app-topbar__store | flex-shrink',
  'src/styles/_responsive-table.scss | @mixin data-table-mobile-cards($block) | display',
  'src/styles/_responsive-table.scss | @mixin data-table-mobile-cards($block) | max-inline-size',
]);

const fogli = [...globSync('src/app/**/*.scss'), ...globSync('src/styles/*.scss')];
const problemi = [];

for (const f of fogli) {
  const dich = dichiarazioni(readFileSync(f, 'utf8'));
  for (const d of dich) {
    if (!d.media) continue;
    const dopo = dich.find(
      (x) => !x.media && x.sel === d.sel && x.prop === d.prop && x.riga > d.riga,
    );
    if (dopo) {
      if (NOTE.has(`${f.replace(/\\/g, '/')} | ${d.sel} | ${d.prop}`)) continue;
      problemi.push(
        `⛔ ${f}:${d.riga}\n   «${d.sel}» { ${d.prop} } dentro una media query,\n   scavalcata dalla regola base a riga ${dopo.riga}. Annida la variante.`,
      );
    }
  }
}

/**
 * ⛔ **SECONDO CONTROLLO: `order` dentro `media-down`.**
 *
 * Sullo schermo stretto **l'ordine del DOM deve essere quello visivo**: è quello
 * che sente uno screen reader e che segue la tastiera, ed è il caso in cui un
 * ordine sbagliato costa una riga in più.
 *
 * ⚠️ **E un `order` sopravvive ai cambi di struttura senza fallire.** Misurato il
 * 30/08/2026: la fascia totali del Registro è passata da una griglia unica a due
 * bande, l'ordine del DOM è tornato a bastare — ma **cinque `order` sono
 * rimasti**, e uno spingeva «Tot. vendite» DOPO il Corrispettivo. Continuava a
 * fare quello per cui era nato, in un contesto in cui quel lavoro non serviva
 * più.
 *
 * ⭐ Chi ne ha bisogno davvero lo dichiara qui, con la ragione.
 */
const ORDER_AMMESSI = new Map([
  [
    'src/app/features/sales-orders/customer-order-form.mobile-cards.scss | .co-form .doc-form__internal-ref',
    'riordino dentro un contenitore `display: contents`: il DOM serve al desktop',
  ],
  [
    'src/app/features/sales-orders/customer-order-form.mobile-cards.scss | .co-form .doc-form__save-state',
    'idem: lo stato di salvataggio va sopra il riferimento interno',
  ],
]);

for (const f of fogli) {
  const chiave = f.replace(/\\/g, '/');
  for (const d of dichiarazioni(readFileSync(f, 'utf8'))) {
    if (d.prop !== 'order' || !d.media || d.verso !== 'down') continue;
    if (ORDER_AMMESSI.has(`${chiave} | ${d.sel}`)) continue;
    problemi.push(
      `⛔ ${f}:${d.riga}\n   «${d.sel}» { order } dentro media-down.\n   Sullo schermo stretto l'ordine del DOM dev'essere quello visivo: riordina\n   il markup, oppure dichiaralo in ORDER_AMMESSI con la ragione.`,
    );
  }
}

if (problemi.length > 0) {
  console.error(`${problemi.length} regola/e responsive che mentono:\n`);
  for (const p of problemi) console.error(`${p}\n`);
  process.exit(1);
}

console.log(
  `check:media-scavalcate — ${fogli.length} fogli: nessuna variante scavalcata, nessun \`order\` non dichiarato sotto \`media-down\`.`,
);
