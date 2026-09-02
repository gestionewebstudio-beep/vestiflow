#!/usr/bin/env node
/**
 * check:id-fuoco — gli id che il giro del Tab CERCA devono esistere davvero.
 *
 * ⛔ IL DIFETTO CHE QUESTA GUARDIA PRENDE, misurato il 02/09/2026 sull'Ordine
 * fornitore: `DocumentLineFocusStore` cercava `po-suppcode-N`, ma la riga comune
 * rende quella cella come `po-supplier-code-N`. Il Tab su «Cod. fornitore» NON
 * ARRIVAVA — `focusField` non trovava l'elemento, tornava `false`, e `next()`
 * non guarda l'esito: il fuoco restava dov'era, e il Tab sembrava morto.
 *
 * ⚠️ **Non fallisce niente**: `document.getElementById` di un id inesistente non
 * lancia, non avvisa, non arrossa un test. Si vede solo premendo Tab su quel
 * campo, in quella maschera. È il difetto muto che questo progetto combatte.
 *
 * ⭐ La riga comune COMPONE gli id come `${idPrefix}-${alias}-${lineIndex}`, con
 * alias corti (`code`, `qty`, `supplier-code`); lo store li DICHIARA a mano in
 * `elementId`. Sono due elenchi che devono coincidere, e nessuno li confrontava:
 * il commento nell'Arrivo merce avvertiva del rischio, ma un commento non ferma
 * niente.
 */
import { readFileSync, existsSync } from 'node:fs';

const RIGA_COMUNE =
  'src/app/domain/documents/components/document-line-row/document-line-row.component.html';

/** Le maschere che montano la riga comune, col loro file .ts e .html. */
const MASCHERE = [
  ['Arrivo merce', 'src/app/features/documents/goods-receipt-form.component'],
  ['Fatture', 'src/app/features/documents/sales-document-form.component'],
  ['Movimento', 'src/app/features/documents/stock-operation-form.component'],
  ['Trasferimento', 'src/app/features/documents/transfer-form.component'],
  ['Ordine fornitore', 'src/app/features/orders/supplier-order-form.component'],
  ['Ordine cliente', 'src/app/features/sales-orders/customer-order-form.component'],
];

const leggi = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '');

const rigaComune = leggi(RIGA_COMUNE);
if (!rigaComune) {
  console.error('⛔ check:id-fuoco — non trovo la riga comune: ' + RIGA_COMUNE);
  process.exit(1);
}

/** Gli alias che la riga comune sa rendere: `cellId('...')`. */
const aliasResi = new Set([...rigaComune.matchAll(/cellId\('([\w-]+)'\)/g)].map((m) => m[1]));
if (aliasResi.size === 0) {
  console.error('⛔ check:id-fuoco — nessun `cellId(...)` nella riga comune: la guardia e cieca.');
  process.exit(1);
}

const problemi = [];
const nonLetti = [];
let campiControllati = 0;

for (const [nome, base] of MASCHERE) {
  const ts = leggi(base + '.ts');
  const html = leggi(base + '.html');
  if (!ts || !html) {
    nonLetti.push(nome + ' (file mancante)');
    continue;
  }

  // Il prefisso passato ALLA RIGA COMUNE: `<app-document-line-row ... idPrefix="po">`.
  // ⚠️ Va cercato vicino al tag della riga: le maschere hanno altri componenti con
  // un `idPrefix` proprio (il form «nuovo fornitore», per esempio).
  const bloccoRiga = html.match(/app-document-line-row[\s\S]{0,2000}?idPrefix="([\w-]+)"/);
  if (!bloccoRiga) {
    nonLetti.push(nome + ' (idPrefix della riga comune non trovato)');
    continue;
  }
  const prefisso = bloccoRiga[1];

  // Gli id dichiarati: `campo: \`pre-alias-${index}\`` in `elementId` o in un
  // metodo che lo implementa. Si cercano tutte le stringhe di quella forma.
  const coppie = [
    ...ts.matchAll(/(\w+):\s*`([\w-]+)-\$\{index\}`/g),
    ...ts.matchAll(/(\w+):\s*`([\w-]+)-`\s*\+\s*index/g),
  ].map((m) => ({ campo: m[1], id: m[2] }));

  if (coppie.length === 0) {
    nonLetti.push(nome + ' (nessun id di campo riconosciuto in elementId)');
    continue;
  }

  for (const { campo, id } of coppie) {
    if (!id.startsWith(prefisso + '-')) continue; // id di un altro componente
    const alias = id.slice(prefisso.length + 1);
    campiControllati += 1;
    // L'alias vale se lo rende la riga comune, o se la maschera lo rende da se'.
    const resoDallaComune = aliasResi.has(alias);
    const resoDallaMaschera =
      html.includes(`"${id}-`) || html.includes(`'${id}-`) || html.includes(`${id}-{{`);
    if (!resoDallaComune && !resoDallaMaschera) {
      problemi.push(
        `  ${nome}: il campo «${campo}» cerca l'id «${id}-N», che nessuno rende.\n` +
          `     alias vicini resi dalla riga comune: ${[...aliasResi]
            .filter((a) => a.includes(alias.slice(0, 4)) || alias.includes(a.slice(0, 4)))
            .join(', ') || '(nessuno simile)'}`,
      );
    }
  }
}

// ⚠️ Una maschera non letta NON e' un successo: la guardia lo dice e fallisce,
// perche' «zero problemi su zero controlli» è il modo in cui una guardia smette
// di guardare senza che nessuno se ne accorga.
if (nonLetti.length > 0) {
  console.error('⛔ check:id-fuoco — maschere non analizzate:');
  for (const n of nonLetti) console.error('  ' + n);
  console.error(
    '\n  Se una maschera ha cambiato forma, va aggiornato questo script: una guardia\n' +
      '  che salta in silenzio quello che non capisce non guarda niente.',
  );
  process.exit(1);
}

if (problemi.length > 0) {
  console.error('⛔ check:id-fuoco — il Tab non arriva su questi campi:\n');
  for (const p of problemi) console.error(p);
  console.error(
    '\n  La riga comune compone gli id come `${idPrefix}-${alias}-${indice}`, con gli\n' +
      '  alias di `cellId(...)`. Lo store deve dichiarare gli STESSI.\n' +
      '  Nessun test lo vede: `getElementById` di un id assente non fallisce.',
  );
  process.exit(1);
}

console.log(
  `✅ check:id-fuoco — ${campiControllati} campi su ${MASCHERE.length} maschere: ` +
    'gli id del giro del Tab esistono tutti.',
);
