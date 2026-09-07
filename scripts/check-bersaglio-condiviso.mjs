#!/usr/bin/env node
/**
 * check:bersaglio-condiviso — un comando Prisma locale non deve poter
 * raggiungere il database CONDIVISO senza che qualcuno gliene passi l'indirizzo
 * di proposito.
 *
 * ⛔ **Il difetto non è ipotetico: è successo il 07/09/2026.** Un
 *    `npx prisma migrate deploy` lanciato a mano con la sola `DATABASE_URL`
 *    sovrascritta ha applicato una migration al database condiviso — perché
 *    `migrate deploy` non usa `url`, usa `directUrl`, e quella era rimasta
 *    quella di `api/.env`. Il comando ha risposto «All migrations have been
 *    successfully applied» e sembrava aver scritto sulla copia locale.
 *
 * ⭐ **La protezione è la SOTTRAZIONE, non un controllo.** Tolta `DIRECT_URL`
 *    da `api/.env`, i tre comandi che scrivono lo schema falliscono con P1012
 *    PRIMA di aprire una connessione. Misurato, comando per comando:
 *
 *    ```text
 *    migrate deploy       DIRECT_URL   P1012, nessuna connessione
 *    db execute --schema  DIRECT_URL   P1012, nessuna connessione
 *    migrate resolve      DIRECT_URL   P1012, nessuna connessione
 *    ```
 *
 * ⚠️ **Ma regge su DUE condizioni, e questa guardia esiste per tenerle ferme.**
 *
 *    R1 · `DIRECT_URL` assente da `api/.env`. Rimettercela riapre il buco
 *         esattamente com'era.
 *
 *    R2 · `directUrl` ancora DICHIARATO in `schema.prisma`. È la condizione
 *         che non si vede: senza quella riga la variabile non serve più a
 *         nessuno, `migrate deploy` ripiega su `url` — cioè su `DATABASE_URL`,
 *         che nel `.env` c'è e ci deve restare perché serve all'applicazione.
 *         Misurato: tolto `directUrl` dallo schema, il deploy contatta la
 *         porta di `DATABASE_URL`. Una riga apparentemente inutile che
 *         qualcuno «ripulisce» riporterebbe tutto al punto di partenza, senza
 *         che niente diventi rosso.
 *
 * ⛔ **Questa guardia non stampa mai un valore.** Riporta il nome della
 *    variabile e il numero di riga, mai il contenuto: il file che controlla è
 *    quello delle credenziali, e un messaggio d'errore finisce nei log della
 *    CI e nei terminali condivisi.
 *
 * ⚠️ **Non è una barriera universale, e non va raccontata come tale.** Impedisce
 *    che il progetto perda la protezione; non impedisce a chi digita in un
 *    terminale di esportare a mano la variabile. Restano fuori anche i percorsi
 *    che passano dal CLIENT Prisma — `db seed`, `studio`, gli script `.mjs` —
 *    che usano `DATABASE_URL` e sono documentati in `docs/DA-FARE.md`.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROSSO = '\u001b[31m';
const GRASSETTO = '\u001b[1m';
const FINE = '\u001b[0m';

const FILE_ENV = path.join('api', '.env');
const FILE_SCHEMA = path.join('api', 'prisma', 'schema.prisma');

/** Assegnazione non commentata della SOLA `DIRECT_URL` (non `DIRECT_URL_TEST`). */
const ASSEGNA_DIRECT_URL = /^\s*(?:export\s+)?DIRECT_URL\s*=/;

const violazioni = [];
const esiti = [];

// ── R1 · `DIRECT_URL` non deve stare nel file caricato in automatico ────────
//
// ⚠️ «quando il file esiste»: `api/.env` è ignorato da Git, quindi in CI e in
//    un worktree pulito non c'è. Assente, la regola è soddisfatta — non
//    saltata: non esiste il file da cui Prisma potrebbe pescarla.
if (!fs.existsSync(FILE_ENV)) {
  esiti.push(`${FILE_ENV} assente (CI o worktree pulito): niente da cui pescare`);
} else {
  const righe = fs.readFileSync(FILE_ENV, 'utf8').split('\n');
  const trovate = [];
  righe.forEach((riga, indice) => {
    if (riga.trimStart().startsWith('#')) return;
    if (ASSEGNA_DIRECT_URL.test(riga)) trovate.push(indice + 1);
  });
  if (trovate.length > 0) {
    violazioni.push([
      `${FILE_ENV} · riga ${trovate.join(', ')}`,
      'dichiara DIRECT_URL, che la CLI Prisma carica da sé: «migrate deploy»,',
      '«db execute --schema» e «migrate resolve» tornano a poter scrivere sul',
      'database condiviso senza che nessuno passi loro un indirizzo.',
      'Spostala in un file locale ignorato e non caricato automaticamente.',
    ]);
  } else {
    esiti.push(`${FILE_ENV} non dichiara DIRECT_URL`);
  }
}

// ── R2 · `directUrl` deve restare dichiarato nello schema ───────────────────
if (!fs.existsSync(FILE_SCHEMA)) {
  violazioni.push([
    FILE_SCHEMA,
    'non esiste: senza lo schema questa guardia non può verificare niente.',
  ]);
} else {
  const schema = fs.readFileSync(FILE_SCHEMA, 'utf8');
  const blocco = schema.match(/datasource\s+\w+\s*\{[^}]*\}/);
  if (!blocco) {
    violazioni.push([
      FILE_SCHEMA,
      'non contiene un blocco «datasource» leggibile: la destinazione delle',
      'migration non è più verificabile da qui.',
    ]);
  } else if (!/^\s*directUrl\s*=/m.test(blocco[0])) {
    violazioni.push([
      `${FILE_SCHEMA} · blocco datasource`,
      'non dichiara più «directUrl». Sembra una riga inutile finché la',
      'variabile non c\u2019è, ed è invece ciò che fa fallire «migrate deploy»',
      'prima della connessione: senza, il comando ripiega su «url», cioè su',
      'DATABASE_URL — che nel .env resta perché serve all\u2019applicazione.',
    ]);
  } else {
    esiti.push(`${FILE_SCHEMA} dichiara ancora directUrl`);
  }
}

if (violazioni.length > 0) {
  console.error(
    `\n${ROSSO}${GRASSETTO}⛔ check:bersaglio-condiviso — un comando Prisma locale può raggiungere il database condiviso.${FINE}\n`,
  );
  for (const [posizione, ...spiegazione] of violazioni) {
    console.error(`   ${posizione}`);
    for (const riga of spiegazione) console.error(`     ${riga}`);
    console.error('');
  }
  process.exit(1);
}

console.log(`✅ check:bersaglio-condiviso — ${esiti.join('; ')}.`);
