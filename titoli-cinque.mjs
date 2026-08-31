import { readFileSync, writeFileSync } from 'node:fs';

/*
  ⭐ Il titolo è ciò che dice DI CHE RIGA SI TRATTA. Su un documento è il numero,
  su un movimento è il prodotto: quello che l'operatore cerca scorrendo.

  ⛔ Corrispettivi resta fuori: ha una card PROGETTATA (`appRowCard`), non il
  ripiego a etichetta:valore — lì il titolo lo disegna già la schermata.
*/
const TITOLI = [
  [
    'src/app/features/documents/models/document-table-columns.config.ts',
    `  colonna('reference', { label: 'Numero', defaultVisible: true, display: 'code' }),`,
    `  colonna('reference', {
    label: 'Numero',
    defaultVisible: true,
    display: 'code',
    cardTitle: true,
  }),`,
  ],
  [
    'src/app/features/sales-orders/models/sales-order-list-columns.config.ts',
    `  { id: 'orderNumber', label: 'Ordine', pinnable: true, defaultVisible: true },`,
    `  { id: 'orderNumber', label: 'Ordine', pinnable: true, defaultVisible: true, cardTitle: true },`,
  ],
  [
    'src/app/features/orders/models/supplier-order-list-columns.config.ts',
    `  colonna('reference', { pinnable: true, defaultVisible: true }),`,
    `  colonna('reference', { pinnable: true, defaultVisible: true, cardTitle: true }),`,
  ],
  [
    'src/app/features/online-sales/models/online-sale-list-columns.config.ts',
    `  colonna('reference', { label: 'Numero', numeric: true, pinnable: true, defaultVisible: true }),`,
    `  colonna('reference', {
    label: 'Numero',
    numeric: true,
    pinnable: true,
    defaultVisible: true,
    cardTitle: true,
  }),`,
  ],
  [
    'src/app/features/inventory/models/stock-movements-table-columns.config.ts',
    `  { id: 'product', label: 'Prodotto', defaultVisible: true },`,
    `  { id: 'product', label: 'Prodotto', defaultVisible: true, cardTitle: true },`,
  ],
];

for (const [F, a, b] of TITOLI) {
  let t = readFileSync(F, 'utf8');
  const eol = t.includes('\r\n') ? '\r\n' : '\n';
  const x = a.split('\n').join(eol);
  const n = t.split(x).length - 1;
  if (n !== 1) {
    console.error(`STOP ${F} (${n})`);
    process.exit(1);
  }
  writeFileSync(F, t.replace(x, b.split('\n').join(eol)), 'utf8');
  console.log(`  ok  ${F}`);
}
