/**
 * Esporta in un file di testo la STRUTTURA del database applicativo.
 *
 * Uso:  npm run schema:export           → scrive docs/schema-supabase.txt
 *       npm run schema:export -- --corpo → stampa il solo corpo strutturale
 *
 * ⛔ **SOLA LETTURA.** La transazione dichiara `SET TRANSACTION READ ONLY`: da
 * qui non si scrive niente, e in particolare non si allinea niente. Le
 * differenze fra ciò che il database ha e ciò che Prisma dichiara si
 * RIPORTANO nel file — non si correggono. Nessun `db push`, nessun `migrate`.
 *
 * ⛔ **Solo lo schema `public`.** Gli schemi interni di Supabase (`auth`,
 * `storage`, `realtime`, `extensions`, `graphql`, `vault`, `pg_*`,
 * `information_schema`) non sono nostri: pubblicarne la struttura non serve a
 * nessuno e allunga il file di roba che nessuno leggerà.
 *
 * ⛔ **Nessun dato, nessuna credenziale.** Il file contiene tabelle, colonne,
 * vincoli, indici e stato RLS. Non contiene righe, conteggi di righe, host,
 * nome utente, identificativo di progetto o stringhe di connessione — il
 * repository è pubblico.
 *
 * ⚠️ **I `default` delle colonne vanno riletti a occhio prima del commit**: un
 * default può contenere un valore che non si vuole pubblicare. Lo script non
 * può deciderlo al posto di chi guarda.
 *
 * ⭐ **QUATTRO FONTI DISTINTE, e non si fondono.** Ognuna risponde a una
 * domanda diversa, e la loro differenza È l'informazione utile:
 *
 * ```text
 *   1  LETTO DAL DATABASE   pg_catalog + information_schema, in sola lettura
 *   2  ATTESO DA PRISMA     i modelli con @@map in api/prisma/schema.prisma
 *   3  FILE DI MIGRATION    le cartelle in api/prisma/migrations
 *   4  STORICO APPLICATO    le righe di _prisma_migrations
 * ```
 *
 * ⛔ **`_prisma_migrations` da sola NON dice quali migration sono pendenti**:
 * è un registro di ciò che è stato TENTATO. Le pendenti sono la differenza fra
 * la fonte 3 e le righe **concluse e non annullate** della fonte 4 — e una
 * migration presente nello storico ma fallita o annullata NON è applicata.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const radice = join(dirname(fileURLToPath(import.meta.url)), '..');
const soloCorpo = process.argv.includes('--corpo');

// ── L'ambiente, letto dal .env dell'API senza stamparne niente ──────────────

/**
 * Legge una chiave da `api/.env`.
 *
 * ⚠️ **Non si stampa mai il valore**, nemmeno in caso di errore: è una
 * stringa di connessione con dentro una password.
 */
function daEnv(chiave) {
  const percorso = join(radice, 'api/.env');
  if (!existsSync(percorso)) {
    return process.env[chiave];
  }
  for (const riga of readFileSync(percorso, 'utf8').split(/\r?\n/)) {
    const trovata = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(riga);
    if (trovata && trovata[1] === chiave) {
      return trovata[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  return process.env[chiave];
}


// ── Fonti 2 e 3: quello che il ramo dichiara, senza toccare la rete ─────────

/**
 * Quello che il RAMO dichiara: tabelle attese, colonne attese, cartelle di
 * migration. Le fonti 2 e 3, lette dal disco e senza toccare la rete.
 *
 * ⭐ **È una funzione e non tre costanti di modulo**, e non è un riordino
 * estetico: `componiCorpo` riceve questi fatti come PARAMETRO, così il corpo
 * del documento si può comporre anche su un ramo inventato. È quello che rende
 * possibile la prova offline in `export-schema.test.mjs` — senza database,
 * senza rete, e senza toccare lo schema vero.
 */
function leggiIlRamo() {
  const schemaPrisma = readFileSync(join(radice, 'api/prisma/schema.prisma'), 'utf8');
  // `@@map` esiste anche dentro un `enum`, dove nomina un TIPO e non una tabella.
  const soloModelli = schemaPrisma.replace(/^enum\s+\w+\s*\{[^}]*\}/gm, '');
  return {
    tabelleAttese: [...soloModelli.matchAll(/@@map\("([^"]+)"\)/g)]
      .map((m) => m[1])
      .sort((a, b) => a.localeCompare(b)),
    colonneAttese: colonneDichiarate(schemaPrisma),
    cartelleMigration: readdirSync(join(radice, 'api/prisma/migrations'), {
      withFileTypes: true,
    })
      .filter((v) => v.isDirectory())
      .map((v) => v.name)
      .sort((a, b) => a.localeCompare(b)),
  };
}

/**
 * Le COLONNE che Prisma dichiara, per nome di tabella.
 *
 * ⭐ **Serve a confrontare il ramo col database una colonna alla volta**, non
 * solo una tabella alla volta: le migration pendenti aggiungono per lo piu`
 * colonne a tabelle che esistono gia`, e un confronto per tabella non le
 * vedrebbe affatto.
 *
 * ⚠️ **I campi di RELAZIONE non sono colonne** e vanno scartati, o il
 * confronto segnalerebbe decine di differenze inventate. Si riconoscono dal
 * tipo: se e` il nome di un altro `model`, quel campo non ha una colonna sua —
 * la chiave esterna e` un campo scalare a parte.
 *
 * ⚠️ **Il nome della colonna e` quello di `@map`, se c'e`**: i campi Prisma sono
 * in camelCase e le colonne in snake_case, e senza questa lettura ogni campo
 * risulterebbe assente dal database.
 */
function colonneDichiarate(schemaPrisma) {
  const nomiModello = new Set(
    [...schemaPrisma.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]),
  );
  const perTabella = new Map();
  const blocchi = schemaPrisma.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm);
  for (const [, , corpo] of blocchi) {
    const nomeTabella = /@@map\("([^"]+)"\)/.exec(corpo)?.[1];
    if (nomeTabella === undefined) {
      continue;
    }
    const colonne = [];
    for (const riga of corpo.split(/\r?\n/)) {
      const pulita = riga.trim();
      if (pulita === '' || pulita.startsWith('//') || pulita.startsWith('@@')) {
        continue;
      }
      const campo = /^(\w+)\s+(\w+)(\[\])?\??/.exec(pulita);
      if (campo === null || nomiModello.has(campo[2])) {
        continue;
      }
      colonne.push(/@map\("([^"]+)"\)/.exec(pulita)?.[1] ?? campo[1]);
    }
    perTabella.set(nomeTabella, colonne.sort((a, b) => a.localeCompare(b)));
  }
  return perTabella;
}


function commitCorrente() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: radice,
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'sconosciuto';
  }
}

// ── Fonti 1 e 4: il database, in sola lettura ──────────────────────────────

/*
  ⭐ **Ordinamento STABILE ovunque.** Senza `ORDER BY` il planner restituisce le
  righe nell'ordine che gli conviene, e due estrazioni identiche produrrebbero
  un diff pieno di righe spostate: il file smetterebbe di dire qualcosa quando
  cambia davvero. Le colonne seguono `ordinal_position`, che è il loro ordine
  reale nella tabella; tutto il resto va per nome.
*/
const INTERROGAZIONI = {
  tabelle: `
    SELECT c.relname AS nome,
           c.relrowsecurity AS rls,
           c.relforcerowsecurity AS rls_forzata
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
     ORDER BY c.relname`,
  colonne: `
    SELECT table_name AS tabella,
           ordinal_position AS posizione,
           column_name AS nome,
           format_type(a.atttypid, a.atttypmod) AS tipo,
           is_nullable AS ammette_null,
           column_default AS predefinito
      FROM information_schema.columns col
      JOIN pg_class c ON c.relname = col.table_name
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = col.table_schema
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = col.column_name
     WHERE col.table_schema = 'public' AND c.relkind = 'r'
     ORDER BY table_name, ordinal_position`,
  /*
    ⭐ `pg_get_constraintdef` restituisce la definizione COMPLETA: il testo del
    CHECK, le colonne della chiave, e per le esterne le regole ON DELETE e ON
    UPDATE. È la differenza fra un'eliminazione rifiutata e un riferimento che
    sparisce in silenzio, e ricostruirla a mano da `pg_constraint` significa
    sbagliarla.
  */
  vincoli: `
    SELECT rel.relname AS tabella,
           con.conname AS nome,
           con.contype AS tipo,
           pg_get_constraintdef(con.oid) AS definizione
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = rel.relnamespace
     WHERE n.nspname = 'public' AND rel.relkind = 'r'
     ORDER BY rel.relname, con.contype, con.conname`,
  /*
    Gli indici NON unici e quelli PARZIALI dicono quali letture sono
    sostenibili, ed è il motivo per cui stanno qui: il registro Cassa ne
    dipende. `indexdef` porta dentro sia UNIQUE sia la clausola WHERE.
  */
  indici: `
    SELECT tablename AS tabella, indexname AS nome, indexdef AS definizione
      FROM pg_indexes
     WHERE schemaname = 'public'
     ORDER BY tablename, indexname`,
  enumerati: `
    SELECT t.typname AS nome, e.enumlabel AS valore, e.enumsortorder AS ordine
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'public'
     ORDER BY t.typname, e.enumsortorder`,
  storico: `
    SELECT migration_name AS nome,
           finished_at AS conclusa_il,
           rolled_back_at AS annullata_il,
           applied_steps_count AS passi
      FROM _prisma_migrations
     ORDER BY migration_name`,
};

async function leggi() {
  const url = daEnv('DIRECT_URL') ?? daEnv('DATABASE_URL');
  if (!url) {
    console.error('[schema:export] Manca DIRECT_URL/DATABASE_URL in api/.env.');
    process.exit(2);
  }
  const requireApi = createRequire(join(radice, 'api/package.json'));
  const { PrismaClient } = requireApi('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    return await prisma.$transaction(async (tx) => {
      // ⛔ La prima istruzione della transazione: da qui in poi PostgreSQL
      //    rifiuta qualunque scrittura, anche per errore di chi scrive lo script.
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      const esito = {};
      for (const [chiave, sql] of Object.entries(INTERROGAZIONI)) {
        esito[chiave] = await tx.$queryRawUnsafe(sql);
      }
      return esito;
    });
  } finally {
    await prisma.$disconnect();
  }
}

// ── La composizione del testo ──────────────────────────────────────────────

const NOMI_VINCOLO = {
  p: 'CHIAVE PRIMARIA',
  f: 'CHIAVE ESTERNA',
  u: 'UNICO',
  c: 'CHECK',
  x: 'ESCLUSIONE',
  t: 'TRIGGER',
};

function raggruppa(righe, chiave) {
  const mappa = new Map();
  for (const riga of righe) {
    const gruppo = mappa.get(riga[chiave]) ?? [];
    gruppo.push(riga);
    mappa.set(riga[chiave], gruppo);
  }
  return mappa;
}

export function componiCorpo(dati, ramo) {
  const { tabelleAttese, colonneAttese, cartelleMigration } = ramo;
  const r = [];
  const tabelle = dati.tabelle;
  const colonne = raggruppa(dati.colonne, 'tabella');
  const vincoli = raggruppa(dati.vincoli, 'tabella');
  const indici = raggruppa(dati.indici, 'tabella');
  const enumerati = raggruppa(dati.enumerati, 'nome');

  /*
    ⭐ **Le migration si dividono in TRE stati, non in due.** La presenza nello
    storico non significa applicazione riuscita: una riga senza `finished_at` è
    un tentativo interrotto, una con `rolled_back_at` è stata annullata. Solo le
    concluse e non annullate contano come applicate — ed è su quelle che si
    calcola cosa resta da applicare.
  */
  const concluse = dati.storico.filter((m) => m.conclusa_il !== null && m.annullata_il === null);
  const annullate = dati.storico.filter((m) => m.annullata_il !== null);
  const interrotte = dati.storico.filter((m) => m.conclusa_il === null && m.annullata_il === null);
  const nomiApplicati = new Set(concluse.map((m) => m.nome));
  const nomiStorico = new Set(dati.storico.map((m) => m.nome));
  const daApplicare = cartelleMigration.filter((n) => !nomiApplicati.has(n));
  const soloNelloStorico = [...nomiStorico]
    .filter((n) => !cartelleMigration.includes(n))
    .sort((a, b) => a.localeCompare(b));

  const nomiDb = new Set(tabelle.map((t) => t.nome));
  const soloInPrisma = tabelleAttese.filter((n) => !nomiDb.has(n));
  const soloNelDb = tabelle
    .map((t) => t.nome)
    .filter((n) => !tabelleAttese.includes(n) && n !== '_prisma_migrations');

  r.push('QUADRO', '='.repeat(78), '');
  r.push(`  tabelle nel database (fonte 1)      ${tabelle.length}   (compresa _prisma_migrations)`);
  r.push(`  tabelle dichiarate da Prisma (2)    ${tabelleAttese.length}`);
  r.push(`  cartelle di migration in locale (3) ${cartelleMigration.length}`);
  r.push(`  righe di _prisma_migrations (4)     ${dati.storico.length}`);
  r.push(`    di cui concluse e non annullate   ${concluse.length}`);
  r.push(`    di cui annullate                  ${annullate.length}`);
  r.push(`    di cui interrotte (mai concluse)  ${interrotte.length}`);
  r.push(`  migration da applicare (3 meno 4)   ${daApplicare.length}`);
  r.push(`  tipi enumerati                      ${enumerati.size}`);
  r.push('');

  r.push('DIFFERENZE FRA IL DATABASE E LO SCHEMA DEL RAMO', '-'.repeat(78), '');
  r.push('  Si RIPORTANO, non si allineano: questo comando non scrive niente.');
  r.push('');
  r.push(`  Dichiarate da Prisma e assenti dal database (${soloInPrisma.length}):`);
  for (const n of soloInPrisma) {
    r.push(`    ${n}`);
  }
  if (soloInPrisma.length === 0) {
    r.push('    nessuna');
  }
  r.push('');
  r.push(`  Presenti nel database e non dichiarate da Prisma (${soloNelDb.length}):`);
  for (const n of soloNelDb) {
    r.push(`    ${n}`);
  }
  if (soloNelDb.length === 0) {
    r.push('    nessuna');
  }
  r.push('');

  /*
    ⭐ **Il confronto va fatto anche COLONNA per colonna.** Le migration
    pendenti aggiungono per lo piu` colonne a tabelle che esistono gia`, e un
    confronto per sola tabella non le vedrebbe: il quadro direbbe «tutto a
    posto» mentre il ramo si aspetta campi che il database non ha.
  */
  const scartiColonne = [];
  for (const nomeTabella of [...colonneAttese.keys()].sort((a, b) => a.localeCompare(b))) {
    if (!nomiDb.has(nomeTabella)) {
      continue; // gia` riportata come tabella assente
    }
    const nelDb = new Set((colonne.get(nomeTabella) ?? []).map((c) => c.nome));
    const attese = colonneAttese.get(nomeTabella) ?? [];
    const mancanti = attese.filter((c) => !nelDb.has(c));
    const inPiu = [...nelDb]
      .filter((c) => !attese.includes(c))
      .sort((a, b) => a.localeCompare(b));
    if (mancanti.length > 0 || inPiu.length > 0) {
      scartiColonne.push({ nomeTabella, mancanti, inPiu });
    }
  }
  r.push(`  Tabelle con colonne che non corrispondono (${scartiColonne.length}):`);
  for (const s of scartiColonne) {
    r.push(`    ${s.nomeTabella}`);
    if (s.mancanti.length > 0) {
      r.push(`      dichiarate da Prisma, assenti dal database: ${s.mancanti.join(', ')}`);
    }
    if (s.inPiu.length > 0) {
      r.push(`      presenti nel database, non dichiarate: ${s.inPiu.join(', ')}`);
    }
  }
  if (scartiColonne.length === 0) {
    r.push('    nessuna');
  }
  r.push('');

  r.push('TABELLE', '='.repeat(78), '');
  r.push('  Lo stato RLS dice SOLTANTO se ROW LEVEL SECURITY e` abilitata sulla');
  r.push('  tabella. NON dice quali policy esistano, ne` quali privilegi abbiano i');
  r.push('  ruoli `anon` e `authenticated`.');
  r.push('');
  r.push('  `npm run check:rls` e` una SONDA DI ESPOSIZIONE: interroga la Data API');
  r.push('  con la chiave pubblica e fallisce se torna anche una sola riga. Non');
  r.push('  ispeziona policy ne` privilegi, e non sostituisce quella ispezione.');
  r.push('');
  /*
    ⛔ **Il riepilogo RLS si RICAVA dai dati, non si scrive a mano.**

    Qui c'era un paragrafo fisso: «l unica tabella senza RLS e`
    `_prisma_migrations`» e «le 74 dichiarate nello schema». Due affermazioni
    vere il giorno in cui sono state scritte e destinate a diventare false da
    sole — la prima al primo `ENABLE ROW LEVEL SECURITY` dimenticato, la
    seconda alla prima tabella nuova.

    ⚠️ **E sarebbero diventate false in SILENZIO**: il file avrebbe continuato
    a rassicurare mentre l elenco poche righe piu` sotto diceva il contrario.
    Un documento che smentisce se stesso e` peggio di un documento assente,
    perche' chi legge la frase non arriva all elenco.
  */
  const senzaRls = tabelle.filter((t) => !t.rls).map((t) => t.nome);
  const senzaRlsDentro = senzaRls.filter((n) => tabelleAttese.includes(n));
  const senzaRlsFuori = senzaRls.filter((n) => !tabelleAttese.includes(n));
  r.push(
    `  Con RLS abilitata: ${tabelle.length - senzaRls.length} tabelle su ${tabelle.length}.` +
      ` Dichiarate nello schema Prisma: ${tabelleAttese.length}.`,
  );
  r.push('');
  if (senzaRlsDentro.length === 0) {
    r.push('  Nessuna tabella DICHIARATA NELLO SCHEMA e` senza RLS.');
  } else {
    r.push(
      `  ⛔ TABELLE APPLICATIVE SENZA RLS (${senzaRlsDentro.length}) — sono dichiarate nello`,
    );
    r.push('     schema Prisma, quindi stanno DENTRO il perimetro di `check:rls`:');
    for (const n of senzaRlsDentro) {
      r.push(`       ${n}`);
    }
  }
  r.push('');
  r.push(
    `  Senza RLS e non dichiarate nello schema (${senzaRlsFuori.length}) — fuori dal perimetro`,
  );
  r.push('  di `check:rls`, che scopre le tabelle dallo schema Prisma:');
  for (const n of senzaRlsFuori) {
    r.push(`    ${n}`);
  }
  if (senzaRlsFuori.length === 0) {
    r.push('    nessuna');
  }
  r.push('');

  for (const tabella of tabelle) {
    const stato = tabella.rls ? 'RLS abilitata' : 'RLS ASSENTE';
    const forzata = tabella.rls_forzata ? ', forzata anche per il proprietario' : '';
    r.push(`── ${tabella.nome}  [${stato}${forzata}]`);
    for (const c of colonne.get(tabella.nome) ?? []) {
      const nulla = c.ammette_null === 'YES' ? 'null' : 'NOT NULL';
      const pre = c.predefinito === null ? '' : `  default ${c.predefinito}`;
      r.push(`     ${c.nome.padEnd(34)} ${String(c.tipo).padEnd(30)} ${nulla}${pre}`);
    }
    const v = vincoli.get(tabella.nome) ?? [];
    if (v.length > 0) {
      r.push('   vincoli:');
      for (const c of v) {
        r.push(`     [${NOMI_VINCOLO[c.tipo] ?? c.tipo}] ${c.nome}`);
        r.push(`       ${c.definizione}`);
      }
    }
    const i = indici.get(tabella.nome) ?? [];
    if (i.length > 0) {
      r.push('   indici:');
      for (const x of i) {
        r.push(`     ${x.nome}`);
        r.push(`       ${x.definizione}`);
      }
    }
    r.push('');
  }

  r.push('TIPI ENUMERATI', '='.repeat(78), '');
  for (const [nome, valori] of [...enumerati].sort((a, b) => a[0].localeCompare(b[0]))) {
    r.push(`  ${nome}: ${valori.map((v) => v.valore).join(' · ')}`);
  }
  r.push('');

  r.push('MIGRATION', '='.repeat(78), '');
  r.push('  La presenza nello storico NON significa applicazione riuscita.');
  r.push('');
  r.push(`  Da applicare — cartella in locale, nessuna riga conclusa (${daApplicare.length}):`);
  for (const n of daApplicare) {
    const riga = dati.storico.find((m) => m.nome === n);
    const perche =
      riga === undefined
        ? 'mai tentata'
        : riga.annullata_il !== null
          ? 'ANNULLATA nello storico'
          : 'INTERROTTA: presente nello storico ma mai conclusa';
    r.push(`    ${n}  (${perche})`);
  }
  if (daApplicare.length === 0) {
    r.push('    nessuna');
  }
  r.push('');
  r.push(`  Annullate (${annullate.length}):`);
  for (const m of annullate) {
    r.push(`    ${m.nome}`);
  }
  if (annullate.length === 0) {
    r.push('    nessuna');
  }
  r.push('');
  r.push(`  Interrotte, mai concluse (${interrotte.length}):`);
  for (const m of interrotte) {
    r.push(`    ${m.nome}  (${m.passi} passi applicati)`);
  }
  if (interrotte.length === 0) {
    r.push('    nessuna');
  }
  r.push('');
  r.push(`  Nello storico ma senza cartella in locale (${soloNelloStorico.length}):`);
  for (const n of soloNelloStorico) {
    r.push(`    ${n}`);
  }
  if (soloNelloStorico.length === 0) {
    r.push('    nessuna');
  }
  r.push('');
  r.push(`  Applicate — concluse e non annullate (${concluse.length}):`);
  for (const m of concluse) {
    r.push(`    ${m.nome}`);
  }
  r.push('');

  return r.join('\n');
}

function componiTestata() {
  return [
    'SCHEMA DEL DATABASE — VestiFlow',
    '='.repeat(78),
    '',
    "Ambiente:   database condiviso utilizzato anche dall'app distribuita; dati di",
    '            prova.',
    `Estratto:   ${new Date().toISOString()}`,
    `Commit:     ${commitCorrente()}`,
    "Schema:     public — esclusi gli schemi interni di Supabase, che non sono",
    '            nostri.',
    'Contenuto:  solo STRUTTURA. Nessuna riga di dati, nessun conteggio di righe,',
    '            nessuna credenziale, nessun host, nessun identificativo di',
    '            progetto, nessun nome utente.',
    '',
    'Rigenerare: npm run schema:export',
    '',
    'QUANDO rigenerarlo — dopo ogni migration applicata al database condiviso, e',
    'prima di un preflight di rilascio. Uno script permette di rigenerare il file,',
    'non lo tiene aggiornato: senza questa abitudine invecchia e mente con',
    "l'autorevolezza di un file versionato.",
    '',
    'LE QUATTRO FONTI, che non si fondono:',
    '  1  LETTO DAL DATABASE   pg_catalog + information_schema, in sola lettura',
    '  2  ATTESO DA PRISMA     i modelli con @@map in api/prisma/schema.prisma',
    '  3  FILE DI MIGRATION    le cartelle in api/prisma/migrations',
    '  4  STORICO APPLICATO    le righe di _prisma_migrations',
    '',
    'Le differenze fra le fonti si RIPORTANO. Questo comando non scrive niente sul',
    'database: la transazione dichiara SET TRANSACTION READ ONLY.',
    '',
    "Il confronto fra due estrazioni va fatto sul CORPO, non sul file intero: la",
    "riga «Estratto» e quella «Commit» cambiano per costruzione. Il corpo si",
    'ottiene con `npm run schema:export -- --corpo`.',
    '',
    '',
  ].join('\n');
}

/*
  ⭐ **Importare questo modulo NON apre nessuna connessione.** È la condizione
  che rende possibile la prova offline: `export-schema.test.mjs` importa
  `componiCorpo` e le passa dati e ramo finti, senza database e senza rete.
*/
const invocatoDirettamente =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invocatoDirettamente) {
  const corpo = componiCorpo(await leggi(), leggiIlRamo());

  if (soloCorpo) {
    process.stdout.write(corpo);
  } else {
    const percorso = join(radice, 'docs/schema-supabase.txt');
    writeFileSync(percorso, componiTestata() + corpo, 'utf8');
    console.log(
      `[schema:export] Scritto docs/schema-supabase.txt (${corpo.split('\n').length} righe di corpo).`,
    );
    console.log('[schema:export] Rileggilo prima del commit: il repository e` pubblico.');
  }
}
