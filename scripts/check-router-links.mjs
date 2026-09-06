#!/usr/bin/env node
/**
 * check:router-links — un `routerLink` con destinazione letterale è ASSOLUTO.
 *
 * ⛔ **Il difetto che questa guardia impedisce, misurato il 27/08/2026.** La
 * pagina Report portava `routerLink="corrispettivi"` — relativo, quindi
 * `/app/reports/corrispettivi`. Quella rotta era stata rimossa il 25/08, e il
 * commento che ne registrava la rimozione affermava «nel codice non ci puntava
 * più nessuno»: chi aveva misurato aveva cercato il percorso ASSOLUTO, e un
 * link relativo non contiene il percorso che apre.
 *
 * ⚠️ **Nessuno strumento se ne accorgeva.** `tsc` non legge i template; il
 * compilatore Angular valida il binding, non la destinazione; il lint non ha
 * regole di rotta; 4817 test passavano. Il difetto si vedeva solo cliccando.
 *
 * ⭐ **Perché la regola è «assoluto», e non «relativo se risolve».** Un link
 * relativo dipende da DOVE il componente è montato: sposti la rotta, e il link
 * cambia destinazione restando identico nel file. In VestiFlow le rotte si
 * dichiarano in `*.routes.ts` composti dalla radice, quindi un link assoluto
 * dice da solo dove va — e chi rimuove una rotta lo trova cercando.
 *
 * ⚠️ **Non verifica che la destinazione ESISTA**, e va detto invece di lasciarlo
 * credere: comporre l'albero delle rotte attraverso i `loadChildren` pigri è un
 * lavoro a sé. Questa guardia toglie la classe di difetto che si nasconde, non
 * tutte quelle possibili.
 *
 * Misura al momento della scrittura: 15 destinazioni assolute statiche, 11
 * assolute in binding letterale, **zero relative**.
 */
import fs from 'node:fs';
import path from 'node:path';

/** Stessa scansione delle altre guardie: nessuna dipendenza, nessuna API sperimentale. */
function percorri(dir, out = []) {
  for (const voce of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, voce.name);
    if (voce.isDirectory()) percorri(p, out);
    else if (p.endsWith('.html')) out.push(p);
  }
  return out;
}

const files = percorri('src');
const violazioni = [];

for (const file of files) {
  const righe = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  righe.forEach((riga, i) => {
    // forma statica: routerLink="qualcosa"
    for (const m of riga.matchAll(/(?<!\[)routerLink="([^"]*)"/g)) {
      const dest = m[1].trim();
      if (dest && !dest.startsWith('/')) {
        violazioni.push({ file, riga: i + 1, dest, forma: 'routerLink="…"' });
      }
    }
    // forma con binding, primo elemento letterale: [routerLink]="['qualcosa', …]"
    for (const m of riga.matchAll(/\[routerLink\]="\[\s*'([^']*)'/g)) {
      const dest = m[1].trim();
      if (dest && !dest.startsWith('/')) {
        violazioni.push({ file, riga: i + 1, dest, forma: "[routerLink]=\"['…']\"" });
      }
    }
  });
}

if (violazioni.length > 0) {
  console.error('\n⛔ check:router-links — destinazione RELATIVA in un routerLink letterale.\n');
  for (const v of violazioni) {
    console.error(`   ${v.file}:${v.riga}`);
    console.error(`     ${v.forma} → "${v.dest}"`);
    console.error(`     Un link relativo dipende da dove il componente è montato: scrivi il`);
    console.error(`     percorso assoluto (es. "/app/…"), così chi rimuove la rotta lo trova.\n`);
  }
  process.exit(1);
}

const statici = files.reduce((n, f) => n + [...fs.readFileSync(f, 'utf8').matchAll(/(?<!\[)routerLink="\/[^"]*"/g)].length, 0);
const binding = files.reduce((n, f) => n + [...fs.readFileSync(f, 'utf8').matchAll(/\[routerLink\]="\[\s*'\/[^']*'/g)].length, 0);
console.log(
  `✅ check:router-links — ${statici} destinazioni statiche + ${binding} in binding letterale, tutte assolute.`,
);
