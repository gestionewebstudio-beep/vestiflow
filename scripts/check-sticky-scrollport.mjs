#!/usr/bin/env node
/**
 * **Ogni intestazione di tabella `sticky` deve avere uno scrollport, ed essere
 * DICHIARATA qui.**
 *
 * ⛔ Difetto misurato il 29/08/2026, in **quattro** posti diversi. Un wrapper che
 * dichiara il solo `overflow-x: auto` diventa, per spec, il contenitore di
 * scorrimento più vicino su **entrambi** gli assi — ma senza un limite d'altezza
 * non scorre mai in verticale, e l'intestazione `position: sticky` che gli sta
 * dentro si ancora a un contenitore fermo.
 *
 * **Non appiccica, e non fallisce.** Nessun errore, nessun test rosso, nessuna
 * guardia: si vede solo aprendo il browser e scorrendo un elenco lungo. È la
 * ragione per cui questo controllo esiste.
 *
 * ## ⭐ Scopre, non elenca
 *
 * ⚠️ La prima versione aveva una lista di due coppie scritta a mano, mentre le
 * intestazioni `sticky` erano **otto**. Una lista scritta a mano resta ferma per
 * sempre: è lo stesso meccanismo per cui il Registro Corrispettivi non ricevette
 * la correzione fatta sul motore comune, e il proprietario dovette segnalarlo a
 * schermo.
 *
 * Questa versione **cerca** ogni intestazione appiccicata in `src/**` e fallisce
 * su quelle che non compaiono nella mappa qui sotto. Una tabella nuova non può
 * nascere muta: o è dichiarata, o il lint si ferma.
 *
 * ## Tre categorie, perché le forme legittime sono tre
 *
 * ⛔ Pretendere un contenitore per ogni `sticky` produce **falsi allarmi su
 * tabelle sane**: tre elenchi non hanno alcun wrapper e si ancorano a
 * `.shell__content`, che è già uno scrollport vero (la shell è `100dvh` con
 * `overflow: hidden`). Funzionano da sempre, e vanno dichiarate — così sono una
 * decisione, non un'omissione.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @type {Record<string, { categoria: 'mixin' | 'shell' | 'storica', contenitore?: string, perche: string }>}
 */
const DICHIARATE = {
  // ⭐ **La SORGENTE**: da qui lo sticky arriva a ogni tabella che include
  //    `data-table-desktop`. Prima se lo scriveva ognuna, e la nona se lo era
  //    dimenticato — l'elenco Fornitori non l'ha mai avuto, e si è visto solo
  //    scorrendo (29/08/2026).
  //
  //    ⚠️ Non ha un contenitore proprio da verificare: è un mixin. Sono i suoi
  //    CONSUMATORI a doverne dichiarare uno, e le voci qui sotto lo presidiano.
  '__head th': {
    categoria: 'sorgente',
    perche: 'il mixin `data-table-desktop`, che la dà a tutte le tabelle che lo includono',
  },
  '.data-table__head th': {
    categoria: 'mixin',
    contenitore: '.data-table-scroll',
    perche: 'motore tabella comune',
  },
  // ✅ **CHIUSA il 30/08/2026, e non come si pensava.**
  //
  //    Qui c'era `.corrispettivi-table__head th`, dichiarata APERTA: intestazione
  //    `sticky` senza scrollport, provata a chiudere tre volte il 29/08 e sempre
  //    ripristinata — dare il tetto al wrapper non bastava perché
  //    `.corrispettivi__panel-scroll` era una seconda regione annidata.
  //
  //    ⭐ **Non è stata corretta: è sparita.** Il Registro è passato al motore
  //    comune, quindi la sua intestazione ora è `.data-table__head th` — che sta
  //    qui sopra, ha il suo scrollport dal mixin, e appiccica come su ogni altro
  //    elenco. Il difetto non si è risolto: si è tolto il codice che lo aveva.
  //
  //    ⚠️ **Se ne è accorta la guardia**, non chi ha fatto la migrazione: al primo
  //    `npm run lint` ha detto «dichiarata qui ma non esiste più in src/». È il
  //    mestiere per cui esiste — anche al contrario, su una voce che scade.
  //    ✅ **E il 30/08 è sparita anche `.product-table__head th`**, per la stessa
  //    strada e con lo stesso avviso: l'elenco prodotti è passato al motore, la
  //    sua tabella scritta a mano non esiste più, e la guardia l'ha detto al
  //    primo lint invece di lasciare in elenco una voce che non presidia niente.
  '.doc-form__table thead th': {
    categoria: 'storica',
    contenitore: '.doc-form__table-wrap',
    perche:
      "forma storica con tetto `min(75vh, …)`: contenitore e tetto sono nati insieme, ed è il motivo per cui questa famiglia non ha MAI avuto il difetto. Candidata a passare al mixin, ma il suo tetto è diverso e cambiarlo cambierebbe il comportamento di sette maschere",
  },
  // ⚠️ Queste erano di categoria `shell` — nessun wrapper, ancorate a
  //    `.shell__content` — ed erano SANE. Sono passate a `mixin` il 29/08/2026
  //    non per uniformità, ma perché la catena di altezze ha tolto lo
  //    scorrimento alla pagina: senza una regione propria le righe
  //    traboccherebbero sopra il paginatore.
  //
  //    ⭐ Il contenitore è l'HOST, non un div nuovo: nessuna modifica di markup.
  //
  //    ✅ **E il 30/08 è sparita `.customer-table__head th`**, terza dopo
  //    Corrispettivi e Prodotti: anche l'anagrafica clienti è passata al motore,
  //    quindi la sua intestazione è ora `.data-table__head th`. Anche qui l'ha
  //    detto la guardia al primo lint, non chi ha fatto la migrazione.
  '.level-table__head th': {
    categoria: 'mixin',
    contenitore: ':host',
    perche: 'stessa forma di Clienti: nessun wrapper, host come scrollport',
  },
  '.situation-table__head th': {
    categoria: 'mixin',
    contenitore: ':host',
    perche: 'stessa forma di Clienti: nessun wrapper, host come scrollport',
  },
};

/** Ogni `.scss` sotto `src/`. */
function fogli(dir, acc = []) {
  for (const voce of readdirSync(dir)) {
    const p = join(dir, voce);
    if (statSync(p).isDirectory()) fogli(p, acc);
    else if (voce.endsWith('.scss')) acc.push(p.replace(/\\/g, '/'));
  }
  return acc;
}

/**
 * I selettori dei ruleset che contengono `position: sticky` e che parlano di
 * un'intestazione di tabella.
 *
 * ⚠️ **Non ogni `sticky` è un'intestazione**: `.data-table__cell--pinned` è una
 * colonna bloccata ORIZZONTALMENTE — le serve `overflow-x`, non un'altezza — e
 * altri cinque stanno su barre di azioni e menu. Il filtro sul selettore è ciò
 * che tiene questa guardia sul suo mestiere.
 */
const PARLA_DI_INTESTAZIONE = /(\bth\b|thead|__head\b|head-cell)/;

function stickyDiIntestazione(testo) {
  const trovati = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(testo)) !== null) {
    const selettore = m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim().split('\n').pop().trim();
    if (!/position:\s*sticky/.test(m[2])) continue;
    if (!PARLA_DI_INTESTAZIONE.test(selettore)) continue;
    trovati.push(selettore);
  }
  return trovati;
}

/**
 * I selettori CONTENITORE che dichiarano un overflow.
 *
 * ⚠️ **Un `overflow` non è un contenitore per il fatto di esistere.** Quello
 * sulle celle è ellissi di testo e non cattura nessun ancoraggio; quello su un
 * wrapper sì. La distinzione si fa sul NOME del selettore, che in una codebase
 * BEM è un indizio affidabile — e resta un indizio: questa guardia non risolve
 * l'albero del DOM, e non finge di farlo.
 */
const SEMBRA_CONTENITORE = /(-scroll|-wrap|__scroll|__wrap|__panel|__container|__body)\b/;

function contenitoriConOverflow(testo) {
  const fuori = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(testo)) !== null) {
    const selettore = m[1]
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim()
      .split('\n')
      .pop()
      .trim();
    if (!SEMBRA_CONTENITORE.test(selettore)) continue;
    if (!/overflow[-a-z]*:\s*(auto|scroll|hidden|clip)/.test(m[2])) continue;
    fuori.push(selettore);
  }
  return fuori;
}

let difetti = 0;
const viste = new Set();

for (const foglio of fogli('src')) {
  const testo = readFileSync(foglio, 'utf8');

  for (const selettore of stickyDiIntestazione(testo)) {
    const regola = DICHIARATE[selettore];

    if (regola === undefined) {
      console.error(
        `⛔ ${foglio}\n` +
          `   «${selettore}» è un'intestazione \`position: sticky\` NON DICHIARATA.\n` +
          `   Un'intestazione che non appiccica non fallisce: non fa niente, e nessun\n` +
          `   test se ne accorge. Dichiarala in DICHIARATE con la sua categoria:\n` +
          `     mixin   → il contenitore passa da \`rt.table-scroll(...)\`\n` +
          `     shell   → nessun wrapper, si ancora a \`.shell__content\`\n` +
          `     storica → contenitore proprio con un tetto suo, e la ragione`,
      );
      difetti++;
      continue;
    }

    viste.add(selettore);

    // ⚠️ La sorgente non si verifica: non ha un contenitore: è un mixin.
    if (regola.categoria === 'sorgente') continue;

    // ⚠️ `aperta` non fa fallire il lint: è un difetto NOTO e dichiarato, non
    //    una regressione nuova. Ma si stampa a ogni esecuzione, così non
    //    diventa silenzioso.
    if (regola.categoria === 'aperta') {
      console.warn(`⏸ ${foglio}`);
      console.warn(`   «${selettore}» — difetto APERTO: ${regola.perche}`);
      continue;
    }

    if (regola.categoria === 'mixin') {
      // ⭐ Non si ispezionano le proprietà CSS: si verifica che il contenitore
      //    venga dal mixin, dove scorrimento e limite nascono insieme. È il
      //    controllo meno fragile — la prima versione cercava
      //    `/…|block-size:|height:/` e passava su `line-height: 1.4`.
      const atteso = new RegExp(
        `table-scroll\\(\\s*['"]${regola.contenitore.replace('.', '\\.')}['"]`,
      );
      if (!atteso.test(testo)) {
        console.error(
          `⛔ ${foglio}\n` +
            `   «${selettore}» è dichiarata di categoria \`mixin\`, ma ${regola.contenitore}\n` +
            `   non passa da \`rt.table-scroll()\`. Scorrimento e limite devono nascere\n` +
            `   insieme, o l'intestazione si ancora a un contenitore che non scorre.`,
        );
        difetti++;
      }
    }

    if (regola.categoria === 'shell') {
      // ⚠️ La categoria è una promessa: «questo foglio non crea scrollport».
      //    Se qualcuno ci aggiungesse un `overflow` su un CONTENITORE, la
      //    promessa diventerebbe una bugia e l'intestazione smetterebbe di
      //    appiccicare in silenzio.
      //
      // ⛔ **L'overflow di CELLA non conta, ed è la maggioranza.**
      //    `overflow: hidden` su `__title`, `__sku`, `__code` è l'ellissi del
      //    testo (§6 delle regole di stile): quegli elementi stanno DENTRO le
      //    celle, non sono antenati del `<th>`, e non catturano niente.
      //    Segnalarli era il primo falso allarme di questa guardia — misurato
      //    su due tabelle sane il 29/08/2026, appena scritta.
      const overflow = contenitoriConOverflow(testo);
      if (overflow.length > 0) {
        console.error(
          `⛔ ${foglio}\n` +
            `   «${selettore}» è dichiarata di categoria \`shell\` — cioè «nessun wrapper,\n` +
            `   si ancora a .shell__content» — ma il foglio ora dichiara ${overflow.length}\n` +
            `   contenitore/i con overflow: ${overflow.join(', ')}.\n` +
            `   Quel contenitore cattura l'ancoraggio e l'intestazione smette di\n` +
            `   appiccicare. O si toglie l'overflow, o la categoria diventa \`mixin\`.`,
        );
        difetti++;
      }
    }
  }
}

// Una voce dichiarata che non esiste più è rumore che invecchia.
for (const selettore of Object.keys(DICHIARATE)) {
  if (!viste.has(selettore)) {
    console.error(`⛔ «${selettore}» è dichiarata qui ma non esiste più in src/. Toglila.`);
    difetti++;
  }
}

if (difetti > 0) {
  console.error(`\n${difetti} problema/i sulle intestazioni appiccicate.`);
  process.exit(1);
}

console.log(
  `check:sticky-scrollport — ${viste.size} intestazioni sticky, tutte dichiarate e coerenti.`,
);
