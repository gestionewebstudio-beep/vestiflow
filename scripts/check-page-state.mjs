/**
 * Lo stato di pagina di un documento e' UNA macchina, e ha sempre il suo motivo.
 *
 * ```text
 * loading → error → not-found → il documento
 * ```
 *
 * ## ⛔ Che cosa vieta, e perche' ognuna delle due
 *
 * **1. La terna scritta a mano.** Prima dell'estrazione i sette consumer
 * avevano lo stesso ordine di precedenza e gli stessi componenti, ma tre
 * descrizioni d'errore diverse — «…il documento», «…l'ordine», «…l'ordine
 * cliente» — e uno scheletro da cinque righe invece di sei. La stessa cosa
 * detta con la parola del tipo: e' la deriva che questa guardia chiude.
 *
 * **2. Un `app-document-page-state` senza il suo motivo.** Il ramo
 * `not-found` proietta il contenuto del consumer: se manca l'attributo
 * `documentPageStateBlocked`, il componente rende IL NULLA e la maschera
 * mostra una pagina vuota.
 *
 * ⚠️ **Non e' teorico: e' successo durante l'estrazione stessa.** Su una delle
 * sette l'attributo non e' stato aggiunto, e a trovarlo e' stata l'unica prova
 * in tutta l'app che tocca questi stati — quella del banco sulla lettura
 * fallita. Le altre sei non hanno prove su `loading` e `not-found`, quindi
 * sarebbero passate rotte.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const RADICI = [
  'src/app/features/documents',
  'src/app/features/orders',
  'src/app/features/sales-orders',
  'src/app/features/store-sales',
  'src/app/features/inventory',
];

function templateDiMaschera(cartella, trovati = []) {
  let voci;
  try {
    voci = readdirSync(cartella);
  } catch {
    return trovati;
  }
  for (const voce of voci) {
    const percorso = join(cartella, voce);
    if (statSync(percorso).isDirectory()) {
      templateDiMaschera(percorso, trovati);
      continue;
    }
    if (/form\.component\.html$/.test(voce)) trovati.push(percorso);
  }
  return trovati;
}

const rigaDi = (testo, indice) => testo.slice(0, indice).split(/\r?\n/).length;

const violazioni = [];
let montate = 0;

for (const radice of RADICI) {
  for (const percorso of templateDiMaschera(radice)) {
    const testo = readFileSync(percorso, 'utf8');
    const rel = relative(process.cwd(), percorso);

    // 1. la terna scritta a mano
    const aMano = testo.indexOf('@if (loading()) {');
    if (aMano >= 0) {
      violazioni.push({
        file: rel,
        riga: rigaDi(testo, aMano),
        problema: 'terna scritta a mano: usa <app-document-page-state>',
      });
    }

    // 2. il motivo proiettato
    let da = 0;
    for (;;) {
      const inizio = testo.indexOf('<app-document-page-state', da);
      if (inizio < 0) break;
      montate++;
      const fine = testo.indexOf('</app-document-page-state>', inizio);
      const autochiuso = testo.slice(inizio, inizio + 400).includes('/>') && fine < 0;
      const blocco = fine < 0 ? testo.slice(inizio, inizio + 400) : testo.slice(inizio, fine);
      if (autochiuso || !blocco.includes('documentPageStateBlocked')) {
        violazioni.push({
          file: rel,
          riga: rigaDi(testo, inizio),
          problema:
            'nessun `documentPageStateBlocked`: il ramo «non modificabile» renderebbe il nulla',
        });
      }
      da = fine < 0 ? inizio + 1 : fine + 1;
    }
  }
}

if (violazioni.length === 0) {
  console.log(
    `✅ check:page-state — la macchina degli stati e' una sola, e ognuna porta il suo motivo ` +
      `(${montate} maschere).`,
  );
  process.exit(0);
}

console.error('\n⛔ Lo stato di pagina non e\' quello comune.\n');
for (const v of violazioni) {
  console.error(`   ${v.file}:${v.riga}  ${v.problema}`);
}
console.error('');
process.exit(1);
