/**
 * Il motore dei documenti conosce la GRAMMATICA, non i NOMI dei documenti.
 *
 * ⛔ **Il criterio architetturale piu' importante del lavoro sulle maschere
 * documento**, e l'unico che si puo' far rispettare a una macchina.
 *
 * Il livello condiviso deve ragionare per concetti — campo, banda, riga,
 * colonna, azione, totale, prerequisito, effetto — e mai per tipo:
 *
 *     ⛔  if (documentType === 'invoice') { ... }
 *     ⛔  if (tipo === DocumentType.GoodsReceipt) { ... }
 *     ✅  if (haControllo('unitPrice')) { ... }
 *     ✅  if (isColumnVisible()('articleCode')) { ... }
 *
 * Il primo giorno in cui un `if` per tipo entra nel motore, l'astrazione ha
 * smesso di essere un'astrazione: e' diventata un contenitore di casi
 * particolari, e ogni documento nuovo dovra' toccarlo.
 *
 * ⚠️ **Perche' una guardia e non solo una regola scritta.** Una regola la
 * ricorda chi l'ha letta. Questo controllo gira dentro `npm run lint`, quindi
 * lo incontra chiunque, anche fra un anno, anche senza sapere che esiste.
 *
 * ## Che cosa NON controlla, di proposito
 *
 * - i `*.spec.ts`: una prova deve poter nominare un tipo concreto, o non
 *   eserciterebbe niente;
 * - i componenti di dominio che implementano una funzione legata a un tipo
 *   (per esempio il pannello «Includi documento», che sa di poter includere
 *   preventivi). Quelli non sono il motore: il perimetro qui sotto e' l'elenco
 *   esplicito dei pezzi che compongono riga, testata e card.
 *
 * Allargare il perimetro e' benvenuto; allargarlo a tutto `domain/documents`
 * no, perche' renderebbe la guardia rossa per casi legittimi e la prima cosa
 * che si farebbe sarebbe spegnerla.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** I pezzi che compongono la riga, la testata e la card: il motore vero. */
const PERIMETRO = [
  'src/app/domain/documents/components/document-line-card',
  'src/app/domain/documents/components/document-line-row',
  'src/app/domain/documents/components/document-line-head',
  'src/app/domain/documents/components/document-line-quick-row',
  'src/app/domain/documents/components/document-line-code-cell',
  'src/app/domain/documents/components/document-line-money-cell',
  'src/app/domain/documents/components/document-line-product-cell',
  'src/app/domain/documents/components/document-line-select-cell',
  'src/app/domain/documents/components/document-line-unit-cell',
  'src/app/domain/documents/components/document-header',
  'src/app/domain/documents/components/document-totals',
];

/**
 * I valori dell'enum `DocumentType`, come stringhe.
 *
 * ⚠️ Tenuti in chiaro e non importati: questo script gira prima e fuori dalla
 * compilazione, e un import dal sorgente Angular lo legherebbe alla build.
 * Se l'enum cresce, questa lista va aggiornata — ed e' il momento giusto per
 * chiedersi se il tipo nuovo stia per entrare nel motore.
 */
const TIPI = [
  'sales_order',
  'quote',
  'delivery_note',
  'proforma',
  'invoice',
  'invoice_accompanying',
  'credit_note',
  'goods_receipt',
  'supplier_order',
  'transfer',
  'stock_adjustment',
  'physical_inventory',
  'manual_unload',
  'store_sale',
  'store_return',
  'purchase_invoice',
];

const NOMI_ENUM = [
  'DocumentType.',
  'StoreSaleMode.',
];

function fileDaControllare(cartella) {
  const trovati = [];
  let voci;
  try {
    voci = readdirSync(cartella);
  } catch {
    // Una cartella del perimetro che non esiste piu' non e' un errore di
    // architettura: e' una rinomina. Si segnala a parte, non si fallisce qui.
    return trovati;
  }
  for (const voce of voci) {
    const percorso = join(cartella, voce);
    if (statSync(percorso).isDirectory()) {
      trovati.push(...fileDaControllare(percorso));
      continue;
    }
    if (!/\.(ts|html)$/.test(voce)) continue;
    if (voce.endsWith('.spec.ts')) continue;
    trovati.push(percorso);
  }
  return trovati;
}

const violazioni = [];
const cartelleAssenti = [];

for (const cartella of PERIMETRO) {
  const file = fileDaControllare(cartella);
  if (file.length === 0) {
    cartelleAssenti.push(cartella);
    continue;
  }
  for (const percorso of file) {
    const righe = readFileSync(percorso, 'utf8').split('\n');
    righe.forEach((riga, indice) => {
      // Un commento che SPIEGA la regola puo' nominare i tipi: e' il caso di
      // questo stesso script, e di ogni «⛔ qui non deve entrare `invoice`».
      const senzaCommento = riga.replace(/\/\/.*$/, '').replace(/\*.*$/, '');

      for (const tipo of TIPI) {
        if (senzaCommento.includes(`'${tipo}'`) || senzaCommento.includes(`"${tipo}"`)) {
          violazioni.push({ percorso, riga: indice + 1, trovato: `'${tipo}'`, testo: riga.trim() });
        }
      }
      for (const enumerazione of NOMI_ENUM) {
        if (senzaCommento.includes(enumerazione)) {
          violazioni.push({
            percorso,
            riga: indice + 1,
            trovato: enumerazione,
            testo: riga.trim(),
          });
        }
      }
    });
  }
}

if (cartelleAssenti.length > 0) {
  console.warn(
    `\n⚠️  check:document-grammar — ${cartelleAssenti.length} cartelle del perimetro non esistono o sono vuote:`,
  );
  for (const cartella of cartelleAssenti) console.warn(`   ${cartella}`);
  console.warn(
    '   Se sono state rinominate, aggiorna PERIMETRO in scripts/check-document-grammar.mjs:\n' +
      '   una guardia che non guarda niente e’ peggio di nessuna guardia.\n',
  );
}

if (violazioni.length === 0) {
  console.log(
    `✅ check:document-grammar — il motore documenti non nomina tipi documento ` +
      `(${PERIMETRO.length - cartelleAssenti.length} cartelle controllate).`,
  );
  process.exit(0);
}

console.error('\n⛔ Il motore dei documenti sta nominando dei TIPI DOCUMENTO.\n');
console.error('   Il livello condiviso deve conoscere la grammatica — campo, banda, riga,');
console.error('   colonna, azione, totale — non i nomi dei documenti. Un `if` per tipo qui');
console.error('   dentro obbliga ogni documento futuro a passare da questo file.\n');
for (const v of violazioni) {
  console.error(`   ${relative(process.cwd(), v.percorso)}:${v.riga}  →  ${v.trovato}`);
  console.error(`      ${v.testo}`);
}
console.error(
  '\n   La differenza da chiedere e’ al gruppo di controlli o alla configurazione:\n' +
    '     ⛔ if (documentType === ‘invoice’)\n' +
    '     ✅ if (haControllo(‘unitPrice’))    ✅ if (isColumnVisible()(‘articleCode’))\n',
);
process.exit(1);
