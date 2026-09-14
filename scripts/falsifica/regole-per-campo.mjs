/**
 * Falsifica le prove delle REGOLE PER CAMPO — `docs/DA-FARE.md` §31.25.
 *
 *   node scripts/falsifica/regole-per-campo.mjs
 *
 * ⭐ **Sono prove UNITARIE**, quindi non serve il database: la suite è quella
 *    predefinita di vitest (`config: null`), non l'integrazione. È la ragione
 *    per cui `falsifica.mjs` ha imparato a scegliere la suite — prima ci
 *    avrebbe risposto `NESSUNA PROVA` su un codice sano.
 *
 * I quattro guasti sono i quattro modi in cui il difetto può tornare:
 *
 *   1  il tipo prodotto Shopify rientra nella categoria interna (l'import)
 *   2  il costo torna a scriversi negli aggiornamenti del prodotto
 *   3  il costo torna a scriversi sulle varianti già collegate
 *   4  la categoria interna torna a uscire verso Shopify (il push)
 *   5  il campo vuoto smette di essere «non acquisito» e diventa «cancella»
 *   6  la guardia d'ORIGINE torna a decidere al posto delle regole per campo
 */
import { autoprova, dentroApi, falsificaTutti } from './falsifica.mjs';

const PULL = dentroApi('src/shopify/shopify-product-pull.service.ts');
const PAYLOAD = dentroApi('src/shopify/shopify-product-payload.util.ts');
const CSV_OUT = dentroApi('src/products/import/shopify-csv.serialize.ts');
const CSV_IN = dentroApi('src/products/import/shopify-csv.mapper.ts');

const PROVA_PULL = 'src/shopify/shopify-product-pull.service.spec.ts';
const PROVA_PAYLOAD = 'src/shopify/shopify-product-payload.util.spec.ts';
const PROVA_CSV = 'src/products/import/shopify-csv.serialize.spec.ts';

// ⚠️ Filtri senza accenti e con spazi: `-t` è sensibile agli accenti, e su
//    Windows un filtro con `|` o senza spazi viene spezzato dalla shell.
const strumentoSano = autoprova({
  file: PULL,
  ancora: 'shopifyProductType: remote.product_type?.trim() || null,',
  prova: PROVA_PULL,
  config: null,
});

const guasti = [
  {
    nome: '1 - il tipo prodotto rientra nella categoria interna',
    file: PULL,
    da: '      shopifyProductType: remote.product_type?.trim() || null,',
    a: '      category: remote.product_type?.trim() || null,',
    filtro: 'il tipo prodotto Shopify va nel campo SUO',
  },
  {
    nome: '2 - il costo torna a scriversi sul PRODOTTO',
    file: PULL,
    // ⚠️ Riscritto l’11/09/2026: puntava alla forma «oggetto passato dentro
    //    `data`», che il fermo sugli aggiornamenti inutili ha sostituito con
    //    una const. Lo strumento ha risposto ANCORA ASSENTE — e quello NON è
    //    un successo: diceva che la prova non era più verificata.
    //    forma che il fermo sugli aggiornamenti inutili ha sostituito con una
    //    const. Lo strumento ha risposto ANCORA ASSENTE, che NON è un successo.
    da: [
      '      //    vietata, e le due non si prestano gli argomenti.',
      '    };',
    ].join('\n'),
    a: [
      '      //    vietata, e le due non si prestano gli argomenti.',
      '      purchasePriceMinor: 0,',
      '    };',
    ].join('\n'),
    filtro: 'il COSTO non si scrive',
  },
  {
    nome: '3 - il costo torna a scriversi sulle varianti collegate',
    file: PULL,
    da: ['        shopifyPriceMinor: variantPriceMinor,', '        shopifyVariantId,'].join('\n'),
    a: [
      '        shopifyPriceMinor: variantPriceMinor,',
      '        purchasePriceMinor: 0,',
      '        shopifyVariantId,',
    ].join('\n'),
    filtro: 'il costo remoto non la tocca',
  },
  {
    nome: '4 - la categoria interna torna a uscire verso Shopify',
    file: PAYLOAD,
    da: '    productType: product.shopifyProductType ?? undefined,',
    a: '    productType: product.category ?? undefined,',
    filtro: 'i due campi sono indipendenti',
    prova: PROVA_PAYLOAD,
  },
  {
    nome: '5 - il campo vuoto diventa una CANCELLAZIONE remota',
    file: PAYLOAD,
    da: '    productType: product.shopifyProductType ?? undefined,',
    a: "    productType: product.shopifyProductType ?? '',",
    filtro: 'la chiave non entra nel payload',
    prova: PROVA_PAYLOAD,
  },
  {
    nome: "6 - la guardia d'ORIGINE torna a decidere",
    file: PULL,
    da: '    const categorySyncError = categoryMetafieldsSyncErrorMessage(',
    a: [
      "    if (existing && existing.catalogOrigin === 'vestiflow') return 'skipped';",
      '    const categorySyncError = categoryMetafieldsSyncErrorMessage(',
    ].join('\n'),
    filtro: 'i bidirezionali arrivano',
  },

  // ── il CSV in formato Shopify: la colonna `Type` è del canale ──────────
  {
    nome: '7 - l export rimette la categoria interna in Type',
    file: CSV_OUT,
    da: "    row.Type = product.shopifyProductType?.trim() ?? '';",
    a: "    row.Type = product.category?.trim() ?? '';",
    filtro: 'la categoria interna non finisce in Type',
    prova: PROVA_CSV,
  },
  {
    nome: '8 - l export perde la colonna Categoria',
    file: CSV_OUT,
    da: "    row.Categoria = product.category?.trim() ?? '';",
    a: "    row.Categoria = '';",
    filtro: 'nessuno dei due si perde',
    prova: PROVA_CSV,
  },
  {
    nome: '9 - l import rimette Type dentro la categoria interna',
    file: CSV_IN,
    da: '    category: firstNonEmpty(rows.map((row) => row.category)) ?? undefined,',
    a: '    category: firstNonEmpty(rows.map((row) => row.type)) ?? undefined,',
    filtro: 'non scrive la categoria interna',
    prova: PROVA_CSV,
  },

  // ── il fermo sugli aggiornamenti inutili ───────────────────────────────
  {
    nome: '10 - il prodotto torna a riscriversi uguale',
    file: PULL,
    da: '    if (!prodottoFermo) {',
    a: '    if (true) {',
    filtro: 'il SECONDO webhook identico',
  },
  {
    nome: '11 - la variante torna a riscriversi uguale',
    file: PULL,
    da: '        if (!nullaDaScrivere(variantSyncData, matched, [])) {',
    a: '        if (true) {',
    filtro: 'il SECONDO webhook identico',
  },
  {
    // ⛔ Il guasto PEGGIORE della famiglia: un confronto troppo indulgente
    //    non scrive di meno — PERDE una modifica, e in silenzio.
    nome: '12 - il confronto dichiara identico tutto',
    file: PULL,
    da: [
      'function valoreIdentico(nuovo: unknown, vecchio: unknown): boolean {',
      '  if (nuovo === vecchio) {',
    ].join('\n'),
    a: [
      'function valoreIdentico(nuovo: unknown, vecchio: unknown): boolean {',
      '  if (nuovo !== undefined || vecchio === undefined) {',
    ].join('\n'),
    filtro: 'ma un cambiamento di',
  },
];

const tutti = falsificaTutti(guasti, PROVA_PULL, null);
process.exit(tutti && strumentoSano ? 0 : 1);
