#!/usr/bin/env node
/**
 * check:ripubblicazione-interna — la ripubblicazione di un disallineamento
 * resta un percorso INTERNO, e non diventa un invio forzato a disposizione di
 * chiunque.
 *
 * ⭐ **La regola che difende**, dal mandato del proprietario del 09/09/2026:
 *
 *      Superare il confronto con l'ultimo inviato SOLTANTO nel percorso
 *      interno di recupero del disallineamento.
 *      Nessun parametro di forzatura esposto all'operatore.
 *
 * ⛔ **Senza questa guardia il vincolo era solo un commento.** Il metodo
 *    `ripubblicaDisallineamento` e' pubblico su un provider esportato dal
 *    modulo Shopify e iniettato da altri servizi: niente, nel linguaggio,
 *    impediva a un secondo chiamante di usarlo — e nessuna prova sarebbe
 *    diventata rossa. Un vincolo che nessuno verifica non e' un vincolo.
 *
 * Verifica due cose, e la seconda e' quella che conta:
 *
 *   1. `ripubblicaDisallineamento` e' chiamato SOLO dal ritentativo delle
 *      quantita' (piu' la propria definizione e le prove);
 *   2. la bandiera interna che fa saltare il confronto e' passata accesa da
 *      QUELLA sola porta: se domani `pushLevel` la accendesse, il sorpasso
 *      diventerebbe la regola per i suoi quattro chiamanti ordinari — che sono
 *      documenti, movimenti, riconciliazione e la porta unica dei canali.
 *
 * ⚠️ **Che cosa NON copre.** E' analisi statica del testo: vede una chiamata
 *    scritta, non una raggiunta per riflessione o costruita a runtime. Per
 *    quelle valgono le prove, che verificano il comportamento.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROSSO = '[31m';
const VERDE = '[32m';
const GRASSETTO = '[1m';
const FINE = '[0m';

const PORTA = 'ripubblicaDisallineamento';
const FILE_PUSH = path.join('api', 'src', 'shopify', 'shopify-inventory-push.service.ts');
const FILE_RITENTATIVO = path.join(
  'api',
  'src',
  'shopify',
  'shopify-inventory-republish.service.ts',
);

/** I soli file applicativi in cui il nome puo' comparire. */
const AMMESSI = new Set([FILE_PUSH, FILE_RITENTATIVO]);

/** Le prove possono nominarlo: e' il loro mestiere. */
function eUnaProva(relativo) {
  return (
    relativo.includes('.spec.') ||
    relativo.includes('integration-spec') ||
    relativo.split(path.sep).includes('test')
  );
}

function file(radice, estensioni) {
  const trovati = [];
  const visita = (dir) => {
    for (const voce of fs.readdirSync(dir, { withFileTypes: true })) {
      if (voce.name === 'node_modules' || voce.name === 'dist' || voce.name.startsWith('.')) {
        continue;
      }
      const pieno = path.join(dir, voce.name);
      if (voce.isDirectory()) {
        visita(pieno);
      } else if (estensioni.some((e) => voce.name.endsWith(e))) {
        trovati.push(pieno);
      }
    }
  };
  if (fs.existsSync(radice)) {
    visita(radice);
  }
  return trovati;
}

const guasti = [];

// ── 1 · chi nomina la porta di recupero ──────────────────────────────────────
const sorgenti = [...file(path.join('api', 'src'), ['.ts']), ...file(path.join('src'), ['.ts'])];
let chiamantiApplicativi = 0;
for (const pieno of sorgenti) {
  const relativo = path.relative('.', pieno);
  const testo = fs.readFileSync(pieno, 'utf8');
  if (!testo.includes(PORTA)) {
    continue;
  }
  if (eUnaProva(relativo)) {
    continue;
  }
  if (!AMMESSI.has(relativo)) {
    guasti.push(
      `${relativo} nomina ${PORTA}. La ripubblicazione e' un percorso interno del ` +
        'ritentativo delle quantita\': un secondo chiamante la trasformerebbe in un invio ' +
        'forzato, che il mandato vieta.',
    );
    continue;
  }
  if (relativo === FILE_RITENTATIVO) {
    chiamantiApplicativi += 1;
  }
}

if (chiamantiApplicativi === 0) {
  guasti.push(
    `${FILE_RITENTATIVO} non chiama piu' ${PORTA}: il ritentativo sarebbe tornato a usare ` +
      "la porta ordinaria, e il disallineamento canonico tornerebbe a non ripubblicarsi.",
  );
}

// ── 2 · la bandiera interna si accende da UNA porta sola ─────────────────────
if (!fs.existsSync(FILE_PUSH)) {
  guasti.push(`${FILE_PUSH} non esiste piu': questa guardia va riscritta, non tolta.`);
} else {
  const testo = fs.readFileSync(FILE_PUSH, 'utf8');
  // Le chiamate alla privata condivisa, con la bandiera del recupero.
  const chiamate = [...testo.matchAll(/return this\.esegui\(([^;]*?)\);/gs)];
  if (chiamate.length !== 2) {
    guasti.push(
      `${FILE_PUSH}: attese 2 chiamate a esegui(), trovate ${chiamate.length}. ` +
        'Se il corpo condiviso ha cambiato forma, questa guardia va aggiornata insieme.',
    );
  }
  for (const chiamata of chiamate) {
    const accesa = /,\s*true\s*$/.test(chiamata[1].trim());
    // Il metodo che la contiene: l'ultima dichiarazione prima della chiamata.
    const prima = testo.slice(0, chiamata.index);
    const dichiarazioni = [...prima.matchAll(/async\s+([A-Za-z0-9_]+)\s*\(/g)];
    const contenitore = dichiarazioni.at(-1)?.[1] ?? '(sconosciuto)';
    if (accesa && contenitore !== PORTA) {
      guasti.push(
        `${FILE_PUSH}: la bandiera del recupero e' accesa dentro ${contenitore}(). ` +
          `Solo ${PORTA}() puo' accenderla: da qualunque altra porta il sorpasso del ` +
          "confronto con l'ultimo inviato diventerebbe la regola per i push ordinari.",
      );
    }
    if (!accesa && contenitore === PORTA) {
      guasti.push(
        `${FILE_PUSH}: ${PORTA}() non accende piu' la bandiera del recupero: ` +
          'il disallineamento canonico tornerebbe a non ripubblicarsi, in silenzio.',
      );
    }
  }
}

if (guasti.length > 0) {
  console.error(`${ROSSO}${GRASSETTO}⛔ check:ripubblicazione-interna${FINE}`);
  for (const g of guasti) {
    console.error(`${ROSSO}   · ${g}${FINE}`);
  }
  process.exit(1);
}

console.log(
  `${VERDE}✅ check:ripubblicazione-interna — la ripubblicazione del disallineamento resta ` +
    "interna al ritentativo, e la bandiera che supera il confronto con l'ultimo inviato si " +
    `accende da una porta sola.${FINE}`,
);
