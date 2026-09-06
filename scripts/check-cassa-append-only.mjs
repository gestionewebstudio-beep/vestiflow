#!/usr/bin/env node
/**
 * check:cassa-append-only — la Cassa non cancella e non corregge in posto.
 *
 * ⛔ **Il contratto**: una sessione sbagliata si CHIUDE, un movimento di
 * cassetto sbagliato si corregge con un movimento OPPOSTO che lo cita nella
 * causale, una riga di storico sbagliata si corregge con una riga nuova.
 *
 * ```text
 * cash_sessions                  nessun DELETE ordinario
 * cash_session_movements         nessun DELETE, nessun UPDATE  (non ha updatedAt)
 * cash_session_device_changes    nessun DELETE, nessun UPDATE  (non ha updatedAt)
 * ```
 *
 * ⚠️ **Il database non può distinguere** una cancellazione amministrativa da
 * una ordinaria: `ON DELETE CASCADE` sullo storico serve alla rimozione
 * deliberata di un tenant, e senza una guardia si leggerebbe come un permesso.
 * A distinguerle è la SUPERFICIE che si espone — cioè questo controllo.
 *
 * ⭐ **Perché una guardia e non un test**: un test prova che oggi l'API non
 * c'è. Questa fa fallire la build il giorno in cui qualcuno la aggiunge, che è
 * il momento in cui la decisione va ridiscussa invece che presa per inerzia.
 *
 * ⚠️ **Non vieta le scritture di servizio**: `prisma.cashSession.update(...)`
 * dentro un servizio è legittimo — la chiusura di C4B lo farà. Vieta la
 * *rotta*: il verbo HTTP esposto su quelle risorse.
 *
 * La deroga, se un giorno servisse una rotta amministrativa vera, si scrive nel
 * commento del metodo: `@cassa-append-only amministrativa`. È esplicita e si
 * vede in revisione.
 */
import fs from 'node:fs';
import path from 'node:path';

const RADICE = path.resolve(process.cwd(), 'api/src');
const DEROGA = '@cassa-append-only amministrativa';

/** I controller che governano le risorse della Cassa. */
const RISORSE = ['cash-session', 'cash_session', 'cassa'];

/** I verbi che modificano o cancellano. */
const VERBI = ['@Delete', '@Put', '@Patch'];

function fileTs(dir) {
  const trovati = [];
  if (!fs.existsSync(dir)) return trovati;
  for (const voce of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, voce.name);
    if (voce.isDirectory()) {
      trovati.push(...fileTs(p));
    } else if (voce.name.endsWith('.controller.ts')) {
      trovati.push(p);
    }
  }
  return trovati;
}

const controller = fileTs(RADICE).filter((f) => {
  const nome = path.basename(f).toLowerCase();
  const cartella = path.basename(path.dirname(f)).toLowerCase();
  return RISORSE.some((r) => nome.includes(r) || cartella.includes(r));
});

const violazioni = [];

for (const file of controller) {
  const righe = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (let i = 0; i < righe.length; i += 1) {
    const riga = righe[i].trim();
    const verbo = VERBI.find((v) => riga.startsWith(v));
    if (!verbo) continue;

    // La deroga si dichiara nelle dieci righe sopra, dentro il commento del
    // metodo: si vede leggendo il metodo, non cercandola altrove.
    const contesto = righe.slice(Math.max(0, i - 10), i).join('\n');
    if (contesto.includes(DEROGA)) continue;

    violazioni.push({
      file: path.relative(process.cwd(), file).split(path.sep).join('/'),
      riga: i + 1,
      testo: riga,
    });
  }
}

if (violazioni.length > 0) {
  console.error('\n⛔ check:cassa-append-only — la Cassa non cancella e non corregge in posto.\n');
  for (const v of violazioni) {
    console.error(`  ${v.file}:${v.riga}  ${v.testo}`);
  }
  console.error(
    [
      '',
      '  Una sessione sbagliata si CHIUDE; un movimento sbagliato si corregge con un',
      '  movimento OPPOSTO che lo cita nella causale; una riga di storico con una riga',
      '  nuova. Se serve davvero una rotta amministrativa, dichiarala nel commento del',
      `  metodo con «${DEROGA}» — e allora la decisione si vede in revisione.`,
      '',
    ].join('\n'),
  );
  process.exit(1);
}

console.log(
  `✅ check:cassa-append-only — ${controller.length} controller Cassa, nessun verbo di cancellazione o modifica esposto.`,
);
