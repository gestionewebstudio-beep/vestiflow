/**
 * Guardia sui contenitori `display: contents` dentro la fascia di testata.
 *
 * ## ⛔ Il difetto che chiude, misurato il 26/08/2026
 *
 * Le regole che vestono le celle della fascia di testata usano il combinatore di
 * FIGLIO DIRETTO (`.doc-form__header-row > .doc-form__field`). Un contenitore
 * dichiarato `display: contents` toglie la scatola ma **non l'elemento**:
 * l'albero DOM resta com'e', quindi `>` si ferma sul contenitore e non raggiunge
 * le celle di dentro.
 *
 * Subito dopo la migrazione dell'Ordine cliente su `app-document-header`, le tre
 * celle raggruppate — Data, Stato, Consegna — restavano senza quota flex E con
 * il filo inferiore che le celle sorelle non hanno: una riga orizzontale sotto
 * quelle tre sole.
 *
 * ⚠️ **Nessun controllo automatico lo vedeva.** Il CSS compila, i test passano
 * (jsdom non applica i fogli globali), e la resa sbagliata la trova solo un
 * occhio davanti allo schermo giusto.
 *
 * ## Cosa controlla
 *
 * Scopre da se' i contenitori `display: contents` dichiarati nel foglio, e per
 * OGNI gruppo di selettori che veste le celle della fascia pretende che ognuno
 * di quei contenitori abbia il proprio secondo livello. Aggiungerne uno nuovo,
 * o aggiungere una regola nuova alla fascia dimenticando i contenitori, fa
 * fallire il lint invece di lasciare un difetto invisibile.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FOGLIO = 'src/styles/_document-form.scss';
const css = readFileSync(join(root, FOGLIO), 'utf8');

/**
 * Via i commenti PRIMA di qualunque analisi: il foglio ne contiene che citano
 * essi stessi dei selettori, e prendendoli dentro la guardia si accusa da sola.
 */
const pulito = css.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\r\n]*/g, ' ');

/** I contenitori trasparenti: `.x { display: contents }`. */
const CONTENITORI = [
  ...pulito.matchAll(/\.([a-z0-9_-]+)\s*\{\s*display:\s*contents;/g),
].map((m) => m[1]);

if (CONTENITORI.length === 0) {
  console.error(`✖ check:header-groups — nessun contenitore \`display: contents\` in ${FOGLIO}.`);
  console.error("  O e' cambiato il foglio, o e' rotta la guardia: in entrambi i casi si guarda.");
  process.exit(1);
}

/** I gruppi di selettori: il testo fra l'ultimo `{`, `}` o `;` e la `{` che apre. */
function gruppiDiSelettori(sorgente) {
  const fuori = [];
  let ultimo = 0;
  for (let i = 0; i < sorgente.length; i++) {
    const c = sorgente[i];
    if (c === '{') {
      fuori.push(sorgente.slice(ultimo, i).trim());
      ultimo = i + 1;
    } else if (c === '}' || c === ';') {
      ultimo = i + 1;
    }
  }
  return fuori;
}

const gruppi = gruppiDiSelettori(pulito).filter((g) =>
  /\.doc-form__header-row\s*>\s*\.doc-form__field/.test(g),
);

const mancanti = [];
for (const gruppo of gruppi) {
  // ⚠️ Niente regex costruite da stringhe: gli escape non sopravvivono al
  //   passaggio, la classe di caratteri si svuota e la guardia accusa TUTTI.
  //   E' successo scrivendola, e il messaggio di errore sembrava vero.
  const selettori = gruppo.split(',').map((x) => x.trim());
  const primo = selettori[0] ?? '';
  for (const contenitore of CONTENITORI) {
    const coperto = selettori.some((sel) => {
      const dove = sel.indexOf(`.${contenitore}`);
      return dove >= 0 && sel.indexOf('.doc-form__field', dove) > dove;
    });
    if (!coperto) {
      mancanti.push({ contenitore, primo });
    }
  }
}

if (mancanti.length > 0) {
  console.error('✖ check:header-groups — celle irraggiungibili nella fascia di testata.\n');
  for (const m of mancanti) {
    console.error(`  manca il secondo livello per .${m.contenitore}`);
    console.error(`    nel gruppo che comincia con: ${m.primo}\n`);
  }
  console.error("  `display: contents` non cambia l'albero DOM: il combinatore `>` si ferma sul");
  console.error('  contenitore. Aggiungi il selettore corrispondente, come per gli altri.');
  process.exit(1);
}

console.log(
  `✅ check:header-groups — ${CONTENITORI.length} contenitori trasparenti ` +
    `(${CONTENITORI.join(', ')}) raggiunti da tutti i ${gruppi.length} gruppi della fascia.`,
);
