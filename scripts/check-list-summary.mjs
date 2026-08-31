#!/usr/bin/env node
/**
 * **La tipografia di un riepilogo è dichiarata in UN posto solo.**
 *
 * ⭐ Il 31/08/2026 la fascia riepilogo del Registro Corrispettivi è diventata la
 * forma comune dei riepiloghi documentali — proprietario: «per i riepiloghi dei
 * documenti la struttura dei totali dovrebbe essere come quella dei
 * corrispettivi, per coerenza di visualizzazione».
 *
 * ⛔ **Nel farlo la tipografia era finita scritta due volte**, e il proprietario
 * l'ha chiamata subito: «non duplicare se non serve». È stata estratta in due
 * mixin (`etichetta-riepilogo`, `valore-riepilogo`), e la sostituzione è stata
 * verificata confrontando il CSS emesso prima e dopo: 44 regole, identiche.
 *
 * Questa guardia impedisce che torni indietro. Un ruleset di etichetta o valore
 * che ridichiara a mano ciò che il mixin già dice è la duplicazione appena
 * tolta — e cambiarne una lascerebbe l'altra ferma, in silenzio.
 *
 * ## ⚠️ Questa guardia è nata CIECA, ed è la ragione per cui si falsifica
 *
 * La prima stesura non vedeva il difetto principale: scritta con un heredoc di
 * shell, le sue `\\s` erano diventate `\s`, che in un template literal JS
 * collassa a `s`. La regex cercava `(^|;|s)font-weights*:` e non trovava nulla —
 * senza fallire, senza dirlo. Le tre falsificazioni qui sotto sono quelle che
 * l'hanno scoperta.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function tuttiIFile(dir, acc = []) {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) tuttiIFile(p, acc);
    else acc.push(p.replace(/\\/g, '/'));
  }
  return acc;
}

/**
 * Le proprietà che i mixin governano: nessun consumer le ridichiara.
 *
 * ⚠️ `font-size` NON è nell'elenco, ed è voluto: il Registro lo ridichiara
 * legittimamente dentro un media query, e il valore evidenziato lo alza. È
 * l'unica proprietà che un consumer ha ragione di toccare.
 */
const GOVERNATE = [
  'font-weight',
  'color',
  'text-transform',
  'letter-spacing',
  'line-height',
  'white-space',
];

/**
 * ⛔ **I consumer si SCOPRONO, non si elencano a mano.**
 *
 * Qui c'era una lista scritta di un solo file: un secondo riepilogo che
 * duplicasse la tipografia non sarebbe mai stato guardato. Ora è chiunque
 * dichiari un `__item dt`/`dd` in un blocco che finisce per `-summary`.
 */
const CONSUMER = tuttiIFile('src/app')
  .filter((f) => f.endsWith('.scss'))
  .flatMap((file) => {
    const testo = readFileSync(file, 'utf8');
    const blocchi = new Set(
      [...testo.matchAll(/\.([\w-]*summary)__item\b/g)].map((m) => m[1]),
    );
    return [...blocchi].map((blocco) => ({ file, blocco }));
  });

/**
 * I ruleset annidati `nome { figlio { … } }`, con le graffe bilanciate.
 *
 * ⚠️ **Bilanciate e non `[^}]*`**: dentro un blocco annidato ci sono altre
 * graffe, e una regex che si ferma alla prima chiusa taglia il blocco a metà.
 */
function annidati(testo, selettore) {
  const trovati = [];
  const re = new RegExp(selettore.replace(/[.]/g, '\\$&') + '\\s*\\{', 'g');
  let m;

  while ((m = re.exec(testo))) {
    let i = m.index + m[0].length;
    let profondita = 1;
    const inizio = i;
    while (i < testo.length && profondita > 0) {
      if (testo[i] === '{') profondita += 1;
      else if (testo[i] === '}') profondita -= 1;
      i += 1;
    }
    if (profondita !== 0) {
      continue;
    }
    const corpo = testo.slice(inizio, i - 1);
    for (const figlio of corpo.matchAll(/(?:^|\n)\s*(dt|dd)\s*\{([^{}]*)\}/g)) {
      trovati.push({ quale: figlio[1], corpo: figlio[2] });
    }
  }

  return trovati;
}

const MIXIN = 'src/styles/_list-summary.scss';

let difetti = 0;

// 1. I mixin esistono ancora, e con i nomi che i consumer chiamano.
const foglio = readFileSync(MIXIN, 'utf8');
for (const nome of ['etichetta-riepilogo', 'valore-riepilogo']) {
  if (!foglio.includes(`@mixin ${nome}()`)) {
    console.error(`⛔ ${MIXIN} non dichiara più @mixin ${nome}().`);
    difetti += 1;
  }
}

// 2. Nessun consumer ridichiara a mano le proprietà governate su dt/dd.
for (const { file, blocco } of CONSUMER) {
  const testo = readFileSync(file, 'utf8');
  let visti = 0;

  /*
    ⛔ **Due forme, non una** — la seconda l'ha trovata una revisione
    avversariale il 31/08/2026, ed è quella che uno scriverebbe per prima:

    ```scss
    .blocco__item dt { … }              disteso — l'unica che la guardia vedeva
    .blocco__item { dt { … } }          annidato — compila identico, passava
    ```

    Dieci righe di duplicazione vera nella forma annidata, guardia verde.
  */
  const rulesets = [
    // Forma distesa: `.blocco__item dt { … }`
    ...[...testo.matchAll(new RegExp('\\.' + blocco + '__item (dt|dd)\\s*\\{([^}]*)\\}', 'g'))].map(
      (m) => ({ quale: m[1], corpo: m[2] }),
    ),
    // Forma annidata: `.blocco__item { … dt { … } … }`
    ...annidati(testo, `.${blocco}__item`),
  ];

  for (const { quale, corpo } of rulesets) {
    visti += 1;
    const pulito = corpo.replace(/\/\*[\s\S]*?\*\//g, '');
    const ridichiarate = GOVERNATE.filter((p) =>
      new RegExp('(^|;|\\s)' + p + '\\s*:').test(pulito),
    );
    if (ridichiarate.length === 0) {
      continue;
    }
    difetti += 1;
    console.error(
      `⛔ ${file}: .${blocco}__item ${quale} ridichiara ${ridichiarate.join(', ')} — ` +
        `sta nel mixin di ${MIXIN}, e due copie divergono in silenzio.`,
    );
  }

  if (visti === 0) {
    console.error(`⛔ ${file}: nessun ruleset .${blocco}__item dt/dd — il consumer è cambiato.`);
    difetti += 1;
  }
  if (!testo.includes('etichetta-riepilogo()') || !testo.includes('valore-riepilogo()')) {
    console.error(`⛔ ${file} non include più i mixin comuni: la tipografia è tornata sua.`);
    difetti += 1;
  }
}

if (difetti > 0) {
  console.error(
    `\n${difetti} problemi. La tipografia di un riepilogo si cambia nel mixin,\n` +
      `non nel foglio di chi lo usa: sono due fasce della stessa applicazione.`,
  );
  process.exit(1);
}

console.log(
  `check:list-summary — 2 mixin, ${CONSUMER.length} consumer, nessuna tipografia duplicata.`,
);
