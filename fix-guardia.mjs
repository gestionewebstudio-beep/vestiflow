import { readFileSync, writeFileSync } from 'node:fs';
const F = 'scripts/check-colonne-rese.mjs';
let t = readFileSync(F, 'utf8');
const eol = t.includes('\r\n') ? '\r\n' : '\n';
const N = (s) => s.split('\n').join(eol);

const a = N(`  /*
    Chi usa questo catalogo: il componente che importa una delle sue costanti.
    ⚠️ Si cerca per NOME della costante e non per percorso: alcuni cataloghi
    sono importati da più componenti, e basta che UNO renda la colonna.
  */
  const costanti = [...testo.matchAll(/export const (\w+_COLUMN_DEFS)/g)].map((m) => m[1]);
  const consumer = FILE.filter(
    (f) => /\.component\.ts$/.test(f) && costanti.some((c) => leggi(f).includes(c)),
  );
  if (consumer.length === 0) {
    continue;
  }`);

const b = N(`  /*
    ⛔ **Il renderer NON sta dove sta l'import.** La pagina importa il catalogo e
    lo passa a un componente tabella figlio (\`[columns]\`): è quello a rendere le
    celle. Cercando solo in chi importa, la prima stesura ha dato **venti falsi
    positivi** — tutte le colonne di Clienti dichiarate «non rese» mentre
    \`customer-table\` le rendeva tutte.

    ⭐ Si guarda quindi l'intera FEATURE: pagina e componenti tabella stanno
    sotto la stessa cartella, e basta che uno dei due renda la colonna.
  */
  const feature = catalogo.replace(/^(src\/app\/features\/[^/]+)\/.*$/, '$1');
  const consumer = FILE.filter((f) => f.startsWith(feature + '/') && /\.component\.ts$/.test(f));
  if (consumer.length === 0) {
    continue;
  }`);

if (t.split(a).length - 1 !== 1) { console.error('STOP blocco consumer'); process.exit(1); }
t = t.replace(a, b);

// Il messaggio non può più nominare "il" consumer: sono più d'uno.
const c = N(`        \`né un \\`case\\` in \${consumer.map((c) => c.split('/').pop()).join('/')} \` +
        \`né un \\`appCell\\`. Accendendola si ottiene una colonna vuota.\`,`);
const d = N(`        \`né un \\`case\\` né un \\`appCell\\` in \${feature.split('/').pop()}. \` +
        \`Accendendola si ottiene una colonna vuota.\`,`);
if (t.split(c).length - 1 !== 1) { console.error('STOP messaggio'); process.exit(1); }
t = t.replace(c, d);

writeFileSync(F, t, 'utf8');
console.log('ok');
