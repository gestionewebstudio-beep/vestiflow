import { globSync, readFileSync } from 'node:fs';

/**
 * ⭐ **L'eliminazione a due conferme sta in UN posto solo.**
 *
 * Deciso dal proprietario il 30/08/2026: «doppio avviso sempre per elimina». La
 * sequenza vive in `app-delete-confirm`; questa guardia impedisce che qualcuno
 * la riscriva a mano, che è com'era prima — e la divergenza era già cominciata,
 * col secondo pulsante che diceva «Elimina definitivamente» in una schermata e
 * «Elimina» nell'altra.
 *
 * ⚠️ **Non controlla che l'eliminazione ci sia**: controlla che, dove c'è, la
 * sequenza non sia duplicata. Sono due cose diverse, e questa è quella che una
 * revisione umana non vede — due file lontani che divergono di una parola.
 */
const CASA = 'src/app/shared/components/delete-confirm/';

/** I segni di una sequenza a due passaggi scritta a mano. */
const SPIE = [
  { segno: 'Elimina definitivamente', perche: "l'etichetta del 2° passaggio" },
  { segno: 'deleteConfirmOpen', perche: 'il segnale del 2° modale' },
  { segno: "L'operazione non è reversibile.", perche: 'il testo del 2° passaggio' },
];

/**
 * ⛔ **I commenti non contano**, ed è la prima cosa che questa guardia ha
 * imparato: alla prima esecuzione ha accusato il commento che spiegava perché la
 * sequenza era stata spostata. Una guardia che inciampa nella propria
 * documentazione viene zittita, non corretta.
 */
function senzaCommenti(testo, file) {
  if (file.endsWith('.html')) {
    return testo.replaceAll(/<!--[\s\S]*?-->/g, '');
  }
  return testo.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/^\s*\/\/.*$/gm, '');
}

const file = globSync('src/**/*.{ts,html}').filter(
  (f) => !f.replaceAll('\\', '/').startsWith(CASA) && !f.endsWith('.spec.ts'),
);

const colpevoli = [];
for (const f of file) {
  const testo = senzaCommenti(readFileSync(f, 'utf8'), f);
  for (const { segno, perche } of SPIE) {
    if (testo.includes(segno)) {
      colpevoli.push(`  ⛔ ${f.replaceAll('\\', '/')}\n     «${segno}» — ${perche}`);
    }
  }
}

if (colpevoli.length > 0) {
  console.error(
    `\n⛔ ${colpevoli.length} traccia/e di eliminazione a due conferme scritta a mano:\n\n` +
      colpevoli.join('\n') +
      `\n\n⭐ La sequenza è di \`app-delete-confirm\`: passa \`title\` e \`consequence\`,\n` +
      `   e il secondo passaggio lo mette lui — sempre uguale, in tutta l'app.\n`,
  );
  process.exit(1);
}

console.log(
  `✓ elimina: la sequenza a due conferme sta in un posto solo (${file.length} file controllati).`,
);
