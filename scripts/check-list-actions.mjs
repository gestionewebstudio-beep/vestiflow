#!/usr/bin/env node
/**
 * ⛔ **La FORMA di un comando comune non si riscrive nella pagina.**
 *
 * Da quando ogni elenco dichiara le proprie azioni, il gestore e' giustamente
 * diverso — eliminare un documento non e' eliminare un fornitore — ma etichetta,
 * icona, variante e requisito venivano ridigitati ogni volta. Misurata la deriva
 * il 30/08/2026:
 *
 *     «print»    5 punti, 2 forme    ghost sui Corrispettivi, secondary altrove
 *     «csv»      4 punti, 3 forme    tre icone diverse per lo stesso formato
 *     «export»   7 punti, 2 forme    'Esporta' contro 'Esporta CSV'
 *
 * Il proprietario l'ha vista a schermo: lo stesso «Stampa» senza cornice su una
 * pagina e con la cornice su un'altra.
 *
 * ⭐ La forma sta nel catalogo (`shared/models/list-action-catalog.ts`), e la
 * pagina passa solo il gestore. Questa guardia fallisce se qualcuno torna a
 * scrivere `{ id: 'print', label: …, icon: … }` a mano.
 *
 * ⚠️ Non tocca gli id NON catalogati: `shopify-sync`, `import`, `movimenti` e
 * gli altri sono comandi di una pagina sola, e li' la forma e' loro.
 */
import { readFileSync, globSync } from 'node:fs';

const CATALOGO = 'src/app/shared/models/list-action-catalog.ts';
const testoCatalogo = readFileSync(CATALOGO, 'utf8');

/** Gli id catalogati si scoprono dal catalogo, non si elencano qui. */
function idsDa(nomeCostante) {
  const blocco = new RegExp('export const ' + nomeCostante + ' = \\{([\\s\\S]*?)\\n\\} as const');
  const m = blocco.exec(testoCatalogo);
  if (!m) {
    console.error(`check:list-actions — «${nomeCostante}» non trovata: guardia cieca.`);
    process.exit(1);
  }
  return [...m[1].matchAll(/^\s{2}(\w+):\s*\{/gm)].map((r) => r[1]);
}

const COMANDI = idsDa('CATALOGO_COMANDI');
const VOCI = idsDa('VOCI_ESPORTA');
if (COMANDI.length === 0 || VOCI.length === 0) {
  console.error('check:list-actions — catalogo vuoto: guardia cieca.');
  process.exit(1);
}

const file = globSync('src/app/**/*.component.ts').filter((f) => {
  const t = readFileSync(f, 'utf8');
  return t.includes('ListAction[]') || t.includes('ListActionItem[]');
});

let guasti = 0;
for (const f of file) {
  const righe = readFileSync(f, 'utf8').split(/\r?\n/);
  for (let i = 0; i < righe.length; i++) {
    const m = /^\s*id: '([\w-]+)',\s*$/.exec(righe[i]);
    if (!m) continue;
    const catalogato = COMANDI.includes(m[1])
      ? 'comando'
      : VOCI.includes(m[1])
        ? 'voceEsporta'
        : null;
    if (!catalogato) continue;
    guasti += 1;
    console.error(
      `  ${f.split('\\').join('/')}:${i + 1}  «${m[1]}» dichiarato a mano — usa ${catalogato}('${m[1]}', …)`,
    );
  }
}

if (guasti > 0) {
  console.error(
    `\ncheck:list-actions — ${guasti} comando/i con la forma riscritta nella pagina.\n` +
      `La forma sta in ${CATALOGO}: la pagina passa il gestore, e solo cio' che e'\n` +
      `davvero suo (disabled, busy, un'etichetta che DEVE differire).`,
  );
  process.exit(1);
}

console.log(
  `check:list-actions — ${file.length} pagine, ${COMANDI.length} comandi e ${VOCI.length} voci catalogati, nessuna forma riscritta.`,
);
