#!/usr/bin/env node
/**
 * check:registro-append-only — il registro delle operazioni si SCRIVE e basta.
 *
 * ⛔ **Il contratto**: `PlatformAuditLog` (`docs/DA-FARE` §10.3) e' append-only
 *    per STRUTTURA — nessun `updatedAt`, nessun metodo che modifichi o
 *    cancelli. E' la traccia che deve sopravvivere al ripristino di un articolo
 *    e alla cancellazione di un tenant: una riga modificabile non e' una
 *    traccia, e' un campo.
 *
 * ⚠️ **Perche' una guardia e non un trigger.** Un `BEFORE UPDATE/DELETE` sul
 *    database sembrerebbe piu' forte, e romperebbe due suite: `svuotaTutto`
 *    (`shopify-distruttivo.fixture.ts`) scopre le tabelle da `pg_tables` e le
 *    tronca tutte, mentre `conStoricoSbloccato` spegne solo i dieci trigger
 *    Shopify cablati a mano. Si otterrebbe un rosso la cui causa il messaggio
 *    d'errore non nomina — e servirebbe una procedura di sblocco nuova, che
 *    nessuno ha autorizzato.
 *
 * ⚠️ **E non e' una barriera di privilegi**: l'API si connette come owner del
 *    database. Questa guardia ferma chi SCRIVE il codice, non chi lo esegue —
 *    che e' tutto cio' che una guardia statica puo' fare, e va detto invece che
 *    lasciato intendere.
 *
 * ⛔ **Non si modella su `check:cassa-append-only`.** Quella filtra i controller
 *    per NOME (`cash-session`, `cassa`): applicata a un registro senza
 *    controller stamperebbe ✅ avendo esaminato zero file, e un ✅ vuoto e'
 *    indistinguibile da un ✅ vero. Questa cerca gli ACCESSI al delegato Prisma,
 *    che esistono ovunque il registro venga toccato.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROSSO = '[31m';
const VERDE = '[32m';
const GRASSETTO = '[1m';
const FINE = '[0m';

const RADICE_API = 'api/src';
const SCHEMA = 'api/prisma/schema.prisma';
const MODELLO = 'PlatformAuditLog';
const DELEGATO = 'platformAuditLog';

/**
 * L'unico perimetro in cui cancellare le proprie righe e' ammesso: le prove
 * devono poter ripulire cio' che hanno scritto, e lo fanno su un database
 * sacrificabile. E' la stessa linea gia' tracciata da
 * `check:storico-non-cancellabile`.
 */
const AMMESSO = join('api', 'src', 'test') + sep;

/** I verbi che una traccia non deve conoscere. */
const VIETATI = ['update', 'updateMany', 'upsert', 'delete', 'deleteMany'];

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

// ── 1 · nessuna scrittura distruttiva fuori dai test ───────────────────────
let esaminati = 0;
for (const percorso of fileTypeScript(RADICE_API)) {
  const relativo = relative('.', percorso);
  if (relativo.startsWith(AMMESSO)) continue;
  esaminati += 1;
  const righe = readFileSync(percorso, 'utf8').split(/\r?\n/);
  righe.forEach((riga, indice) => {
    for (const verbo of VIETATI) {
      if (riga.includes(`${DELEGATO}.${verbo}(`)) {
        problemi.push({
          tipo: `${DELEGATO}.${verbo} fuori dai test`,
          dove: `${relativo}:${indice + 1}`,
          testo: riga.trim().slice(0, 90),
        });
      }
    }
  });
}

// ── 2 · il modello non ha `updatedAt` ──────────────────────────────────────
let schema = '';
try {
  schema = readFileSync(SCHEMA, 'utf8');
} catch {
  problemi.push({ tipo: 'schema non leggibile', dove: SCHEMA, testo: '' });
}

const blocco = schema.match(new RegExp(`model\\s+${MODELLO}\\s*\\{([\\s\\S]*?)\\n\\}`));
if (!blocco) {
  problemi.push({
    tipo: `il modello ${MODELLO} non esiste`,
    dove: SCHEMA,
    testo: 'la guardia sorveglia una tabella che non c`e`: e` un ✅ vuoto',
  });
} else {
  if (/\bupdatedAt\b/.test(blocco[1])) {
    problemi.push({
      tipo: `${MODELLO} ha \`updatedAt\``,
      dove: SCHEMA,
      testo: 'append-only per struttura significa che non esiste una data di modifica',
    });
  }
  // ⛔ Una relazione verso `Tenant` la farebbe sparire col tenant (Cascade),
  //    impedirebbe la cancellazione (Restrict) o azzererebbe il riferimento
  //    (SetNull, il default per una relazione opzionale). Nessuno dei tre va bene.
  if (/@relation\(/.test(blocco[1])) {
    problemi.push({
      tipo: `${MODELLO} ha una RELAZIONE`,
      dove: SCHEMA,
      testo: 'il registro deve sopravvivere al tenant: tenant e attore vivono come TESTO',
    });
  }
}

// ── 3 · il registro NON deve entrare nel backup del tenant ─────────────────
const COSTANTI = 'api/src/tenant/tenant-backup/tenant-backup.constants.ts';
try {
  if (readFileSync(COSTANTI, 'utf8').includes(`'${MODELLO}'`)) {
    problemi.push({
      tipo: `${MODELLO} in TENANT_BACKUP_MODELS`,
      dove: COSTANTI,
      testo:
        '`purgeTenantBackupData` lo cancellerebbe — nel RIPRISTINO oltre che nella ' +
        'cancellazione — e ogni archivio v4 esistente diventerebbe irripristinabile',
    });
  }
} catch {
  problemi.push({ tipo: 'costanti di backup non leggibili', dove: COSTANTI, testo: '' });
}

if (problemi.length > 0) {
  console.error(
    `\n${ROSSO}${GRASSETTO}⛔ check:registro-append-only — ${problemi.length} problema/i${FINE}\n`,
  );
  for (const p of problemi) {
    console.error(`   ${GRASSETTO}${p.tipo}${FINE}`);
    console.error(`     ${p.dove}`);
    if (p.testo) console.error(`     ${p.testo}`);
    console.error('');
  }
  console.error(
    '   Il registro delle operazioni si scrive e basta: e` la traccia che\n' +
      '   sopravvive al ripristino di un articolo e alla cancellazione di un\n' +
      "   tenant. Modificarlo o cancellarlo e` ammesso soltanto sotto 'api/src/test/'.\n",
  );
  process.exit(1);
}

console.log(
  `${VERDE}✅ check:registro-append-only — ${esaminati} file esaminati, nessuna modifica o ` +
    `cancellazione di ${MODELLO} fuori dai test; il modello non ha updatedAt ne relazioni, ` +
    `ed e' fuori dal backup del tenant.${FINE}`,
);
