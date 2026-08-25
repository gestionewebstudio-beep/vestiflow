/**
 * Il comando che ESCE da un documento si chiama «Chiudi». Ovunque.
 *
 * ⛔ **Decisione del proprietario, 24/08/2026**, presa dopo aver visto che sei
 * maschere su sette dicevano «Chiudi» e due «Annulla» — senza che nessuna
 * ragione fosse scritta da nessuna parte:
 *
 * > «se abbiamo deciso chiudi, allora utilizzeremo chiudi dappertutto e
 * >  leveremo annulla. Ovunque deve essere cosi' e non voglio tornare
 * >  sull'argomento e vedere che ogni documento ha differenze.»
 *
 * ⚠️ **Per questo esiste questo controllo e non solo una riga di regola.** Una
 * regola la ricorda chi l'ha letta; questo gira dentro `npm run lint`, quindi
 * lo incontra chiunque — anche fra un anno, anche senza sapere che esiste. Le
 * due maschere disallineate lo erano da mesi, e nessuna revisione se n'era
 * accorta.
 *
 * ## Come riconosce il comando d'uscita
 *
 * Dal **gestore**, non dalla posizione: `(click)="cancel()"`. E' il modo in cui
 * ogni maschera documentale chiama l'uscita, ed e' stabile — mentre «il primo
 * pulsante della barra» dipenderebbe dall'ordine del markup.
 *
 * ## ⛔ Che cosa NON controlla, e perche'
 *
 * - **Le «Annulla» dentro i DIALOGHI restano.** Li' non significano «esci dal
 *   documento» ma «torno indietro, non fare niente»: e' un'altra azione, con un
 *   altro gestore. Il dialogo «modifiche non salvate» ha per contratto
 *   Annulla · Esci senza salvare.
 * - **L'etichetta di SALVATAGGIO non e' ancora qui.** «Salva documento» e' la
 *   regola, ma sei file portano ancora un «Salva e chiudi» nel dialogo
 *   d'uscita che il proprietario ha dichiarato da togliere: finche' quella
 *   potatura non e' fatta, un controllo sul salvataggio darebbe rosso su un
 *   lavoro gia' previsto. Si aggiunge dopo.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** L'etichetta unica del comando d'uscita. */
const ETICHETTA = 'Chiudi';

/** Dove vivono le maschere documento. */
const RADICI = [
  'src/app/features/documents',
  'src/app/features/orders',
  'src/app/features/sales-orders',
  'src/app/features/store-sales',
  'src/app/features/inventory',
];

function templateDiMaschera(cartella) {
  const trovati = [];
  let voci;
  try {
    voci = readdirSync(cartella);
  } catch {
    return trovati;
  }
  for (const voce of voci) {
    const percorso = join(cartella, voce);
    if (statSync(percorso).isDirectory()) {
      trovati.push(...templateDiMaschera(percorso));
      continue;
    }
    if (/form\.component\.html$/.test(voce)) trovati.push(percorso);
  }
  return trovati;
}

/**
 * Il pulsante d'uscita e la sua etichetta.
 *
 * ⚠️ L'etichetta puo' stare sulla stessa riga o sulla successiva: Prettier
 * manda a capo quando la riga e' lunga, e un controllo che guardasse solo la
 * riga del `(click)` perderebbe meta' dei casi.
 */
function etichettaDelComandoUscita(righe, indice) {
  const suRiga = righe[indice].match(/>\s*([^<>]+?)\s*<\/app-button>/);
  if (suRiga) return suRiga[1];
  for (let i = indice + 1; i < Math.min(indice + 4, righe.length); i++) {
    const testo = righe[i].trim();
    if (testo === '' || testo.startsWith('<')) continue;
    return testo.replace(/<\/app-button>\s*$/, '').trim();
  }
  return null;
}

const violazioni = [];
let controllati = 0;
let conBarraComune = 0;

for (const radice of RADICI) {
  for (const percorso of templateDiMaschera(radice)) {
    const testo = readFileSync(percorso, 'utf8');
    const righe = testo.split(/\r?\n/);

    // ⭐ **La barra azioni comune rende l'etichetta corretta per costruzione**:
    // «Chiudi» sta nel template di `app-document-actions`, e nessuna maschera
    // puo' scriverne un'altra.
    //
    // ⚠️ Va contata lo stesso, e non e' pedanteria: montando la barra sul
    // Trasferimento il conteggio e' sceso da otto maschere a sette, IN SILENZIO
    // — quella maschera non aveva piu' un `(click)="cancel()"` da riconoscere.
    // Una guardia che perde copertura mentre il codice MIGLIORA smette di
    // guardare proprio mentre sembra che vada tutto bene.
    if (testo.includes('<app-document-actions')) {
      controllati++;
      conBarraComune++;
      continue;
    }

    let visto = false;
    righe.forEach((riga, indice) => {
      if (!riga.includes('(click)="cancel()"')) return;
      visto = true;
      const etichetta = etichettaDelComandoUscita(righe, indice);
      if (etichetta && etichetta !== ETICHETTA) {
        violazioni.push({ percorso, riga: indice + 1, etichetta });
      }
    });
    if (visto) controllati++;
  }
}

if (violazioni.length === 0) {
  console.log(
    `✅ check:exit-label — il comando d'uscita si chiama «${ETICHETTA}» in tutte le maschere ` +
      `(${controllati} controllate, di cui ${conBarraComune} sulla barra comune).`,
  );
  process.exit(0);
}

console.error(`\n⛔ Il comando d'uscita non si chiama «${ETICHETTA}».\n`);
console.error("   Chi passa da una maschera all'altra cerca lo stesso pulsante con lo stesso");
console.error('   nome. Due maschere dicevano «Annulla» e sei «Chiudi», senza che nessuna');
console.error('   ragione fosse scritta: e’ deriva, non differenza.\n');
for (const v of violazioni) {
  console.error(`   ${relative(process.cwd(), v.percorso)}:${v.riga}  →  «${v.etichetta}»`);
}
console.error(
  `\n   ⚠️ Le «Annulla» dentro i DIALOGHI non c'entrano e restano: li' significano\n` +
    `      «torno indietro», non «esci dal documento».\n`,
);
process.exit(1);
