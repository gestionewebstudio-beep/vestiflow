#!/usr/bin/env node
/**
 * I permessi vivono in DUE file — le costanti dell'API e il loro specchio nel
 * frontend — e niente, a parte questo controllo, impedisce loro di divergere.
 * Una divergenza non rompe la compilazione e non fa arrossare un test: fa
 * comparire in UI un'azione che il server rifiuta, o nasconde un permesso che
 * il server concede. In silenzio.
 *
 * Confronta: chiavi, famiglie documento, mappa tipo→famiglia, preset di ruolo.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API_CONSTANTS = join(ROOT, 'api/src/auth/tenant-permission.constants.ts');
const FE_MODEL = join(ROOT, 'src/app/core/models/tenant-permission.model.ts');
const API_DOC_UTIL = join(ROOT, 'api/src/auth/document-permission.util.ts');
const FE_DOC_UTIL = join(ROOT, 'src/app/core/permissions/document-permission.util.ts');

const errors = [];

function read(path) {
  return readFileSync(path, 'utf8');
}

/** Valori stringa di un oggetto `const X = { A: 'a', ... } as const`. */
function constObjectValues(source, name) {
  const block = source.match(new RegExp(`export const ${name} = \\{([\\s\\S]*?)\\n\\} as const;`));
  if (!block) {
    throw new Error(`${name} non trovato`);
  }
  return [...block[1].matchAll(/^\s*\w+:\s*'([^']+)'/gm)].map((m) => m[1]).sort();
}

/** Elementi di un array `export const X = [ 'a', 'b' ] as const;`. */
function constArrayValues(source, name) {
  const block = source.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\n\\] as const;`));
  if (!block) {
    throw new Error(`${name} non trovato`);
  }
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/** Mappa famiglia → tipi da `FAMILY_TO_TYPES` (ammette DocumentType.X o 'x'). */
function familyToTypes(source) {
  const block = source.match(/FAMILY_TO_TYPES[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (!block) {
    throw new Error('FAMILY_TO_TYPES non trovata');
  }
  const map = {};
  for (const entry of block[1].matchAll(/(\w+):\s*\[([\s\S]*?)\]/g)) {
    const values = [...entry[2].matchAll(/(?:DocumentType\.(\w+)|'([^']+)')/g)].map(
      (m) => m[1] ?? m[2],
    );
    map[entry[1]] = values;
  }
  return map;
}

/** Nomi PascalCase → valori snake_case dell'enum DocumentType (API o FE). */
function documentTypeAliases(source, name) {
  const block = source.match(new RegExp(`(?:export const ${name} = \\{|enum ${name} \\{)([\\s\\S]*?)\\n\\}`));
  if (!block) {
    return {};
  }
  const map = {};
  for (const m of block[1].matchAll(/^\s*(\w+):\s*'([^']+)'/gm)) {
    map[m[1]] = m[2];
  }
  return map;
}

function compare(label, a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  const onlyA = [...setA].filter((x) => !setB.has(x));
  const onlyB = [...setB].filter((x) => !setA.has(x));
  if (onlyA.length || onlyB.length) {
    errors.push(
      `${label}\n    solo API: ${onlyA.join(', ') || '—'}\n    solo frontend: ${onlyB.join(', ') || '—'}`,
    );
  }
}

const api = read(API_CONSTANTS);
const fe = read(FE_MODEL);

// 1. Le chiavi non-documento.
compare(
  'chiavi permesso divergenti',
  constObjectValues(api, 'TenantPermission'),
  constObjectValues(fe, 'TenantPermission'),
);

// 2. Le famiglie documento, ordine compreso (guida la matrice dell'editor).
const apiFamilies = constArrayValues(api, 'DOCUMENT_PERMISSION_FAMILIES');
const feFamilies = constArrayValues(fe, 'DOCUMENT_PERMISSION_FAMILIES');
compare('famiglie documento divergenti', apiFamilies, feFamilies);
if (apiFamilies.join(',') !== feFamilies.join(',')) {
  errors.push("l'ORDINE delle famiglie differisce: la matrice dell'editor non rispecchia l'API");
}

// 3. La mappa tipo → famiglia: è ciò che decide chi vede cosa.
const apiTypeMap = familyToTypes(read(API_DOC_UTIL));
const feTypeMap = familyToTypes(read(FE_DOC_UTIL));
const feDocTypes = documentTypeAliases(read(join(ROOT, 'src/app/core/models/document.model.ts')), 'DocumentType');
const apiDocTypes = documentTypeAliases(read(join(ROOT, 'api/prisma/schema.prisma')), 'DocumentType');

for (const family of apiFamilies) {
  const apiTypes = (apiTypeMap[family] ?? []).map((t) => apiDocTypes[t] ?? t).sort();
  const feTypes = (feTypeMap[family] ?? []).map((t) => feDocTypes[t] ?? t).sort();
  compare(`famiglia «${family}»: tipi documento divergenti`, apiTypes, feTypes);
}

// 4. Ogni DocumentType dello schema ha una famiglia: un tipo orfano fa 500.
const schemaTypes = [
  ...(read(join(ROOT, 'api/prisma/schema.prisma')).match(/enum DocumentType \{([\s\S]*?)\n\}/)?.[1] ?? '')
    .matchAll(/^\s{2}(\w+)/gm),
].map((m) => m[1]);
const mapped = new Set(Object.values(apiTypeMap).flat().map((t) => apiDocTypes[t] ?? t));
const orphans = schemaTypes.filter((t) => !mapped.has(t));
if (orphans.length) {
  errors.push(`DocumentType senza famiglia permessi (errore a runtime): ${orphans.join(', ')}`);
}

// 5. I preset di ruolo: se divergono, l'editor propone qualcosa di diverso da
//    ciò che il server salva. Gli spread si RISOLVONO nel loro contenuto: due
//    file possono usare nomi diversi per la stessa lista, e confrontare i nomi
//    farebbe passare una divergenza vera (o fallire su una differenza di sola
//    forma).
function resolvePreset(source, name, seen = new Set()) {
  if (seen.has(name)) {
    throw new Error(`spread circolare su ${name}`);
  }
  seen.add(name);
  const block = source.match(new RegExp(`const ${name}[^=]*=\\s*\\[([\\s\\S]*?)\\n\\];`));
  if (!block) {
    throw new Error(`${name} non trovato`);
  }
  const out = [];
  for (const m of block[1].matchAll(
    /\.\.\.(\w+)|TenantPermission\.(\w+)|docManagePermission\('(\w+)'\)|docViewPermission\('(\w+)'\)/g,
  )) {
    if (m[1]) {
      // Liste derivate calcolate con map/filter: si risolvono a parte.
      out.push(...resolveDerived(source, m[1], seen));
    } else if (m[2]) {
      out.push(m[2]);
    } else if (m[3]) {
      out.push(`doc.${m[3]}.manage`);
    } else if (m[4]) {
      out.push(`doc.${m[4]}.view`);
    }
  }
  return out;
}

/** Liste costruite da DOCUMENT_PERMISSION_FAMILIES con map/filter. */
function resolveDerived(source, name, seen) {
  const families = constArrayValues(source, 'DOCUMENT_PERMISSION_FAMILIES');
  const viewOnly = (source.match(/VIEW_ONLY_DOCUMENT_FAMILIES[^=]*=\s*\[([^\]]*)\]/)?.[1] ?? '')
    .match(/'([^']+)'/g)
    ?.map((x) => x.replaceAll("'", '')) ?? [];
  if (/const ALL_DOC_VIEW/.test(source) && name === 'ALL_DOC_VIEW') {
    return families.map((f) => `doc.${f}.view`);
  }
  if (name === 'ALL_DOC_MANAGE') {
    return families.filter((f) => !viewOnly.includes(f)).map((f) => `doc.${f}.manage`);
  }
  // Lista dichiarata per esteso (es. ALL_SECTIONS): si risolve ricorsivamente.
  return resolvePreset(source, name, seen);
}

for (const preset of ['MANAGER_DEFAULTS', 'CLERK_DEFAULTS']) {
  compare(
    `preset ${preset} divergente`,
    resolvePreset(api, preset).sort(),
    resolvePreset(fe, preset).sort(),
  );
}

// 6. Le famiglie di sola consultazione: se divergono, l'editor del titolare
//    offre un «Gestisci» che il server non riconosce (o viceversa).
const viewOnlyOf = (source) =>
  (source.match(/VIEW_ONLY_DOCUMENT_FAMILIES[^=]*=\s*\[([^\]]*)\]/)?.[1] ?? '')
    .split(',')
    .map((x) => x.trim().replaceAll("'", ''))
    .filter(Boolean);
compare('famiglie di sola consultazione divergenti', viewOnlyOf(api), viewOnlyOf(fe));

if (errors.length > 0) {
  console.error('\n✗ permessi: API e frontend divergono\n');
  for (const error of errors) {
    console.error(`  • ${error}`);
  }
  console.error(
    '\n  Le due fonti devono restare identiche: api/src/auth/tenant-permission.constants.ts\n' +
      '  e src/app/core/models/tenant-permission.model.ts (più le due document-permission.util).\n',
  );
  process.exit(1);
}

console.log(
  `✓ permessi: ${constObjectValues(api, 'TenantPermission').length} chiavi + ${apiFamilies.length} famiglie, API e frontend allineati.`,
);
