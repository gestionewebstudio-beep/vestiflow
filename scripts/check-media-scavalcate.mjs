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
      if (sel) out.push({ sel, prop, riga: i + 1, media: inMedia > 0 });
    }

    for (const _ of n.match(/\}/g) ?? []) {
      if (pila.pop() === '@media') inMedia -= 1;
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

if (problemi.length > 0) {
  console.error(`${problemi.length} variante/i responsive morte:\n`);
  for (const p of problemi) console.error(`${p}\n`);
  process.exit(1);
}

console.log(
  `check:media-scavalcate — ${fogli.length} fogli, nessuna variante responsive scavalcata da una base successiva.`,
);
