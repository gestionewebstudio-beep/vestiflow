/**
 * La COPERTURA dell'API come una misura sola: unità + integrazione sugli stessi sorgenti,
 * giudicata dalle soglie di `vitest.config.ts`.
 *
 * ⛔ **Perché non basta l'unitaria.** I servizi della sincronizzazione Shopify (prima
 *    connessione, trasferimento, recupero ordini, backfill dello storico, ciclo di vita
 *    dell'ordine) sono dimostrati dai percorsi di integrazione su PostgreSQL vero, non da
 *    prove con Prisma finto: misurati con la sola unitaria stavano al 64,5 % di righe
 *    (soglia 67), con l'integrazione al 78 % (14/09/2026, PR #9). Il gate misurava ciò che
 *    NON copriva questo codice.
 *
 * ⚠️ **Nessuna esclusione e nessuna soglia toccata**: stesso `include`/`exclude`, stesse
 *    soglie. Cambia solo QUANTE esecuzioni entrano nel conto.
 *
 * ⛔ **Se manca una delle due esecuzioni il controllo FALLISCE**, e lo dice: ogni corsa
 *    scrive il proprio blob (risultati + copertura) e un rapporto JSON col conteggio dei
 *    test; prima di unire si esige che entrambe abbiano eseguito test, tutti verdi. Un
 *    rapporto unito a metà darebbe un numero più basso senza dirlo — o più alto, se a
 *    mancare fosse la parte scoperta. Falsificato il 14/09/2026 con una corsa
 *    d'integrazione a zero test: il blob si scrive lo stesso, ed è il conteggio a fermare.
 *
 *   npm run test:coverage:completa --prefix api      (in CI nel job con PostgreSQL)
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const cartella = resolve('.vitest-reports');
// I rapporti JSON stanno FUORI dalla cartella dei blob: `--merge-reports` legge ogni file
// che trova lì e un JSON lo manda in errore (misurato il 14/09/2026).
const rapporti = resolve('.vitest-rapporti');
const CORSE = {
  unita: {
    config: [],
    blob: resolve(cartella, 'unita.blob'),
    json: resolve(rapporti, 'unita.json'),
  },
  integrazione: {
    config: ['--config', 'vitest.integration.config.ts'],
    blob: resolve(cartella, 'integrazione.blob'),
    json: resolve(rapporti, 'integrazione.json'),
  },
};
const SENZA_SOGLIE = [
  '--coverage.thresholds.lines=0',
  '--coverage.thresholds.functions=0',
  '--coverage.thresholds.branches=0',
  '--coverage.thresholds.statements=0',
];

function esegui(nome, argomenti) {
  console.log(`\n── ${nome}\n   npx vitest ${argomenti.join(' ')}`);
  const inizio = Date.now();
  const esito = spawnSync('npx', ['vitest', ...argomenti], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  console.log(`   (${Math.round((Date.now() - inizio) / 1000)} s, exit ${esito.status})`);
  return esito.status ?? 1;
}

/** Il rapporto JSON della corsa: quanti test ha eseguito, quanti rossi. */
function rapporto(nome, corsa, avvio) {
  for (const percorso of [corsa.blob, corsa.json]) {
    if (!existsSync(percorso) || statSync(percorso).mtimeMs < avvio) {
      return { errore: `manca il rapporto della corsa «${nome}» (${percorso})` };
    }
  }
  const json = JSON.parse(readFileSync(corsa.json, 'utf8'));
  const totali = Number(json.numTotalTests ?? 0);
  const rossi = Number(json.numFailedTests ?? 0) + Number(json.numFailedTestSuites ?? 0);
  if (totali === 0) {
    return { errore: `la corsa «${nome}» non ha eseguito nessun test: niente da unire` };
  }
  if (rossi > 0) {
    // Il reporter blob non stampa i fallimenti: li si nomina qui, dal rapporto JSON,
    // altrimenti in CI resta solo un numero (misurato il 14/09/2026: «3 test rossi»).
    const falliti = (json.testResults ?? []).flatMap((file) =>
      (file.assertionResults ?? [])
        .filter((t) => t.status === 'failed')
        .map((t) => `   × ${file.name.replace(/.*[\\/]src[\\/]/, 'src/')} › ${t.fullName}`),
    );
    const suiteRotte = (json.testResults ?? [])
      .filter((file) => file.status === 'failed' && (file.assertionResults ?? []).length === 0)
      .map((file) => `   × ${file.name.replace(/.*[\\/]src[\\/]/, 'src/')} (file non eseguibile)`);
    return {
      errore:
        `la corsa «${nome}» ha ${rossi} test rossi: la copertura non si giudica su test falliti\n` +
        [...falliti, ...suiteRotte].join('\n'),
    };
  }
  return { totali };
}

rmSync(cartella, { recursive: true, force: true });
rmSync(rapporti, { recursive: true, force: true });
const avvio = Date.now();

// Le due corse: ognuna salva blob e rapporto. Le soglie qui sono azzerate perché una
// corsa da sola non è la misura; un test rosso resta rosso e ferma sotto.
const esiti = {};
for (const [nome, corsa] of Object.entries(CORSE)) {
  esiti[nome] = esegui(nome, [
    'run',
    ...corsa.config,
    '--reporter=blob',
    '--reporter=json',
    `--outputFile.blob=${corsa.blob}`,
    `--outputFile.json=${corsa.json}`,
    '--coverage.enabled',
    '--coverage.reporter=json-summary',
    ...SENZA_SOGLIE,
  ]);
}

let fermo = false;
for (const [nome, corsa] of Object.entries(CORSE)) {
  const r = rapporto(nome, corsa, avvio);
  if (r.errore) {
    console.error(`\n⛔ ${r.errore}`);
    fermo = true;
  } else {
    console.log(`   ${nome}: ${r.totali} test eseguiti (exit ${esiti[nome]})`);
    if (esiti[nome] !== 0) {
      console.error(`\n⛔ la corsa «${nome}» è uscita con ${esiti[nome]}`);
      fermo = true;
    }
  }
}
if (fermo) {
  process.exit(1);
}

// L'unione: una misura sola, le soglie di vitest.config.ts.
process.exit(
  esegui('unione e soglie', [
    'run',
    '--merge-reports',
    cartella,
    '--coverage.enabled',
    '--coverage.reporter=text-summary',
    '--coverage.reporter=lcov',
  ]),
);
