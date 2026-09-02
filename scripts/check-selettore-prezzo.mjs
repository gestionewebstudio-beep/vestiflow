#!/usr/bin/env node
/**
 * check:selettore-prezzo — una maschera che cabla il selettore netto/ivato deve
 * dichiarare una colonna che esiste davvero nel suo catalogo.
 *
 * ⛔ IL DIFETTO CHE PRENDE, misurato il 02/09/2026 sull'Arrivo merce: la maschera
 * passava alla testata comune `priceLabel`, `pricesIncludeVat` e
 * `priceModeChanged`, ma la testata rendeva il menu solo dentro
 * `@if (isColumnVisible()('unitPrice'))` — col nome scritto a mano. L'Arrivo
 * merce quella colonna non la dichiara: la sua si chiama `sellingPrice`. Il
 * selettore era **cablato e morto**, e i tre prezzi d'anagrafica restavano
 * inchiodati alla convenzione aziendale senza che l'operatore vedesse in che
 * base stava digitando.
 *
 * ⚠️ **Un `@if` che non scatta non fallisce**: nessun errore, nessun test rosso,
 * build verde. Il difetto è vissuto dal 24/08/2026 — quando l'Arrivo merce è
 * passato alla testata comune e il suo menu, che funzionava, è stato perso in
 * un commit intitolato «anche l'Arrivo merce è la riga comune».
 *
 * ⭐ Dal 02/09 la testata riceve `priceColumn`: questa guardia verifica che il
 * nome dichiarato esista nel catalogo colonne di quella maschera.
 */
import { readFileSync, existsSync } from 'node:fs';

/** maschera → [template, catalogo colonne, costante del catalogo] */
const MASCHERE = [
  [
    'Arrivo merce',
    'src/app/features/documents/goods-receipt-form.component.html',
    'src/app/features/documents/models/goods-receipt-line-columns.config.ts',
  ],
  [
    'Fatture',
    'src/app/features/documents/sales-document-form.component.html',
    'src/app/features/documents/models/sales-document-line-columns.config.ts',
  ],
  [
    'Ordine cliente',
    'src/app/features/sales-orders/customer-order-form.component.html',
    'src/app/features/sales-orders/models/customer-order-line-columns.config.ts',
  ],
  [
    'Ordine fornitore',
    'src/app/features/orders/supplier-order-form.component.html',
    'src/app/features/orders/models/supplier-order-line-columns.config.ts',
  ],
  [
    'Vendita al banco',
    'src/app/features/store-sales/store-sale-document-form.component.html',
    'src/app/domain/store-sales/models/store-sale-line-columns.config.ts',
  ],
  [
    'Movimento',
    'src/app/features/documents/stock-operation-form.component.html',
    'src/app/domain/documents/models/stock-movement-line-columns.config.ts',
  ],
  [
    'Trasferimento',
    'src/app/features/documents/transfer-form.component.html',
    'src/app/domain/documents/models/stock-movement-line-columns.config.ts',
  ],
];

const leggi = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '');

const problemi = [];
const nonLetti = [];
let controllate = 0;

for (const [nome, template, catalogo] of MASCHERE) {
  const html = leggi(template);
  const cat = leggi(catalogo);
  if (!html || !cat) {
    nonLetti.push(nome + ' (template: ' + Boolean(html) + ', catalogo: ' + Boolean(cat) + ')');
    continue;
  }

  // Cabla il selettore del prezzo?
  const cabla = /\(priceModeChanged\)/.test(html);
  if (!cabla) continue;
  controllate += 1;

  // Quale colonna dichiara? `priceColumn="x"` o `[priceColumn]="'x'"`.
  const m = html.match(/\[?priceColumn\]?="'?([\w]+)'?"/);
  const dichiarata = m ? m[1] : 'unitPrice'; // il default del componente

  // Il catalogo la contiene?
  const presente = new RegExp("id:\\s*'" + dichiarata + "'").test(cat);
  if (!presente) {
    problemi.push(
      '  ' +
        nome +
        ': cabla il selettore prezzo su «' +
        dichiarata +
        '»' +
        (m ? '' : ' (default, non dichiarata)') +
        ',\n     ma ' +
        catalogo.split('/').pop() +
        ' quella colonna non la dichiara: il menu non verrà MAI reso.',
    );
  }
}

// ⚠️ Una maschera non letta non è un successo.
if (nonLetti.length > 0) {
  console.error('⛔ check:selettore-prezzo — non analizzate:');
  for (const n of nonLetti) console.error('  ' + n);
  console.error('\n  Se un file è stato spostato, va aggiornato questo script.');
  process.exit(1);
}

if (problemi.length > 0) {
  console.error('⛔ check:selettore-prezzo — SELETTORI CABLATI E MORTI:\n');
  for (const p of problemi) console.error(p);
  console.error(
    '\n  La testata rende il menu dentro `@if (isColumnVisible()(priceColumn()))`.\n' +
      '  Se quella colonna non è nel catalogo della maschera, la guardia non scatta mai —\n' +
      '  e non fallisce niente: nessun errore, nessun test rosso, build verde.\n' +
      '  Dichiarare `priceColumn` col nome che quel documento usa davvero.',
  );
  process.exit(1);
}

console.log(
  '✅ check:selettore-prezzo — ' +
    controllate +
    ' maschere cablano il selettore prezzo, e ognuna su una colonna che esiste.',
);
