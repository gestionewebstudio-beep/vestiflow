#!/usr/bin/env node
/**
 * **Un ELENCO sta sul motore comune. Ciò che non ci sta lo dice, e dice perché.**
 *
 * ⛔ **Il difetto, misurato l'11/09/2026** (`docs/26`): trentasei `<table>`
 * scritte a mano e una ventina di `<ul>` che rendevano righe di dati, ciascuna
 * con la propria intestazione, i propri stili, nessun filtro, nessun ordinamento
 * e un ripiego sul telefono diverso dagli altri — o nessuno. Nessuna guardia le
 * vedeva: `check:strati-tabella`, `check:row-card` e le altre guardano il
 * motore, non chi gli sta fuori.
 *
 * ⭐ **Come decide**: ogni template con un `<table>` o un `@for` dentro un
 * `<ul>`/`<ol>` — commenti esclusi — deve stare in `ELENCO_MOTIVATO`, con la
 * classe e la ragione. Non basta esserci: la classe è quella del censimento di
 * `docs/26` §2 — **B** maschera di inserimento (le righe si compilano), **C**
 * non elenco (navigazione, dialoghi, selettori, coppie di dettaglio, gestori di
 * vocabolari) — e un elenco di consultazione non ha una classe: va sul motore.
 *
 * ⚠️ **E la lista non può invecchiare**: una voce il cui template non ha più
 * niente da motivare fa fallire il controllo, così le eccezioni restano quelle
 * vere e non un archivio di deroghe passate.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Il motore stesso e lo scheletro di caricamento: non sono deviazioni. */
const MOTORE = new Set([
  'shared/components/data-table/data-table.component.html',
  'shared/components/table-skeleton/table-skeleton.component.html',
]);

/**
 * Le eccezioni motivate (`docs/26` §2.B, §2.C e §5). Il percorso è relativo a
 * `src/app/`.
 */
const ELENCO_MOTIVATO = {
  // ── B · MASCHERE di inserimento: le righe si compilano, non si consultano ──
  'features/documents/goods-receipt-form.component.html': {
    classe: 'B',
    perche: 'righe documento editabili (`doc-form__table`); l’elenco Includi è un dialogo',
  },
  'features/documents/sales-document-form.component.html': {
    classe: 'B',
    perche: 'righe documento editabili (`doc-form__table`); i DDT collegati sono un dialogo',
  },
  'features/documents/stock-operation-form.component.html': {
    classe: 'B',
    perche: 'righe documento editabili (`doc-form__table`)',
  },
  'features/documents/transfer-form.component.html': {
    classe: 'B',
    perche: 'righe documento editabili (`doc-form__table`)',
  },
  'features/documents/purchase-invoice-form.component.html': {
    classe: 'B',
    perche:
      'righe e scadenze editabili (`pi-form__table`, deroga mobile dichiarata nel foglio); Includi è un dialogo — `docs/26` §5.23',
  },
  'features/orders/supplier-order-form.component.html': {
    classe: 'B',
    perche: 'righe documento editabili (`doc-form__table`)',
  },
  'features/sales-orders/customer-order-form.component.html': {
    classe: 'B',
    perche: 'righe documento editabili; ordini inclusi e anomalie di disponibilità sono avvisi',
  },
  'features/store-sales/store-sale-document-form.component.html': {
    classe: 'B',
    perche: 'righe documento editabili (`doc-form__table`)',
  },
  'features/reports/pages/manual-receipt-form/manual-receipt-form.component.html': {
    classe: 'B',
    perche: 'righe editabili (`doc-form__table`) — `docs/26` §5.23',
  },
  'features/inventory/movement-form.component.html': {
    classe: 'B',
    perche:
      'righe editabili (`doc-form__table`, deroga mobile dichiarata); la ricerca articolo è un selettore — `docs/26` §5.23',
  },
  'features/cash/cash-register.component.html': {
    classe: 'B',
    perche:
      'carrello con quantità editabile, grammatica condivisa (`docs/26` A18); i risultati di ricerca sono un selettore',
  },
  'features/cash/pages/cash-return.component.html': {
    classe: 'B',
    perche:
      'quantità da rendere editabile, grammatica condivisa (`docs/26` A17); le quote del rimborso si compilano',
  },
  'features/settings/pages/users/users-page.component.html': {
    classe: 'B',
    perche: 'ruolo, sedi e permessi si modificano sulla riga, grammatica condivisa (`docs/26` D2)',
  },
  'features/admin/components/admin-tenant-users-panel/admin-tenant-users-panel.component.html': {
    classe: 'B',
    perche: 'utenti del tenant modificabili sulla riga, grammatica condivisa (`docs/26` A13)',
  },
  'domain/users/components/user-permissions-editor/user-permissions-editor.component.html': {
    classe: 'B',
    perche: 'matrice dei permessi: caselle da spuntare, non righe da consultare',
  },
  'domain/products/components/product-options-step/product-options-step.component.html': {
    classe: 'B',
    perche: 'griglia delle opzioni in compilazione',
  },
  'domain/products/components/product-variants-step/product-variants-step.component.html': {
    classe: 'B',
    perche: 'griglia delle varianti in compilazione (`formArrayName`)',
  },
  'features/products/components/product-variant-table/product-variant-table.component.html': {
    classe: 'B',
    perche: 'varianti con campi editabili nella scheda, grammatica condivisa',
  },

  // ── C · Righe documento in sola lettura: grammatica documentale condivisa ──
  'domain/documents/components/document-lines-table/document-lines-table.component.html': {
    classe: 'C',
    perche: 'la griglia condivisa delle righe documento in sola lettura',
  },
  'features/online-sales/online-sale-detail.component.html': {
    classe: 'C',
    perche: 'righe della vendita = griglia documentale sui mixin condivisi (`docs/26` A16)',
  },
  'features/orders/components/supplier-order-lines-table/supplier-order-lines-table.component.html':
    {
      classe: 'C',
      perche: 'righe dell’ordine in sola lettura sui mixin condivisi (`stack-table`)',
    },

  // ── C · Coppie di dettaglio, riepiloghi, matrici ─────────────────────────
  'features/settings/components/tenant-client-card/tenant-client-card.component.html': {
    classe: 'C',
    perche: 'anagrafica della sede: coppie etichetta·valore',
  },
  'domain/sales-orders/components/channel-order-rettifiche/channel-order-rettifiche.component.html':
    {
      classe: 'C',
      perche:
        'il raccordo economico di un ordine di canale (valore originario · rettifiche · totale aggiornato) e le tre quantità per riga: un riepilogo, non un elenco da filtrare o ordinare — `docs/08` §3-bis',
    },
  'features/settings/components/shopify-integration-panel/shopify-integration-panel.component.html':
    {
      classe: 'C',
      perche:
        'permessi Shopify = matrice di consultazione (`docs/26` A4); i problemi dei webhook sono un avviso',
    },
  'domain/channels/shopify/components/shopify-location-choices/shopify-location-choices.component.html':
    {
      classe: 'B',
      perche: 'una scelta (tendina) per location Shopify: si compila, non si consulta (`docs/27` §1)',
    },
  'domain/channels/shopify/components/shopify-setup-panel/shopify-setup-panel.component.html': {
    classe: 'C',
    perche:
      'gli elenchi dentro `details` sono le anomalie PREVISTE dall’anteprima, prima della conferma (SKU ambigui, ordini che resteranno senza impegno, non determinabili, blocchi, casi che l’attivazione non risolve); dopo l’attivazione i problemi APERTI stanno sul motore in `shopify-problemi` (`docs/27` §1, §4-bis); le sedi sono in `shopify-location-choices`, le variazioni previste sul motore',
  },
  'features/inventory/stock-lookup.component.html': {
    classe: 'C',
    perche: 'matrice taglie×sedi e risultati di ricerca con grammatica condivisa (`docs/26` A11)',
  },
  'domain/cash/components/cash-tender-split/cash-tender-split.component.html': {
    classe: 'C',
    perche: 'spezzatino dei pagamenti: si compila',
  },
  'features/cash/pages/cash-operation-detail.component.html': {
    classe: 'C',
    perche: 'le quote dell’incasso sono un riepilogo del documento (`docs/26` A19)',
  },
  'features/products/product-detail.component.html': {
    classe: 'C',
    perche: 'attributi, collezioni e immagini: coppie di dettaglio e galleria (`docs/26` A21)',
  },
  'features/products/product-import.component.html': {
    classe: 'C',
    perche: 'le anomalie di una riga, dentro la cella della riga',
  },
  'features/documents/document-detail.component.html': {
    classe: 'C',
    perche: 'cronologia delle revisioni',
  },
  'features/documents/sales-document-detail.component.html': {
    classe: 'C',
    perche: 'cronologia delle revisioni',
  },

  // ── C · Navigazione, menu, tendine ────────────────────────────────────────
  'layout/breadcrumbs/breadcrumbs.component.html': { classe: 'C', perche: 'navigazione' },
  'layout/global-search/global-search.component.html': {
    classe: 'C',
    perche: 'risultati della ricerca globale',
  },
  'shared/components/app-sidebar/app-sidebar.component.html': {
    classe: 'C',
    perche: 'navigazione',
  },
  'shared/components/action-menu/action-menu.component.html': { classe: 'C', perche: 'menu' },
  'shared/components/select-menu/select-menu.component.html': { classe: 'C', perche: 'tendina' },
  'shared/components/table-column-picker/table-column-picker.component.html': {
    classe: 'C',
    perche: 'selettore delle colonne',
  },
  'domain/products/product-form.component.html': {
    classe: 'C',
    perche: 'le linguette della scheda; le giacenze sono sul motore (`docs/26` A26)',
  },

  // ── C · Dialoghi, selettori, suggerimenti ─────────────────────────────────
  'domain/documents/components/document-chronology-warning-dialog/document-chronology-warning-dialog.component.html':
    { classe: 'C', perche: 'dialogo dei conflitti di cronologia' },
  'domain/documents/components/document-include-panel/document-include-panel.component.html': {
    classe: 'C',
    perche: 'dialogo Includi',
  },
  'domain/documents/components/document-line-suggestions/document-line-suggestions.component.html':
    { classe: 'C', perche: 'suggerimenti della riga' },
  'domain/products/components/product-picker-dialog/product-picker-dialog.component.html': {
    classe: 'C',
    perche: 'selettore prodotti',
  },
  'domain/products/components/product-search-results/product-search-results.component.html': {
    classe: 'C',
    perche: 'risultati di ricerca da scegliere',
  },
  'domain/products/components/shopify-taxonomy-picker/shopify-taxonomy-picker.component.html': {
    classe: 'C',
    perche: 'selettore della tassonomia',
  },
  'domain/channels/shopify/components/shopify-shop-change-wizard/shopify-shop-change-wizard.component.html':
    { classe: 'C', perche: 'riferimenti che bloccano il cambio negozio, dentro un dialogo' },
  'features/cash/pages/cash-operations.component.html': {
    classe: 'C',
    perche: 'risultati del richiamo scontrino, da scegliere',
  },
  'features/settings/components/location-licensing-panel/location-licensing-panel.component.html': {
    classe: 'C',
    perche: 'sedi da spuntare entro la licenza (`docs/26` A24)',
  },

  // ── C · Gestori dei vocabolari ────────────────────────────────────────────
  'domain/documents/components/external-document-type-manager/external-document-type-manager.component.html':
    { classe: 'C', perche: 'gestore di vocabolario' },
  'domain/documents/components/document-counters/document-counters.component.html': {
    classe: 'C',
    perche: 'numeratori',
  },
  'domain/products/components/catalog-category-manager/catalog-category-manager.component.html': {
    classe: 'C',
    perche: 'gestore di vocabolario',
  },
  'domain/products/components/option-list-editor/option-list-editor.component.html': {
    classe: 'C',
    perche: 'valori di un’opzione, in compilazione',
  },
  'domain/products/components/unit-of-measure-manager/unit-of-measure-manager.component.html': {
    classe: 'C',
    perche: 'gestore di vocabolario',
  },
  'features/settings/pages/payment-options/payment-options-page.component.html': {
    classe: 'C',
    perche: 'gestore di vocabolario con rinomina sulla riga (`docs/26` A23)',
  },

  // ── C · Allegati e immagini ───────────────────────────────────────────────
  'features/documents/components/document-attachments-panel/document-attachments-panel.component.html':
    { classe: 'C', perche: 'allegati' },
  'features/suppliers/components/supplier-attachments-panel/supplier-attachments-panel.component.html':
    { classe: 'C', perche: 'allegati' },
  'shared/components/attachments-dialog/attachments-dialog.component.html': {
    classe: 'C',
    perche: 'allegati',
  },
  'shared/components/attachments-panel/attachments-panel.component.html': {
    classe: 'C',
    perche: 'allegati',
  },
  'domain/products/components/product-images-field/product-images-field.component.html': {
    classe: 'C',
    perche: 'immagini del prodotto',
  },
};

function file(dir, est, acc = []) {
  for (const voce of readdirSync(dir)) {
    const p = join(dir, voce);
    if (statSync(p).isDirectory()) file(p, est, acc);
    else if (voce.endsWith(est)) acc.push(p.replace(/\\/g, '/'));
  }
  return acc;
}

function senzaCommenti(markup) {
  return markup.replace(/<!--[\s\S]*?-->/g, '');
}

/** Quanti `@for` stanno dentro un `<ul>` o `<ol>`. */
function forDentroElenchi(markup) {
  const token = /<\/?(ul|ol)\b[^>]*>|@for\s*\(/g;
  let profondita = 0;
  let trovati = 0;
  let m;
  while ((m = token.exec(markup))) {
    const t = m[0];
    if (t.startsWith('</')) profondita = Math.max(0, profondita - 1);
    else if (t.startsWith('<')) profondita += 1;
    else if (profondita > 0) trovati += 1;
  }
  return trovati;
}

const RADICE = 'src/app/';
let difetti = 0;
let motivati = 0;
const visti = new Set();

for (const html of file('src/app', '.html')) {
  const relativo = html.slice(html.indexOf(RADICE) + RADICE.length);
  if (MOTORE.has(relativo)) continue;
  const markup = senzaCommenti(readFileSync(html, 'utf8'));
  const tabelle = (markup.match(/<table\b/g) ?? []).length;
  const fors = forDentroElenchi(markup);
  const deviazione = tabelle > 0 || fors > 0;
  const voce = ELENCO_MOTIVATO[relativo];

  if (deviazione && !voce) {
    difetti += 1;
    console.error(
      `⛔ ${relativo}\n     ${tabelle} <table> e ${fors} @for dentro ul/ol fuori dal motore, senza una ragione.\n` +
        `     Se è un elenco va su app-data-table; se è una maschera (B) o un non elenco (C), va in ELENCO_MOTIVATO con il perché (docs/26 §2).`,
    );
  } else if (deviazione) {
    motivati += 1;
    visti.add(relativo);
  }
}

for (const relativo of Object.keys(ELENCO_MOTIVATO)) {
  if (!visti.has(relativo)) {
    difetti += 1;
    console.error(
      `⛔ ${relativo}\n     è in ELENCO_MOTIVATO ma non ha più niente da motivare (o non esiste): la voce va tolta.`,
    );
  }
}

if (difetti > 0) {
  console.error(`\n${difetti} deviazioni dal motore tabella non motivate.`);
  process.exit(1);
}

console.log(
  `check:elenchi-fuori-motore — ${motivati} template fuori dal motore, tutti con classe e ragione dichiarate.`,
);
