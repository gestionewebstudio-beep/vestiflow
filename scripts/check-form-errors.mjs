#!/usr/bin/env node
/**
 * Un form che rifiuta l'invio deve dire perché.
 *
 * È il difetto che sembra un pulsante rotto: il metodo di invio fa
 * `markAllAsTouched()` e poi `return` quando il form è invalido, ma il template
 * non mostra niente — né messaggio né bordo colorato. L'utente preme e non
 * succede nulla, e non ha modo di capire quale campo lo sta bloccando.
 *
 * Non si vede in compilazione, non fa arrossare un test, e non lo prende
 * nessun lint: il codice è corretto, manca solo la parte che parla all'utente.
 * Ne sono stati trovati quattordici in un colpo solo — dal form di creazione
 * utente alla maschera con cui si emettono le fatture.
 *
 * COSA CONTROLLA: se un componente dichiara validatori E rifiuta l'invio
 * quando il form è invalido, il suo template deve contenere almeno un segnale
 * d'errore.
 *
 * COSA NON CONTROLLA, e va detto perché non prometta più di quel che fa: non
 * verifica che OGNI campo con validatore abbia il suo messaggio. Un form con un
 * messaggio su cinque campi passa. Mapparli uno a uno richiederebbe di dedurre
 * dal testo quale controllo ha quale validatore, e la maschera dei documenti di
 * vendita — dove i controlli nascono in `createLine()` dentro un FormArray — lo
 * renderebbe indovinello, con falsi allarmi che insegnano a ignorare il lint.
 *
 * Questa guardia ferma quindi la regressione peggiore e più comune: il form
 * nato muto. La copertura campo per campo resta una scelta di chi scrive, e si
 * vede in revisione.
 */
import fs from 'node:fs';
import path from 'node:path';

const RADICI = ['src/app'];

/** Il componente dichiara campi con regole di validazione. */
const HA_VALIDATORI = /\bValidators\.\w+/;

/** Il metodo di invio esce quando il form non è valido. */
const RIFIUTA_INVIO = /if\s*\([^)]*\.invalid[\s\S]{0,120}?\)\s*\{[\s\S]{0,200}?\breturn\b/;

/**
 * Un segnale d'errore nel template. Basta uno: la forma esatta la sceglie chi
 * scrive, purché l'utente veda qualcosa.
 */
const SEGNALI = [
  /aria-invalid/, // stato accessibile, di solito accompagnato da uno stile
  /field-error/, // il nome BEM usato in tutto il progetto
  /--invalid/, // modificatore di classe (es. doc-form__input--invalid)
  /\[invalid\]/, // input di un componente di campo condiviso
  /__error/, // banner d'errore di blocco
];

/**
 * Il componente delega i campi a un componente condiviso, che i messaggi li
 * mostra per conto suo: `app-supplier-form-fields`, `app-customer-form-fields`.
 */
const DELEGA_A_CAMPI = /<app-[\w-]*form-fields/;

/**
 * Eccezioni dichiarate. Ogni voce porta il perché: un'eccezione senza motivo è
 * un buco che ha imparato a tacere.
 */
const AMMESSI = new Map([]);

function percorri(dir, out = []) {
  for (const voce of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, voce.name);
    if (voce.isDirectory()) percorri(p, out);
    else if (p.endsWith('.component.ts') && !p.endsWith('.spec.ts')) out.push(p);
  }
  return out;
}

const muti = [];
const eccezioniUsate = new Set();
let esaminati = 0;

for (const radice of RADICI) {
  for (const fileTs of percorri(radice)) {
    const rel = fileTs.split(path.sep).join('/');
    const ts = fs.readFileSync(fileTs, 'utf8');

    if (!HA_VALIDATORI.test(ts) || !RIFIUTA_INVIO.test(ts)) continue;
    esaminati += 1;

    if (AMMESSI.has(rel)) {
      eccezioniUsate.add(rel);
      continue;
    }

    // Il markup può stare in un file a parte o inline nel decoratore.
    const fileHtml = fileTs.replace(/\.ts$/, '.html');
    const markup = fs.existsSync(fileHtml) ? fs.readFileSync(fileHtml, 'utf8') : ts;

    if (DELEGA_A_CAMPI.test(markup)) continue;
    if (SEGNALI.some((s) => s.test(markup))) continue;

    muti.push(rel);
  }
}

const eccezioniMorte = [...AMMESSI.keys()].filter((f) => !eccezioniUsate.has(f));

if (muti.length > 0 || eccezioniMorte.length > 0) {
  if (muti.length > 0) {
    console.error(`\n✗ ${muti.length} form rifiutano l'invio senza dire perché:\n`);
    for (const f of muti) console.error(`   ${f}`);
    console.error(
      '\n  Il metodo di invio esce quando il form è invalido, ma il template non mostra' +
        '\n  niente: chi preme il pulsante non vede accadere nulla.' +
        '\n  Aggiungi il messaggio sotto il campo e il segnale sul bordo — il modo è in' +
        '\n  src/app/features/settings/pages/users/users-page.component.html.\n',
    );
  }
  for (const f of eccezioniMorte) {
    console.error(`✗ eccezione che non serve più: ${f} — toglila dall'elenco.`);
  }
  process.exit(1);
}

console.log(`✓ form: ${esaminati} rifiutano l'invio, e tutti dicono perché.`);
