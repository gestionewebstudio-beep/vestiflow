#!/usr/bin/env node
/**
 * ⛔ **Chi scrive una riga documento deve fotografare la variante.**
 *
 * `variant_label` è la colonna dove vive l'etichetta della variante — «M /
 * Rosso» — separata dalla descrizione, che porta il solo nome del prodotto
 * (`docs/03d` §6, `CONTRATTO-COMUNE-DOCUMENTI` §3.2). Esiste su tre tabelle di
 * riga: `document_lines`, `sales_order_lines`, `supplier_order_lines`.
 *
 * ⚠️ **La colonna ha `DEFAULT ''`, e quel default è una trappola.** Serve alle
 * righe salvate prima che la colonna esistesse; per un writer nuovo è un modo
 * di non accorgersi di niente: la scrittura riesce, il documento si salva, e
 * la variante semplicemente non compare — su quella famiglia di documenti e
 * solo su quella. Nessun errore, nessun test rosso.
 *
 * Il compilatore copre i compositori che passano da un tipo dove il campo è
 * obbligatorio. **Non copre chi costruisce l'oggetto `data` a mano**, ed è
 * esattamente il punto in cui un writer nuovo si aggiungerebbe.
 *
 * ⭐ Il controllo è volutamente **grossolano**: chiede che il file che scrive
 * su una di quelle tabelle nomini `variantLabel` da qualche parte. Non
 * verifica che lo faccia bene — quello lo fanno i test. Verifica che ci abbia
 * pensato.
 *
 * ── Due regimi, e la differenza è nell'identità della riga ─────────────────
 *
 * ```text
 * document_lines · sales_order_lines    snapshot PER ID
 *   il salvataggio aggiorna le righe esistenti, quindi il server ritrova il
 *   valore persistito e lo conserva: `document-line-variant-snapshot.util`
 *
 * supplier_order_lines                  etichetta NEL PAYLOAD
 *   il salvataggio e' deleteMany + create: le righe perdono l'id e non c'e'
 *   un persistito da ritrovare. La fotografa la maschera.
 *   ⛔ Temporaneo (24/08/2026): non e' la soluzione all'identita' delle righe.
 * ```
 */
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';

/**
 * Le scritture sulle tre tabelle di riga che portano la colonna.
 *
 * ⚠️ **Due forme, non una**, e la seconda è quella che sfuggiva: l'Ordine
 * fornitore non chiama mai `supplierOrderLine.create` — scrive le righe
 * ANNIDATE dentro `supplierOrder.create({ lines: { create: … } })`. Con la sola
 * prima forma la guardia lo assolveva senza nemmeno guardarlo, ed è stato
 * misurato provandola: rinominato il campo, restava verde.
 *
 * La seconda forma cerca il TIPO Prisma della riga da creare, che è il nome
 * che compare in chi compone i dati comunque li scriva.
 */
const SCRITTURE = [
  /\b(documentLine|salesOrderLine|supplierOrderLine)\.(create|createMany|update|updateMany|upsert)\b/,
  /\bPrisma\.(DocumentLine|SalesOrderLine|SupplierOrderLine)(Create|Update)\w*Input\b/,
];

const scrive = (testo) => SCRITTURE.some((re) => re.test(testo));

/**
 * Chi scrive senza comporre, e quindi non deve nominare il campo.
 *
 * ⚠️ Un'esenzione è una **dichiarazione**, non una scorciatoia: si aggiunge
 * solo se il file davvero non decide il valore, e la ragione si scrive qui.
 */
const ESENTI = new Map([
  [
    'api/src/documents/document-line-upsert.util.ts',
    'motore di persistenza generico: riceve i dati già composti da `params.toData(line)`, non decide nulla',
  ],
  [
    'api/src/tenant/tenant-backup/tenant-backup-import.service.ts',
    'ripristino: rimette le righe come stavano nel backup, colonna compresa. Comporre qui riscriverebbe documenti emessi',
  ],
  [
    'api/src/documents/document-supplier-order.util.ts',
    'aggiorna la sola `receivedQuantity` quando arriva la merce: non tocca nessuna colonna descrittiva',
  ],
]);

const BARRA_ROVESCIA = String.fromCharCode(92);
const BARRA = String.fromCharCode(47);

const file = globSync('api/src/**/*.ts').filter((f) => !f.endsWith('.spec.ts'));
const colpevoli = [];

for (const f of file) {
  const percorso = f.split(BARRA_ROVESCIA).join(BARRA);
  const testo = readFileSync(f, 'utf8');
  if (!scrive(testo)) continue;
  if (ESENTI.has(percorso)) continue;

  // Il nome INTERO, non come sottostringa: un `variantLabelQualcosa` non è il
  // campo, e farlo passare renderebbe il controllo inutile — è la prima
  // versione di questa riga, che usava `includes` e assolveva chiunque avesse
  // quelle tredici lettere in fila da qualche parte.
  if (/(?<![A-Za-z0-9_])variantLabel(?![A-Za-z0-9_])/.test(testo)) continue;

  const righe = testo.split('\n');
  const riga = righe.findIndex((l) => scrive(l)) + 1;
  const tabella = SCRITTURE.map((re) => re.exec(testo)?.[1]).find(Boolean) ?? '?';
  colpevoli.push(`${percorso}:${riga} — scrive su ${tabella} senza fotografare la variante`);
}

if (colpevoli.length > 0) {
  console.error('\n✗ righe documento scritte senza `variantLabel`:\n');
  for (const c of colpevoli) console.error(`  ${c}`);
  console.error(
    "\n  La colonna ha DEFAULT '': senza il campo la scrittura RIESCE e la variante\n" +
      '  sparisce in silenzio, su quella famiglia di documenti e solo su quella.\n\n' +
      '  La regola dello snapshot per id vive in un punto solo:\n' +
      '    api/src/documents/document-line-variant-snapshot.util.ts\n\n' +
      "  Sull'Ordine fornitore l'etichetta arriva invece dal payload, perche' il\n" +
      '  salvataggio ricrea le righe: vedi il commento in testa a questo file.\n\n' +
      '  Se questo file non compone davvero le righe, dichiaralo fra gli ESENTI\n' +
      '  di scripts/check-variant-label.mjs, con la ragione.\n',
  );
  process.exit(1);
}

console.log('✓ ogni writer di riga documento fotografa la variante');
