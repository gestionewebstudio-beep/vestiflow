/**
 * Innesta nella suite le riproduzioni dei difetti APERTI, e le ritira.
 *
 *   node api/src/test/riproduzioni/innesta.mjs             innesta
 *   node api/src/test/riproduzioni/innesta.mjs ripristina  ritira
 *
 * ⛔ **Le prove innestate sono ROSSE**, ed è il loro mestiere: riproducono
 *    difetti non ancora corretti (`docs/DA-FARE.md` §31.22). Chi le innesta
 *    deve ricordarsi di ritirarle, o lascia la suite rossa a chi viene dopo.
 *
 * ⚠️ Si lavora per SOSTITUZIONE di testo, non per posizione: se la coda della
 *    spec non è quella attesa lo script si ferma invece di scrivere a caso.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = path.dirname(fileURLToPath(import.meta.url));
const SPEC = path.join(QUI, '..', 'integration', 'invio-composto.integration-spec.ts');
const BLOCCO = path.join(QUI, 'allinea-verifiche-aperte.blocco.txt');
const COPIA = path.join(QUI, '.invio-composto.prima-dell-innesto');

/** La coda del file: chiude i tre `describe` annidati. */
const CODA = '\n    });\n  });\n});\n';
const SPIA = 'I-bis · la coda del ritentativo';

const modo = process.argv[2] ?? 'innesta';

if (modo === 'ripristina') {
  if (!fs.existsSync(COPIA)) {
    console.error('Nessuna copia di sicurezza: la spec non risulta innestata.');
    process.exit(1);
  }
  fs.writeFileSync(SPEC, fs.readFileSync(COPIA, 'utf8'));
  fs.unlinkSync(COPIA);
  console.log('Ritirate: la spec è tornata com era.');
  process.exit(0);
}

let spec = fs.readFileSync(SPEC, 'utf8');
if (spec.includes(SPIA)) {
  console.log('Già innestate: niente da fare.');
  process.exit(0);
}
if (!spec.endsWith(CODA)) {
  console.error('La coda della spec non è quella attesa: innesto annullato.');
  console.error('Ultimi caratteri: ' + JSON.stringify(spec.slice(-40)));
  process.exit(1);
}

fs.writeFileSync(COPIA, spec);
spec = spec.slice(0, spec.length - CODA.length) + '\n' + fs.readFileSync(BLOCCO, 'utf8') + CODA;
fs.writeFileSync(SPEC, spec);
console.log('Innestate le prove I, I-bis e J. ⛔ Sono ROSSE: ritirarle con «ripristina».');
