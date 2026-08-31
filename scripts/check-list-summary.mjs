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
import { readFileSync } from 'node:fs';

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

const CONSUMER = [
  {
    file: 'src/app/features/reports/components/corrispettivi-summary/corrispettivi-summary.component.scss',
    blocco: 'corrispettivi-summary',
  },
];

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
  const re = new RegExp('\\.' + blocco + '__item (dt|dd) \\{([^}]*)\\}', 'g');
  let m;
  let visti = 0;

  while ((m = re.exec(testo))) {
    visti += 1;
    const corpo = m[2].replace(/\/\*[\s\S]*?\*\//g, '');
    const ridichiarate = GOVERNATE.filter((p) =>
      new RegExp('(^|;|\\s)' + p + '\\s*:').test(corpo),
    );
    if (ridichiarate.length === 0) {
      continue;
    }
    difetti += 1;
    console.error(
      `⛔ ${file}: .${blocco}__item ${m[1]} ridichiara ${ridichiarate.join(', ')} — ` +
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
