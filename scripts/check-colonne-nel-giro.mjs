#!/usr/bin/env node
/**
 * check:colonne-nel-giro — una colonna che la riga comune rende con `cellId()`
 * DEVE stare nel giro del fuoco della maschera che la dichiara.
 *
 * ⛔ IL DIFETTO CHE PRENDE, misurato il 02/09/2026 sulle quattro maschere Fattura:
 * la colonna «U.m.» era accesa di serie e la sua cella è un `<input>` vero, ma
 * `unitOfMeasure` non stava in `SALES_DOCUMENT_LINE_FOCUS_FIELDS`. Risultato: una
 * TRAPPOLA DEL FUOCO. Ci si entrava col mouse e non se ne usciva più con la
 * tastiera — Tab, Shift+Tab e le quattro frecce non facevano niente.
 *
 * ⚠️ **Perché la cella non può rimediare da sola**: fa `preventDefault()` sul tasto
 * e poi emette l'esito allo store, che lo scarta se il campo non è nel giro. Il
 * browser non può più fare il suo Tab nativo — è già stato annullato. È il motivo
 * per cui il difetto è una trappola e non un semplice «campo saltato».
 *
 * ⭐ **LA DISCRIMINANTE È `cellId()`**, non «la cella è editabile». Una checkbox
 * nativa (`loadsStock`, `commitsStock`) non fa preventDefault e resta nel Tab del
 * browser: sta fuori dal giro senza danno. Le celle con `cellId()` invece sono
 * quelle progettate per il giro gestito, e fuori da lui diventano trappole.
 *
 * ⚠️ Vale anche per le colonne SPENTE di serie: nascono spente ma si accendono dal
 * selettore Colonne, e in quel momento la trappola compare.
 */
import { readFileSync, existsSync } from 'node:fs';

const RIGA_COMUNE =
  'src/app/domain/documents/components/document-line-row/document-line-row.component.html';

/** maschera → [file dell'elenco campi, costante, file colonne, costante colonne] */
const MASCHERE = [
  [
    'Arrivo merce',
    'GOODS_RECEIPT_LINE_FOCUS_FIELDS',
    'src/app/features/documents/models/goods-receipt-line-columns.config.ts',
    'GOODS_RECEIPT_LINE_COLUMNS',
  ],
  [
    'Fatture',
    'SALES_DOCUMENT_LINE_FOCUS_FIELDS',
    'src/app/features/documents/models/sales-document-line-columns.config.ts',
    'SALES_DOCUMENT_LINE_COLUMNS',
  ],
  [
    'Ordine fornitore',
    'SUPPLIER_ORDER_LINE_FOCUS_FIELDS',
    'src/app/features/orders/models/supplier-order-line-columns.config.ts',
    'SUPPLIER_ORDER_LINE_COLUMNS',
  ],
  [
    'Ordine cliente',
    'CUSTOMER_ORDER_LINE_FOCUS_FIELDS',
    'src/app/features/sales-orders/models/customer-order-line-columns.config.ts',
    'CUSTOMER_ORDER_LINE_COLUMNS',
  ],
  [
    'Movimento e Trasferimento',
    'MOVEMENT_LINE_FOCUS_FIELDS',
    'src/app/domain/documents/models/stock-movement-line-columns.config.ts',
    'STOCK_MOVEMENT_LINE_COLUMNS',
  ],
];

/** Dove cercare le costanti degli elenchi campi. */
const FONTI = [
  'src/app/features/documents/goods-receipt-form.component.ts',
  'src/app/features/documents/sales-document-form.component.ts',
  'src/app/features/orders/supplier-order-form.component.ts',
  'src/app/features/sales-orders/customer-order-form.component.ts',
  'src/app/domain/documents/models/stock-movement-line-columns.config.ts',
];

/**
 * Da id di colonna ad alias di `cellId()`. Le due nomenclature divergono per
 * storia, e questa mappa è l'unico posto dove il salto è dichiarato.
 */
const ALIAS = {
  articleCode: 'code',
  quantity: 'qty',
  unitOfMeasure: 'uom',
  unitPrice: 'price',
  unitCost: 'cost',
  supplierCode: 'supplier-code',
};

const leggi = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '');

const rigaComune = leggi(RIGA_COMUNE);
if (!rigaComune) {
  console.error('⛔ check:colonne-nel-giro — riga comune non trovata: ' + RIGA_COMUNE);
  process.exit(1);
}

/**
 * ⚠️ **NON tutte le celle con `cellId()` sono trappole**, e restringere qui è ciò
 * che tiene la guardia credibile — una che segnala falsi positivi viene spenta.
 *
 * Sono trappole solo le celle che fanno `preventDefault()` DA SÉ:
 * `document-line-select-cell` (nove volte) e `document-line-unit-cell`, che monta
 * la prima. Lì l'evento è già annullato quando arriva allo store, e se il campo
 * non è nel giro il Tab nativo non può più rimediare.
 *
 * ⭐ Un `<input>` semplice che si limita a `fieldKeydown.emit(...)` — Costo,
 * Prezzo, Prezzo di vendita, Prezzo barrato — NON annulla niente: fuori dal giro
 * resta raggiungibile col Tab del browser. È il motivo per cui `sellingPrice` e
 * `compareAtPrice` dell'Ordine fornitore, pur essendo fuori dal giro, non sono un
 * difetto: verificato il 02/09/2026 leggendo la riga comune.
 */
const CELLE_CHE_ANNULLANO = ['app-document-line-select-cell', 'app-document-line-unit-cell'];

const aliasGestiti = new Set();
for (const tag of CELLE_CHE_ANNULLANO) {
  // Il `cellId('...')` sta dentro il blocco del tag: si guarda dal tag in avanti,
  // fino alla chiusura, senza attraversare il tag successivo.
  for (const blocco of rigaComune.split('<' + tag).slice(1)) {
    const m = blocco.slice(0, 1200).match(/cellId\('([\w-]+)'\)/);
    if (m) aliasGestiti.add(m[1]);
  }
}

if (aliasGestiti.size === 0) {
  console.error(
    '⛔ check:colonne-nel-giro — nessuna cella che annulla l\'evento trovata nella riga\n' +
      '  comune: o i tag sono cambiati, o la guardia è cieca. Va aggiornato CELLE_CHE_ANNULLANO.',
  );
  process.exit(1);
}

function elencoCampi(nome) {
  for (const f of FONTI) {
    const m = leggi(f).match(
      new RegExp('(?:export )?const ' + nome + '[^=]*=\\s*\\[([\\s\\S]*?)\\n\\] as const'),
    );
    if (m) return [...m[1].matchAll(/'([\w]+)'/g)].map((x) => x[1]);
  }
  return null;
}

const problemi = [];
const nonLetti = [];
let colonneControllate = 0;

for (const [nome, costanteCampi, fileColonne, costanteColonne] of MASCHERE) {
  const campi = elencoCampi(costanteCampi);
  const mc = leggi(fileColonne).match(
    new RegExp('const ' + costanteColonne + '[^=]*=\\s*\\[([\\s\\S]*?)\\n\\];'),
  );
  if (!campi || !mc) {
    nonLetti.push(`${nome} (campi: ${!!campi}, colonne: ${!!mc})`);
    continue;
  }

  const colonne = [...mc[1].matchAll(/\{[^}]*id:\s*'([\w]+)'[^}]*\}/g)].map((m) => ({
    id: m[1],
    spenta: /defaultVisible:\s*false/.test(m[0]),
  }));

  for (const col of colonne) {
    const alias = ALIAS[col.id] ?? col.id;
    if (!aliasGestiti.has(alias)) continue; // non è una cella del giro gestito
    colonneControllate += 1;
    if (!campi.includes(col.id)) {
      problemi.push(
        `  ${nome}: la colonna «${col.id}»${col.spenta ? ' (spenta di serie, ma accendibile)' : ''} ` +
          `è resa con cellId('${alias}') ma NON è in ${costanteCampi}.`,
      );
    }
  }
}

// ⚠️ Una maschera non letta non è un successo: la guardia lo dice e fallisce.
if (nonLetti.length > 0) {
  console.error('⛔ check:colonne-nel-giro — non analizzate:');
  for (const n of nonLetti) console.error('  ' + n);
  console.error('\n  Se un elenco ha cambiato forma, va aggiornato questo script.');
  process.exit(1);
}

if (problemi.length > 0) {
  console.error('⛔ check:colonne-nel-giro — TRAPPOLE DEL FUOCO:\n');
  for (const p of problemi) console.error(p);
  console.error(
    '\n  Quelle celle fanno `preventDefault()` sui tasti di navigazione e poi emettono\n' +
      "  l'esito allo store, che lo scarta perché il campo non è nel giro: il fuoco resta\n" +
      '  intrappolato e il Tab nativo è già stato annullato.\n' +
      '  Aggiungere il campo alla costante (nell\'ordine del DOM) e la voce a `elementId`.',
  );
  process.exit(1);
}

console.log(
  `✅ check:colonne-nel-giro — ${colonneControllate} colonne su ${MASCHERE.length} cataloghi: ` +
    'ogni cella del giro gestito è raggiungibile da tastiera.',
);
