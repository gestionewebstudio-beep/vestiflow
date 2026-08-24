#!/usr/bin/env node
/**
 * ⛔ **Chi scrive una riga documento deve fotografare la variante.**
 *
 * `document_lines.variant_label` è la colonna dove vive l'etichetta della
 * variante — «M / Rosso» — separata dalla descrizione, che porta il solo nome
 * del prodotto (`docs/03d` §6, `CONTRATTO-COMUNE-DOCUMENTI` §3.2).
 *
 * ⚠️ **La colonna ha `DEFAULT ''`, e quel default è una trappola.** Serve alle
 * righe salvate prima che la colonna esistesse; per un writer nuovo è un modo
 * di non accorgersi di niente: la scrittura riesce, il documento si salva, e
 * la variante semplicemente non compare — su quella famiglia di documenti e
 * solo su quella. Nessun errore, nessun test rosso.
 *
 * Il compilatore copre i compositori che passano da `ComputedLine`, dove il
 * campo è obbligatorio. **Non copre chi costruisce l'oggetto `data` a mano**,
 * che oggi sono due su quattro — ed è esattamente il punto in cui un writer
 * nuovo si aggiungerebbe.
 *
 * ⭐ Il controllo è volutamente **grossolano**: chiede che il file che scrive
 * su `documentLine` nomini `variantLabel` da qualche parte. Non verifica che
 * lo faccia bene — quello lo fanno i test. Verifica che ci abbia pensato.
 *
 * La regola dello snapshot sta in un punto solo:
 * `api/src/documents/document-line-variant-snapshot.util.ts`.
 */
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';

/** Le scritture Prisma su `document_lines`. */
const SCRITTURE = /\bdocumentLine\.(create|createMany|update|updateMany|upsert)\b/;

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
]);

const file = globSync('api/src/**/*.ts').filter((f) => !f.endsWith('.spec.ts'));
const colpevoli = [];

for (const f of file) {
  const percorso = f.split(String.fromCharCode(92)).join(String.fromCharCode(47));
  const testo = readFileSync(f, 'utf8');
  if (!SCRITTURE.test(testo)) continue;
  if (ESENTI.has(percorso)) continue;
  if (testo.includes('variantLabel')) continue;

  const riga = testo.split('\n').findIndex((l) => SCRITTURE.test(l)) + 1;
  colpevoli.push(`${percorso}:${riga} — scrive su document_lines senza fotografare la variante`);
}

if (colpevoli.length > 0) {
  console.error('\n✗ righe documento scritte senza `variantLabel`:\n');
  for (const c of colpevoli) console.error(`  ${c}`);
  console.error(
    '\n  La colonna ha DEFAULT \'\': senza il campo la scrittura RIESCE e la variante\n' +
      '  sparisce in silenzio, su quella famiglia di documenti e solo su quella.\n\n' +
      '  La regola dello snapshot vive in un punto solo:\n' +
      '    api/src/documents/document-line-variant-snapshot.util.ts\n\n' +
      '  Se questo file non compone davvero le righe, dichiaralo fra gli ESENTI\n' +
      '  di scripts/check-variant-label.mjs, con la ragione.\n',
  );
  process.exit(1);
}

console.log('✓ ogni writer di document_lines fotografa la variante');
