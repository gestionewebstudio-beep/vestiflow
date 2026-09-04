#!/usr/bin/env node
/**
 * check:integration-db — la suite di integrazione non può raggiungere DEV.
 *
 * ⛔ **Il difetto che questa guardia impedisce non è ipotetico: è la forma
 *    esatta trovata sei volte nel backend** dall'audit di sede (`docs/21`).
 *    Una protezione esiste nel codice, qualcuno la scavalca senza accorgersene,
 *    e i test restano verdi perché non è la protezione che stanno provando.
 *
 *    Qui lo scavalcamento costerebbe caro: `DATABASE_URL` è il database di
 *    sviluppo CONDIVISO col collega, e la suite di integrazione cancella dati.
 *
 * Quattro regole. Le prime tre sui soli file `*.integration-spec.ts` e sul loro supporto:
 *
 *   R1 · nessun import di `PrismaService`. È il componente che NON fa override
 *        del datasource: costruisce `super({ transactionOptions })` e legge
 *        `DATABASE_URL` dall'ambiente. Usarlo qui significa affidare
 *        l'isolamento a una variabile invece che al codice.
 *
 *   R2 · nessuna menzione di `DATABASE_URL` / `DIRECT_URL` (i nomi DEV). La
 *        connessione si chiede a `ambienteIntegrazione()`, che è l'unico punto
 *        che la risolve e l'unico che applica le barriere.
 *
 *   R3 · nessun `new PrismaClient(` senza `datasources`. Un client costruito
 *        nudo prende l'URL dall'ambiente, ed è la strada per DEV.
 *
 *   R4 · il BERSAGLIO (host, porta, nome del database) dichiarato da `env.ts`
 *        e da `prisma-deploy-test.mjs` deve coincidere. Sono duplicati per
 *        forza, e una porta cambiata in un posto solo lascerebbe il comando
 *        che SCRIVE lo schema con un controllo più debole della suite.
 *
 * ⭐ La guardia si applica anche quando i file di integrazione sono ZERO: serve
 *    a chi li scriverà, non a chi li ha scritti.
 */
import fs from 'node:fs';
import path from 'node:path';

const RADICE = 'api/src';
const SUFFISSO = '.integration-spec.ts';
/** Il supporto condiviso: stesse regole, tranne dove la barriera è definita. */
const SUPPORTO = path.join('api', 'src', 'test', 'integration');
/**
 * Gli unici file autorizzati a nominare la connessione DEV.
 *
 * `env.ts` e `setup.ts` la DEFINISCONO: sono il posto dove la barriera vive.
 *
 * ⚠️ `barriere.integration-spec.ts` è autorizzato perché la VERIFICA: asserisce
 *    che `DATABASE_URL` sia stata neutralizzata, che è l'opposto di usarla. Ed
 *    è il file che ha già scoperto una protezione falsa una volta.
 */
const AUTORIZZATI = new Set([
  path.join(SUPPORTO, 'env.ts'),
  path.join(SUPPORTO, 'setup.ts'),
  path.join(SUPPORTO, 'barriere.integration-spec.ts'),
]);

function percorri(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const voce of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, voce.name);
    if (voce.isDirectory()) {
      if (voce.name !== 'node_modules' && voce.name !== 'dist') percorri(p, out);
    } else if (voce.name.endsWith('.ts')) {
      out.push(p);
    }
  }
  return out;
}

const violazioni = [];
let controllati = 0;

for (const file of percorri(RADICE)) {
  const normalizzato = path.normalize(file);
  const eIntegrazione =
    file.endsWith(SUFFISSO) || normalizzato.startsWith(path.normalize(SUPPORTO));
  if (!eIntegrazione) continue;
  controllati++;

  const righe = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const autorizzato = AUTORIZZATI.has(normalizzato);

  righe.forEach((riga, i) => {
    const posizione = `${file.replace(/\\/g, '/')}:${i + 1}`;
    // I commenti spiegano le regole: non sono il codice che le viola.
    const codice = riga.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');

    if (/\bPrismaService\b/.test(codice)) {
      violazioni.push([
        posizione,
        'importa PrismaService, che NON fa override del datasource: legge',
        'DATABASE_URL dall’ambiente, cioè DEV. Usa creaClientIntegrazione().',
      ]);
    }
    if (!autorizzato && /\b(DATABASE_URL|DIRECT_URL)\b(?!_TEST)/.test(codice)) {
      violazioni.push([
        posizione,
        'nomina la connessione DEV. La connessione di prova si chiede a',
        'ambienteIntegrazione(): è l’unico punto che applica le barriere.',
      ]);
    }
    // ⚠️ Anche R3 onora l'autorizzazione, per la stessa ragione di R2: il file
    //    che verifica la barriera costruisce un client nudo APPOSTA, per
    //    dimostrare che non raggiunge DEV. R1 invece resta assoluta: non c'è
    //    nessun motivo legittimo di importare PrismaService qui dentro.
    if (
      !autorizzato &&
      /new\s+PrismaClient\s*\(/.test(codice) &&
      !/datasources/.test(righe.slice(i, i + 6).join(' '))
    ) {
      violazioni.push([
        posizione,
        'costruisce un PrismaClient senza `datasources`: prenderebbe l’URL',
        'dall’ambiente. L’isolamento deve stare nel codice, non nell’ambiente.',
      ]);
    }
  });
}

// ── R4 · il bersaglio dichiarato dalle due parti deve coincidere ────────────
//
// ⛔ `env.ts` (la suite) e `prisma-deploy-test.mjs` (il comando che scrive lo
//    schema) dichiarano host, porta e nome del database. Sono duplicati per
//    forza — TypeScript dentro `api/src`, `.mjs` fuori — e una porta cambiata
//    in un posto solo lascerebbe uno dei due con un controllo più debole
//    dell'altro. Il più debole sarebbe il comando che scrive: il peggiore.
function bersaglioDi(file) {
  if (!fs.existsSync(file)) return null;
  const testo = fs.readFileSync(file, 'utf8');
  const blocco = testo.match(/BERSAGLIO\s*=\s*\{[\s\S]*?\n\}/);
  if (!blocco) return null;
  // Gli host stanno DENTRO `host: new Set([...])`: prenderli dal blocco intero
  // raccoglierebbe anche la porta, che è pure una stringa di cifre.
  const insieme = blocco[0].match(/host:\s*new Set\(\[([^\]]*)\]\)/);
  const porta = blocco[0].match(/porta:\s*'(\d+)'/);
  const database = blocco[0].match(/database:\s*'([\w-]+)'/);
  return {
    host: insieme
      ? [...insieme[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort().join(',')
      : '(assente)',
    porta: porta ? porta[1] : '(assente)',
    database: database ? database[1] : '(assente)',
  };
}

const dallaSuite = bersaglioDi('api/src/test/integration/env.ts');
const dalDeploy = bersaglioDi('api/scripts/prisma-deploy-test.mjs');

if (!dallaSuite || !dalDeploy) {
  violazioni.push([
    'api/src/test/integration/env.ts + api/scripts/prisma-deploy-test.mjs',
    'uno dei due non dichiara più un BERSAGLIO leggibile: senza, la',
    'destinazione di TEST non è più verificabile da qui.',
  ]);
} else {
  for (const campo of ['host', 'porta', 'database']) {
    if (dallaSuite[campo] !== dalDeploy[campo]) {
      violazioni.push([
        'BERSAGLIO disallineato · ' + campo,
        `env.ts dice «${dallaSuite[campo]}», prisma-deploy-test.mjs dice `,
        `«${dalDeploy[campo]}». Il comando che scrive lo schema e la suite che`,
        'lo usa devono puntare allo stesso posto.',
      ]);
    }
  }
}

if (violazioni.length > 0) {
  console.error('\n⛔ check:integration-db — la suite di integrazione può raggiungere DEV.\n');
  for (const [posizione, ...spiegazione] of violazioni) {
    console.error(`   ${posizione}`);
    for (const riga of spiegazione) console.error(`     ${riga}`);
    console.error('');
  }
  process.exit(1);
}

console.log(
  `✅ check:integration-db — ${controllati} file di integrazione, nessuno può raggiungere DEV ` +
    `(bersaglio ${dallaSuite.host}:${dallaSuite.porta}/${dallaSuite.database}, dichiarato uguale dalle due parti) ` +
    `(niente PrismaService, niente DATABASE_URL, nessun client senza datasources).`,
);
