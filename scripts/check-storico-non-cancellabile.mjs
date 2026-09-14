#!/usr/bin/env node
/**
 * check:storico-non-cancellabile — la storia dei collegamenti Shopify non si
 * cancella, e il permesso di spegnere quella protezione resta nei test.
 *
 * ⛔ **Il contratto**: `shopify_product_identities`, `shopify_variant_identities`
 * e i loro periodi, piu' `shopify_location_links`, hanno trigger `BEFORE DELETE`
 * e `BEFORE TRUNCATE` che rifiutano. Senza, un GID cancellato torna
 * riassegnabile a un altro articolo — misurato il 07/09/2026: cancellato il
 * periodo, poi l'identita', lo stesso `gid://shopify/Product/900002` rinasceva
 * su un altro prodotto.
 *
 * ⭐ **Ma le fixture di integrazione devono poter pulire**, e per farlo spengono
 * i trigger uno per uno (`conStoricoSbloccato` in `api/src/test/integration/
 * fixture.ts`), dentro una transazione sola sul solo database di prova.
 *
 * ⛔ **Questa guardia NON e' una barriera di privilegi**, e presentarla come
 * tale sarebbe peggio di non averla. Qui c'era scritto che il DDL «richiede
 * l'ownership e nessun endpoint lo emette, quindi non e' un percorso
 * applicativo»: e' falso — l'API si connette proprio come OWNER del database
 * (la stessa scelta per cui scavalca la RLS), quindi da un servizio quel DDL
 * riuscirebbe. Cio' che manca e' il codice che lo scriva, non il permesso.
 *
 * ⚠️ **Perche' una guardia e non un test**: un test prova che oggi l'app non
 * spegne niente. Questa fa fallire la build il giorno in cui qualcuno lo scrive
 * in un servizio — che e' il momento in cui la decisione va ridiscussa invece
 * che presa per inerzia. Ferma chi lo scrive, non chi lo esegue. E' la stessa
 * forma di `check:cassa-append-only`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROSSO = '[31m';
const VERDE = '[32m';
const GRASSETTO = '[1m';
const FINE = '[0m';

const RADICE_API = 'api/src';
/** L'unico posto in cui spegnere le protezioni e' ammesso. */
const AMMESSO = join('api', 'src', 'test') + sep;

/** Le tabelle il cui storico non si cancella. Devono avere i due trigger. */
const PROTETTE = [
  'shopify_product_identities',
  'shopify_variant_identities',
  'shopify_product_links',
  'shopify_variant_links',
  'shopify_location_links',
];

/**
 * Le tabelle la cui identita' non si RISCRIVE. Devono avere `BEFORE UPDATE`.
 *
 * ⛔ **Non e' la stessa cosa di PROTETTE, ed e' la lacuna che questa estensione
 *    chiude (08/09/2026)**: la guardia sorvegliava solo la cancellazione. Ma un
 *    GID si riassegna anche riscrivendolo, e la protezione contro quello e' un
 *    trigger diverso, su un evento diverso, che nessuno controllava.
 *
 * ⚠️ `shopify_location_pairs` e' qui e NON in PROTETTE: una coppia senza periodi
 *    resta cancellabile (correzione dell'abbinamento iniziale), ma riassegnarla
 *    a un'altra sede no.
 */
const IMMUTABILI = [
  'shopify_product_identities',
  'shopify_variant_identities',
  'shopify_product_links',
  'shopify_variant_links',
  'shopify_location_pairs',
];

const MIGRATION = 'api/prisma/migrations/20260907000000_shopify_link_history/migration.sql';
const MIGRATION_CANCELLAZIONE =
  'api/prisma/migrations/20260908230000_cancellazione_tenant_tracciata/migration.sql';
const MIGRATION_RIPRISTINO =
  'api/prisma/migrations/20260908210000_ripristino_storico_compatibile/migration.sql';

/**
 * Le due chiavi dell'eccezione, e i soli file autorizzati a nominarle.
 *
 * ⛔ **DUE nomi per ciascuna, non uno.** La prima stesura sorvegliava solo la
 *    stringa `'vestiflow.ripristino_tenant'` — ma il servizio legittimo non la
 *    scrive: importa la COSTANTE. Copiare quell'uso in un altro servizio non
 *    incontrava nessun controllo, e la guardia dichiarava «acceso in un posto
 *    solo» una cosa che non aveva verificato. Riprodotto l'08/09/2026
 *    aggiungendo `PERMESSO_RIPRISTINO` all'export del backup: guardia verde.
 *
 * ⚠️ `VINCOLI_DA_DIFFERIRE` e' nello stesso elenco per la stessa ragione:
 *    differire quelle FK altrove aprirebbe la stessa finestra del ripristino
 *    in un percorso che nessuno ha esaminato.
 */
const CHIAVI_ECCEZIONE = [
  {
    nome: 'permesso di riga del ripristino',
    simboli: ['vestiflow.ripristino_tenant', 'PERMESSO_RIPRISTINO'],
    ammessi: [
      join('api', 'src', 'tenant', 'tenant-backup', 'tenant-backup-storico.util.ts'),
      join('api', 'src', 'tenant', 'tenant-backup', 'tenant-backup-import.service.ts'),
    ],
  },
  {
    nome: 'differimento delle FK verso l`anagrafica',
    simboli: ['VINCOLI_DA_DIFFERIRE'],
    ammessi: [
      join('api', 'src', 'tenant', 'tenant-backup', 'tenant-backup-storico.util.ts'),
      join('api', 'src', 'tenant', 'tenant-backup', 'tenant-backup-import.service.ts'),
    ],
  },
  {
    nome: 'permesso di cancellazione del tenant',
    simboli: ['vestiflow.cancellazione_tenant', 'PERMESSO_CANCELLAZIONE_TENANT'],
    ammessi: [join('api', 'src', 'admin', 'tenant-delete.util.ts')],
  },
  {
    // ⛔ La SECONDA chiave della cancellazione: senza l'ordine completo, il
    //    permesso da solo non cancella niente — e viceversa. Un secondo punto
    //    che la chiede e' un secondo percorso che cancella lo storico.
    nome: 'ordine di cancellazione con lo storico',
    simboli: ['includiStorico', 'TENANT_BACKUP_DELETE_ORDER_COMPLETO'],
    ammessi: [
      join('api', 'src', 'tenant', 'tenant-backup', 'tenant-backup.constants.ts'),
      join('api', 'src', 'tenant', 'tenant-backup', 'tenant-backup-entities.util.ts'),
      join('api', 'src', 'admin', 'tenant-delete.util.ts'),
    ],
  },
];

function* fileTypeScript(cartella) {
  for (const voce of readdirSync(cartella)) {
    const percorso = join(cartella, voce);
    if (statSync(percorso).isDirectory()) {
      if (voce === 'node_modules' || voce === 'dist') continue;
      yield* fileTypeScript(percorso);
      continue;
    }
    if (percorso.endsWith('.ts')) yield percorso;
  }
}

const problemi = [];

// ── 1 · Nessuno spegne i trigger fuori dai test ────────────────────────────
for (const percorso of fileTypeScript(RADICE_API)) {
  const relativo = relative('.', percorso);
  // ⚠️ **Anche le SPEC accanto al sorgente, non solo `api/src/test/`.** Una
  //    prova che nomina il permesso non apre una porta: la esercita — ed e`
  //    proprio dove la si vuole esercitata. L'esenzione era per PERCORSO, e
  //    prendeva `tenant-delete.util.spec.ts`, cioe` la prova che verifica che
  //    il permesso sia acceso per quel tenant e in forma locale.
  if (relativo.startsWith(AMMESSO) || relativo.endsWith('.spec.ts')) continue;
  const righe = readFileSync(percorso, 'utf8').split(/\r?\n/);
  righe.forEach((riga, indice) => {
    if (/DISABLE\s+TRIGGER/i.test(riga) || /ALTER\s+TABLE[^;]*DISABLE/i.test(riga)) {
      problemi.push({
        tipo: 'spegnimento fuori dai test',
        dove: `${relativo}:${indice + 1}`,
        testo: riga.trim().slice(0, 90),
      });
    }
    // ⚠️ Una riga di COMMENTO non esegue niente, e questa guardia ne ha presa
    //    una propria al primo colpo: il divieto e` scritto a parole nel file
    //    che lo rispetta. Si guarda il codice, non la prosa.
    if (/^\s*(\/\/|\*|\/\*)/.test(riga)) return;
    // ⛔ `SET CONSTRAINTS ALL DEFERRED` spegne OGNI vincolo differibile della
    //    transazione, compresi quelli che nessuno ha esaminato. Si differisce
    //    per nome, o non si differisce.
    if (/SET\s+CONSTRAINTS\s+ALL\b/i.test(riga)) {
      problemi.push({
        tipo: 'vincoli differiti in blocco',
        dove: `${relativo}:${indice + 1}`,
        testo: 'si differisce PER NOME: «ALL» copre anche i vincoli non esaminati',
      });
    }
    // ⛔ L'eccezione del ripristino non e' un interruttore generale: un secondo
    //    punto che la usa e' una porta nuova, e va discussa.
    for (const chiave of CHIAVI_ECCEZIONE) {
      if (chiave.ammessi.includes(relativo)) continue;
      const trovato = chiave.simboli.find((simbolo) => riga.includes(simbolo));
      if (trovato) {
        problemi.push({
          tipo: `${chiave.nome}: usato fuori dal percorso autorizzato`,
          dove: `${relativo}:${indice + 1}`,
          testo: `«${trovato}» vive in ${chiave.ammessi.join(', ')}`,
        });
      }
    }
  });
}

// ── 1-bis · E i simboli sorvegliati ESISTONO davvero dove si dichiara ──────
// ⚠️ Una guardia che sorveglia un nome che nessuno usa piu` e` una guardia
//    morta: passa sempre, e nessuno se ne accorge. Dopo una rinomina, questo
//    controllo fa fallire la build invece di lasciarla verde.
for (const chiave of CHIAVI_ECCEZIONE) {
  for (const simbolo of chiave.simboli) {
    const presente = chiave.ammessi.some((percorso) => {
      try {
        return readFileSync(percorso, 'utf8').includes(simbolo);
      } catch {
        return false;
      }
    });
    if (!presente) {
      problemi.push({
        tipo: `${chiave.nome}: il simbolo sorvegliato non esiste piu'`,
        dove: simbolo,
        testo: `atteso in uno fra ${chiave.ammessi.join(', ')} — rinominato? la guardia era cieca`,
      });
    }
  }
}

// ── 2 · I trigger esistono davvero nella migration ─────────────────────────
let sql = '';
try {
  sql = readFileSync(MIGRATION, 'utf8');
} catch {
  problemi.push({ tipo: 'migration non leggibile', dove: MIGRATION, testo: '' });
}

for (const tabella of PROTETTE) {
  for (const evento of ['DELETE', 'TRUNCATE']) {
    const atteso = new RegExp(
      `BEFORE ${evento} ON "${tabella}"`.replace(/[.*+?^${}()|[\]\\]/g, (c) =>
        c === '"' ? c : `\\${c}`,
      ),
      'i',
    );
    if (!atteso.test(sql)) {
      problemi.push({
        tipo: `manca il trigger BEFORE ${evento}`,
        dove: tabella,
        testo: 'la storia di questa tabella sarebbe cancellabile',
      });
    }
  }
}

// ── 2-bis · L'identita' non si riscrive: i trigger BEFORE UPDATE ──────────
for (const tabella of IMMUTABILI) {
  if (!new RegExp(`BEFORE UPDATE ON "${tabella}"`, 'i').test(sql)) {
    problemi.push({
      tipo: 'manca il trigger BEFORE UPDATE',
      dove: tabella,
      testo: 'un GID si riassegna anche riscrivendolo, non solo cancellando la riga',
    });
  }
}

// ── 2-ter · Il permesso di riga e` STRETTO, e resta stretto ───────────────
let sqlRipristino = '';
try {
  sqlRipristino = readFileSync(MIGRATION_RIPRISTINO, 'utf8');
} catch {
  problemi.push({ tipo: 'migration di ripristino non leggibile', dove: MIGRATION_RIPRISTINO, testo: '' });
}

if (sqlRipristino) {
  // Le tre condizioni insieme: storico chiuso, permesso acceso, e acceso PER
  // QUEL tenant. Togliendone una, il permesso diventa un varco.
  const condizioni = [
    { nome: 'la riga deve essere uno storico chiuso', regex: /"local_deleted_at"\s+IS\s+NOT\s+NULL/i },
    {
      nome: 'il permesso si legge senza sollevare se assente',
      regex: /current_setting\('vestiflow\.ripristino_tenant',\s*true\)/i,
    },
    {
      nome: 'il permesso vale per QUEL tenant',
      regex: /current_setting\([^)]*\)\s*=\s*NEW\."tenant_id"::text/i,
    },
  ];
  for (const condizione of condizioni) {
    const quante = (sqlRipristino.match(new RegExp(condizione.regex, 'gi')) ?? []).length;
    if (quante < 2) {
      problemi.push({
        tipo: 'permesso di ripristino troppo largo',
        dove: MIGRATION_RIPRISTINO,
        testo: `${condizione.nome}: attesa in entrambe le funzioni, trovata ${quante} volta/e`,
      });
    }
  }
  // ⛔ Le quattro FK devono restare DIFFERIBILI ma NON differite di default:
  //    `INITIALLY DEFERRED` renderebbe permanente cio` che deve valere solo
  //    dentro la transazione di ripristino.
  if (/INITIALLY\s+DEFERRED/i.test(sqlRipristino)) {
    problemi.push({
      tipo: 'vincolo differito di default',
      dove: MIGRATION_RIPRISTINO,
      testo: 'fuori dal ripristino il controllo deve restare immediato (INITIALLY IMMEDIATE)',
    });
  }
}

// ── 2-quater · DELETE e TRUNCATE hanno due funzioni DISTINTE ──────────────
// ⛔ Deciso dal proprietario l'08/09/2026. Una funzione sola non poteva reggere
//    il permesso: confronta `OLD."tenant_id"`, e in un trigger di TRUNCATE
//    `OLD` non esiste. Ma il punto non e` tecnico: con una funzione sola non si
//    vede piu` che cosa e` autorizzato e che cosa non lo e`.
let sqlCancellazione = '';
try {
  sqlCancellazione = readFileSync(MIGRATION_CANCELLAZIONE, 'utf8');
} catch {
  problemi.push({
    tipo: 'migration di cancellazione tenant non leggibile',
    dove: MIGRATION_CANCELLAZIONE,
    testo: '',
  });
}

/**
 * Toglie i commenti SQL prima di guardare il contenuto.
 *
 * ⚠️ **Seconda volta che questa guardia inciampa nella propria prosa**: il corpo
 *    della funzione TRUNCATE contiene il commento «nessun `current_setting`», e
 *    il controllo lo leggeva come se fosse codice. Un commento non esegue
 *    niente, e una guardia che non lo sa fallisce proprio sui file scritti bene.
 */
function senzaCommenti(sql) {
  return sql
    .split('\n')
    .map((riga) => riga.replace(/--.*$/, ''))
    .join('\n');
}

if (sqlCancellazione) {
  const codice = senzaCommenti(sqlCancellazione);
  // I dieci trigger devono essere RICREATI qui: la migration li elimina per
  // ripuntarli, e senza la ricreazione la protezione sparirebbe in silenzio.
  for (const tabella of PROTETTE) {
    for (const [evento, funzione] of [
      ['DELETE', 'shopify_storico_delete_col_permesso'],
      ['TRUNCATE', 'shopify_storico_truncate_vietato'],
    ]) {
      const blocco = new RegExp(
        `BEFORE ${evento} ON "${tabella}"[\\s\\S]{0,120}?EXECUTE FUNCTION "${funzione}"`,
        'i',
      );
      if (!blocco.test(codice)) {
        problemi.push({
          tipo: `il trigger ${evento} non e' stato ripuntato`,
          dove: tabella,
          testo: `atteso su "${funzione}": la migration elimina i trigger per ricrearli`,
        });
      }
    }
  }

  // ⛔ La funzione del TRUNCATE non deve avere NESSUN permesso: un TRUNCATE non
  //    sa distinguere un tenant dall'altro, quindi non puo' essere autorizzato.
  const truncate = codice.slice(
    codice.indexOf('FUNCTION "shopify_storico_truncate_vietato"'),
  );
  const corpoTruncate = truncate.slice(0, truncate.indexOf('$$ LANGUAGE plpgsql;'));
  if (/current_setting/i.test(corpoTruncate)) {
    problemi.push({
      tipo: 'il TRUNCATE e` diventato autorizzabile',
      dove: MIGRATION_CANCELLAZIONE,
      testo: 'un TRUNCATE non distingue i tenant: non puo` avere un permesso per tenant',
    });
  }

  // ⭐ E quella del DELETE deve confrontare il tenant della RIGA, non altro.
  if (!/current_setting\([^)]*\)\s*=\s*OLD\."tenant_id"::text/i.test(codice)) {
    problemi.push({
      tipo: 'il permesso di cancellazione non e` limitato al tenant',
      dove: MIGRATION_CANCELLAZIONE,
      testo: 'atteso il confronto con OLD."tenant_id": senza, vale per tutti',
    });
  }

  // ⭐ La funzione ambigua non deve poter tornare disponibile.
  if (!/DROP FUNCTION "shopify_storico_non_si_cancella"/i.test(codice)) {
    problemi.push({
      tipo: 'la funzione condivisa non e` stata eliminata',
      dove: MIGRATION_CANCELLAZIONE,
      testo: 'lasciandola, un trigger nuovo puo` tornare a condividere una regola sola',
    });
  }
}

// ── 3 · La coppia di sede NON deve averli: e` la correzione iniziale ───────
if (/BEFORE (DELETE|TRUNCATE) ON "shopify_location_pairs"/i.test(sql)) {
  problemi.push({
    tipo: 'protezione di troppo',
    dove: 'shopify_location_pairs',
    testo:
      'una coppia SENZA periodi deve restare cancellabile: e` la correzione ' +
      'dell`abbinamento iniziale errato (docs/24 §1.13.6)',
  });
}

if (problemi.length > 0) {
  console.error(
    `\n${ROSSO}${GRASSETTO}⛔ check:storico-non-cancellabile — ${problemi.length} problema/i${FINE}\n`,
  );
  for (const p of problemi) {
    console.error(`   ${GRASSETTO}${p.tipo}${FINE}`);
    console.error(`     ${p.dove}`);
    if (p.testo) console.error(`     ${p.testo}`);
    console.error('');
  }
  console.error(
    '   La storia dei collegamenti remoti non si cancella: un GID cancellato\n' +
      '   tornerebbe riassegnabile a un altro articolo. Spegnere i trigger e`\n' +
      "   ammesso soltanto nelle fixture di integrazione, sotto 'api/src/test/'.\n",
  );
  process.exit(1);
}

console.log(
  `${VERDE}✅ check:storico-non-cancellabile — ${PROTETTE.length} tabelle protette da DELETE e TRUNCATE, ` +
    `${IMMUTABILI.length} da UPDATE, il permesso di ripristino e' stretto e acceso in un posto solo, ` +
    `DELETE e TRUNCATE hanno funzioni distinte, nessuno spegnimento fuori dai test, la coppia di sede resta correggibile.${FINE}`,
);
