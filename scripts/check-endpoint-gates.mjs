#!/usr/bin/env node
/**
 * Ogni endpoint di un controller a permessi deve avere una porta.
 *
 * È il difetto che non si vede: un handler nuovo dentro un controller già
 * protetto compila, passa i test e risponde a chiunque abbia una sessione —
 * perché in NestJS il guard c'è ma senza metadati non chiede nulla. Nessun
 * errore, nessun test rosso, e la scoperta arriva da fuori.
 *
 * Una porta è: `@RequirePermissions`, `@RequireAnyPermissions`,
 * `@RequireAllPermissionGroups` o `@Roles` — sul metodo oppure sulla classe.
 * `@Public()` è una dichiarazione esplicita di endpoint aperto e vale come
 * scelta, non come dimenticanza.
 *
 * Non controlla SE il permesso scelto è quello giusto: quello lo decide chi
 * scrive, e lo verifica `check-permissions.mjs` sull'allineamento API↔frontend.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'api/src';
const GATE = /@(RequirePermissions|RequireAnyPermissions|RequireAllPermissionGroups|Roles)\(/;
const PUBLIC = /@Public\(/;
const VERB = /^\s*@(Get|Post|Patch|Put|Delete)\(/;

/**
 * Endpoint senza porta per scelta dichiarata. Ogni voce porta il perché:
 * un'eccezione senza motivo è un buco che ha imparato a tacere.
 */
const AMMESSI = new Map([
  [
    'api/src/user-preferences/user-preferences.controller.ts',
    'preferenze dell’operatore su sé stesso (`users/me`): non sono dati di negozio, ' +
      'e un gate di sezione le farebbe perdere a chi quella sezione non ce l’ha',
  ],
]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (p.endsWith('.controller.ts')) out.push(p);
  }
  return out;
}

/** Righe di decoratore contigue attorno alla riga del verbo HTTP. */
function decoratorsAround(lines, verbLine) {
  const block = [];
  for (let i = verbLine - 1; i >= 0 && /^\s*@|^\s*\)/.test(lines[i]); i -= 1) {
    block.push(lines[i]);
  }
  for (let i = verbLine; i < lines.length; i += 1) {
    if (!/^\s*@/.test(lines[i]) && !/^\s*[)\]}]/.test(lines[i])) break;
    block.push(lines[i]);
  }
  return block.join('\n');
}

const scoperti = [];
const eccezioniUsate = new Set();

for (const file of walk(ROOT)) {
  const rel = file.split(path.sep).join('/');
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const classLine = lines.findIndex((l) => /^export class /.test(l));
  if (classLine < 0) continue;

  const head = lines.slice(0, classLine).join('\n');
  if (!/TenantPermissionsGuard/.test(head)) continue;
  if (AMMESSI.has(rel)) {
    eccezioniUsate.add(rel);
    continue;
  }
  const classGate = GATE.test(head);

  for (let i = classLine + 1; i < lines.length; i += 1) {
    if (!VERB.test(lines[i])) continue;
    const block = decoratorsAround(lines, i);
    if (classGate || GATE.test(block) || PUBLIC.test(block)) continue;
    scoperti.push(`${rel}:${i + 1}  ${lines[i].trim()}`);
  }
}

const eccezioniMorte = [...AMMESSI.keys()].filter((f) => !eccezioniUsate.has(f));

if (scoperti.length > 0 || eccezioniMorte.length > 0) {
  if (scoperti.length > 0) {
    console.error(`\n✗ ${scoperti.length} endpoint senza porta:\n`);
    for (const s of scoperti) console.error(`   ${s}`);
    console.error(
      '\n  Aggiungi @RequireAnyPermissions / @RequireAllPermissionGroups / @Roles,' +
        '\n  oppure @Public() se l’endpoint è aperto per davvero.\n',
    );
  }
  for (const f of eccezioniMorte) {
    console.error(`✗ eccezione che non serve più: ${f} — toglila dall’elenco.`);
  }
  process.exit(1);
}

const totali = walk(ROOT).length;
console.log(`✓ porte: ${totali} controller, ogni endpoint a permessi ha la sua.`);
