#!/usr/bin/env node
/**
 * Il profilo di stampa vive in DUE file — `api/src/documents/document-print.util.ts`
 * e il suo specchio in `src/app/features/documents/models/document-print.util.ts` —
 * e niente, a parte questo controllo, impedisce loro di divergere.
 *
 * Non è un timore teorico: la Fattura accompagnatoria è stata stampabile lato
 * API e muta lato frontend per mesi. Il bottone semplicemente non compariva,
 * nessun test è arrossito, nessuna build è caduta. E la stessa cosa era
 * accaduta una seconda volta, sul RAMO di layout: carico manuale e carico
 * iniziale erano `goods_receipt` nell'anteprima e `generic` nel PDF, cioè la
 * stessa merce raccontata in due modi a seconda di dove la si guardava.
 *
 * Confronta, per ogni tipo documento: stampabilità, ramo di layout, presenza
 * delle colonne di valore.
 *
 * I due file usano notazioni diverse per lo stesso enum (`DocumentType.Proforma`
 * di qua, `DocumentType.proforma` di là): la corrispondenza si ricava dall'enum
 * frontend, che dichiara entrambe le forme.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API_UTIL = join(ROOT, 'api/src/documents/document-print.util.ts');
const FE_UTIL = join(ROOT, 'src/app/features/documents/models/document-print.util.ts');
const FE_MODEL = join(ROOT, 'src/app/core/models/document.model.ts');

/**
 * Tipi che esistono solo lato API. Sono i registri interni della fase 2: non
 * hanno righe in `documents` e l'enum frontend non li dichiara affatto.
 */
const API_ONLY_TYPES = new Set(['online_sale', 'corrispettivo']);

const errors = [];

function read(path) {
  return readFileSync(path, 'utf8');
}

/** `PascalCase` → `snake_case`, dall'enum frontend `export const DocumentType`. */
function frontendAliases(source) {
  const block = source.match(/export const DocumentType = \{([\s\S]*?)\n\} as const;/);
  if (!block) {
    throw new Error('enum DocumentType del frontend non trovato');
  }
  const map = {};
  for (const m of block[1].matchAll(/^\s*(\w+):\s*'([^']+)'/gm)) {
    map[m[1]] = m[2];
  }
  return map;
}

/**
 * Voci di una mappa `const NOME: ... = { [DocumentType.X]: valore, ... };`.
 * Ritorna `{ tipoSnakeCase: valore }`. `aliases` traduce i nomi PascalCase del
 * frontend; lato API le chiavi sono già in snake_case.
 */
function profileMap(source, name, aliases, file) {
  const block = source.match(new RegExp(`const ${name}[^=]*=\\s*\\{([\\s\\S]*?)\\n\\};`));
  if (!block) {
    throw new Error(`${name} non trovata in ${file}`);
  }
  const map = {};
  for (const m of block[1].matchAll(/\[DocumentType\.(\w+)\]:\s*(?:'([^']+)'|(true|false))/g)) {
    const key = aliases[m[1]] ?? m[1];
    map[key] = m[2] ?? m[3];
  }
  if (Object.keys(map).length === 0) {
    throw new Error(`${name} in ${file} non ha voci leggibili`);
  }
  return map;
}

const apiSource = read(API_UTIL);
const feSource = read(FE_UTIL);
const aliases = frontendAliases(read(FE_MODEL));

const maps = [
  { label: 'stampabilità (HAS_PRINTED_SHEET)', name: 'HAS_PRINTED_SHEET' },
  { label: 'ramo di layout (PRINT_KIND)', name: 'PRINT_KIND' },
];

for (const { label, name } of maps) {
  const api = profileMap(apiSource, name, {}, 'API');
  const fe = profileMap(feSource, name, aliases, 'frontend');

  for (const [type, value] of Object.entries(api)) {
    if (API_ONLY_TYPES.has(type)) {
      continue;
    }
    if (!(type in fe)) {
      errors.push(`${label}: «${type}» è dichiarato lato API e assente lato frontend`);
    } else if (fe[type] !== value) {
      errors.push(`${label}: «${type}» vale «${value}» lato API e «${fe[type]}» lato frontend`);
    }
  }

  for (const type of Object.keys(fe)) {
    if (!(type in api)) {
      errors.push(`${label}: «${type}» è dichiarato lato frontend e assente lato API`);
    }
  }
}

/**
 * I rami senza valore devono coincidere: è ciò che decide se il foglio porta le
 * colonne Prezzo/Sconto/IVA/Totale, e un disallineamento qui darebbe una
 * colonna di zeri da una parte e niente dall'altra.
 */
function valuelessKinds(source, file) {
  const block = source.match(/const VALUELESS_KINDS[^=]*=\s*\[([\s\S]*?)\]\s*as const;/);
  if (!block) {
    throw new Error(`VALUELESS_KINDS non trovata in ${file}`);
  }
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
}

const apiValueless = valuelessKinds(apiSource, 'API').join(', ');
const feValueless = valuelessKinds(feSource, 'frontend').join(', ');
if (apiValueless !== feValueless) {
  errors.push(
    `colonne di valore (VALUELESS_KINDS): API «${apiValueless}» vs frontend «${feValueless}»`,
  );
}

if (errors.length > 0) {
  console.error('\n✖ Profilo di stampa divergente fra API e frontend:\n');
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  console.error(
    '\n  I due file devono dire la stessa cosa su ogni tipo. Se un tipo esiste solo\n' +
      '  lato API, dichiaralo in API_ONLY_TYPES con il motivo.\n',
  );
  process.exit(1);
}

console.log('✔ Profilo di stampa allineato fra API e frontend.');
