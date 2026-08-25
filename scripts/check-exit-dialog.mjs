/**
 * Il dialogo «modifiche non salvate» e' UNO, ed e' il componente condiviso.
 *
 * ⛔ **Decisione del proprietario**, ribadita il 24/08/2026:
 *
 * > «il procedimento deve essere uguale in tutti i documenti e unificare il
 * >  sistema. […] Ovunque deve essere cosi' e non voglio tornare
 * >  sull'argomento e vedere che ogni documento ha differenze.»
 *
 * Il contratto e' a DUE azioni — **Annulla · Esci senza salvare** — e il
 * salvataggio resta un'azione separata, il pulsante Salva. ⛔ «Salva e chiudi»
 * dentro il dialogo di uscita non deve comparire.
 *
 * ## ⚠️ Perche' un controllo, e non una riga di regola
 *
 * Misurato il 25/08/2026: **undici maschere** avevano lo stesso guscio scritto
 * a mano — un `<div role="dialog">` con lo sfondo proprio. Non un `<dialog>`
 * nativo: quindi **senza trappola del fuoco, senza Esc e senza sfondo inerte**,
 * contro `regole-architettura`, che li chiede esplicitamente per ogni modale.
 *
 * E le tre gia' convertite **non concordavano fra loro**: «Resta nella
 * pagina», «Resta qui», «Annulla» per lo stesso pulsante; «Esci senza
 * salvare» ed «Esci senza concludere» per lo stesso gesto. Nessuna revisione
 * se n'era accorta, perche' per accorgersene bisogna aprire tredici file
 * insieme.
 *
 * ## Come riconosce il dialogo d'uscita
 *
 * Dal **gestore**, non dalla posizione ne' dal titolo: `confirmExitWithoutSaving()`
 * (dodici maschere) e `confirmLeave()` (anagrafica prodotto). E' il metodo che
 * porta via dalla maschera perdendo il lavoro, ed e' stabile.
 *
 * ## ⛔ Che cosa NON controlla
 *
 * - **Gli altri dialoghi.** Una conferma di dominio («Confermare il
 *   trasferimento?», «Numero gia' usato») ha un contratto suo, e non e' questo.
 * - **`emphasis`** e' controllato, ed e' il solo attributo «estetico» qui
 *   dentro: senza, «Esci senza salvare» sarebbe il pulsante primario, cioe'
 *   quello che il pollice cerca. La scelta che perde lavoro non si veste da
 *   scelta consigliata.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** I gestori che identificano il dialogo d'uscita. */
const GESTORI = ['confirmExitWithoutSaving()', 'confirmLeave()'];

/** Il contratto, attributo per attributo. */
const CONTRATTO = {
  title: 'Modifiche non salvate',
  cancelLabel: 'Annulla',
  confirmLabel: 'Esci senza salvare',
  emphasis: 'cancel',
};

const RADICI = ['src/app'];

function templateDi(cartella, trovati = []) {
  let voci;
  try {
    voci = readdirSync(cartella);
  } catch {
    return trovati;
  }
  for (const voce of voci) {
    const percorso = join(cartella, voce);
    if (statSync(percorso).isDirectory()) {
      templateDi(percorso, trovati);
      continue;
    }
    if (voce.endsWith('.component.html')) trovati.push(percorso);
  }
  return trovati;
}

/**
 * I blocchi `<app-confirm-dialog … />` di un template, come testo intero.
 *
 * ⚠️ Prettier manda a capo gli attributi: un controllo riga per riga ne
 * perderebbe la maggior parte.
 */
function blocchiConfirmDialog(testo) {
  const blocchi = [];
  let da = 0;
  for (;;) {
    const inizio = testo.indexOf('<app-confirm-dialog', da);
    if (inizio < 0) break;
    const autochiuso = testo.indexOf('/>', inizio);
    const chiusura = testo.indexOf('</app-confirm-dialog>', inizio);
    const fine =
      chiusura >= 0 && (autochiuso < 0 || chiusura < autochiuso)
        ? chiusura + '</app-confirm-dialog>'.length
        : autochiuso + 2;
    if (fine <= inizio) break;
    blocchi.push({ testo: testo.slice(inizio, fine), inizio });
    da = fine;
  }
  return blocchi;
}

/**
 * Il valore di un attributo dentro un blocco di markup.
 *
 * ⚠️ Scritto SENZA espressione regolare apposta. La prima stesura usava un
 * confine di parola in un template literal, e la barra rovesciata si e' persa
 * per strada: e' diventata la sequenza di backspace, quindi la ricerca non
 * agganciava mai niente e OGNI attributo risultava «assente». Il controllo
 * segnalava tredici maschere fuori contratto, comprese le tre giuste.
 */
function attributo(blocco, nome) {
  const chiave = nome + '="';
  const i = blocco.indexOf(chiave);
  if (i < 0) return null;
  // Preceduto da spazio o a capo: senza, `cancelLabel` aggancerebbe anche un
  // ipotetico `xcancelLabel`.
  const prima = blocco[i - 1];
  if (prima !== undefined && prima.trim() !== '') return null;
  const fine = blocco.indexOf('"', i + chiave.length);
  return fine < 0 ? null : blocco.slice(i + chiave.length, fine);
}
const rigaDi = (testo, indice) => testo.slice(0, indice).split(/\r?\n/).length;

const violazioni = [];
let controllati = 0;

for (const radice of RADICI) {
  for (const percorso of templateDi(radice)) {
    const testo = readFileSync(percorso, 'utf8');
    if (!GESTORI.some((g) => testo.includes(g))) continue;
    controllati++;
    const rel = relative(process.cwd(), percorso);

    const blocco = blocchiConfirmDialog(testo).find((b) => GESTORI.some((g) => b.testo.includes(g)));

    // 1. Guscio scritto a mano: il gestore c'e' ma non dentro un
    //    <app-confirm-dialog>. E' il caso degli undici <div role="dialog">.
    if (!blocco) {
      const indice = GESTORI.map((g) => testo.indexOf(g))
        .filter((i) => i >= 0)
        .sort((a, b) => a - b)[0];
      violazioni.push({
        file: rel,
        riga: rigaDi(testo, indice),
        problema: 'guscio scritto a mano: il dialogo d’uscita non usa <app-confirm-dialog>',
      });
      continue;
    }

    // 2. La terza azione che salva: non appartiene a questo dialogo.
    // ⚠️ Cercato dentro il BLOCCO, non in tutto il file: il Trasferimento
    // nomina «Salva e chiudi» in un commento, per dire che non ce l'ha — e la
    // prima stesura di questo controllo lo segnalava per quel commento.
    if (blocco.testo.includes('Salva e chiudi')) {
      violazioni.push({
        file: rel,
        riga: rigaDi(testo, blocco.inizio),
        problema: '«Salva e chiudi»: il dialogo d’uscita ha DUE azioni, e nessuna salva',
      });
    }
    if (attributo(blocco.testo, 'extraLabel')) {
      violazioni.push({
        file: rel,
        riga: rigaDi(testo, blocco.inizio),
        problema: '`extraLabel` sul dialogo d’uscita: quel contratto ha due azioni',
      });
    }

    // 3. Le etichette: e' qui che le tre maschere gia' convertite divergevano.
    for (const [nome, atteso] of Object.entries(CONTRATTO)) {
      const valore = attributo(blocco.testo, nome);
      if (valore !== atteso) {
        violazioni.push({
          file: rel,
          riga: rigaDi(testo, blocco.inizio),
          problema: `${nome}: «${valore ?? '(assente)'}» invece di «${atteso}»`,
        });
      }
    }
  }
}

if (violazioni.length === 0) {
  console.log(
    `✅ check:exit-dialog — il dialogo «modifiche non salvate» e' il componente condiviso, ` +
      `con lo stesso contratto, in tutte le maschere (${controllati} controllate).`,
  );
  process.exit(0);
}

console.error(`\n⛔ Il dialogo «modifiche non salvate» non e' lo stesso ovunque.\n`);
console.error('   Contratto: DUE azioni — Annulla · Esci senza salvare — sul componente');
console.error('   condiviso <app-confirm-dialog>, con emphasis="cancel". Il salvataggio');
console.error('   resta il pulsante Salva: dentro questo dialogo non ci va.\n');
let ultimo = '';
for (const v of violazioni) {
  if (v.file !== ultimo) {
    console.error(`   ${v.file}`);
    ultimo = v.file;
  }
  console.error(`     :${v.riga}  ${v.problema}`);
}
console.error(`\n   ${violazioni.length} violazioni su ${controllati} maschere controllate.\n`);
process.exit(1);
