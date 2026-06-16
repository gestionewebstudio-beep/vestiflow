/**
 * Verifica di sicurezza RLS (gira in CI).
 *
 * Scopo: garantire che la Data API pubblica di Supabase (PostgREST) NON esponga
 * dati a chi possiede solo la anon/publishable key (pubblica, nel bundle JS).
 *
 * Come: scopre i nomi tabella dallo schema Prisma (`@@map("...")`) — cosi' ogni
 * nuova tabella e' inclusa in automatico — e interroga ogni tabella con la anon
 * key. Il test FALLISCE se anche una sola tabella restituisce righe.
 *
 * Esiti accettati per tabella:
 *  - 401/403            → ruolo anon revocato (default deny forte). OK.
 *  - 200 con array []   → RLS attiva senza policy (nessuna riga). OK.
 *  - 404 / PGRST205     → tabella non esposta da PostgREST. OK.
 *  - 200 con >=1 riga   → DATI ESPOSTI. FAIL.
 *
 * Variabili d'ambiente richieste (anon key e URL sono pubblici):
 *  - SUPABASE_URL
 *  - SUPABASE_ANON_KEY
 *
 * Uso locale:  SUPABASE_URL=... SUPABASE_ANON_KEY=... node scripts/check-rls.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = join(root, 'api/prisma/schema.prisma');

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, '');
const anonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !anonKey) {
  console.error(
    '[check-rls] SUPABASE_URL e SUPABASE_ANON_KEY sono obbligatorie ' +
      '(impostale come GitHub repo variables: entrambe pubbliche).',
  );
  process.exit(2);
}

const schema = readFileSync(schemaPath, 'utf8');
const tables = [...schema.matchAll(/@@map\("([^"]+)"\)/g)].map((m) => m[1]);

if (tables.length === 0) {
  console.error('[check-rls] Nessuna tabella trovata nello schema Prisma.');
  process.exit(2);
}

const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };
const failures = [];

console.log(`[check-rls] Verifico ${tables.length} tabelle su ${supabaseUrl}`);

for (const table of tables) {
  const url = `${supabaseUrl}/rest/v1/${table}?select=*&limit=1`;
  let status;
  let leaked = false;
  let detail = '';

  try {
    const res = await fetch(url, { headers });
    status = res.status;
    if (status === 200) {
      const body = await res.json();
      if (Array.isArray(body) && body.length > 0) {
        leaked = true;
        detail = `${body.length} riga/e restituite`;
      } else {
        detail = 'array vuoto (RLS attiva)';
      }
    } else if (status === 401 || status === 403) {
      detail = 'accesso negato (anon revocato)';
    } else if (status === 404) {
      detail = 'non esposta da PostgREST';
    } else {
      detail = `status inatteso`;
    }
  } catch (error) {
    failures.push(`${table}: errore di rete (${String(error)})`);
    continue;
  }

  if (leaked) {
    failures.push(`${table}: DATI ESPOSTI alla anon key (${detail})`);
    console.error(`  ✗ ${table} — HTTP ${status} — ${detail}`);
  } else {
    console.log(`  ✓ ${table} — HTTP ${status} — ${detail}`);
  }
}

if (failures.length > 0) {
  console.error(`\n[check-rls] FALLITO: ${failures.length} tabella/e esposta/e:`);
  for (const f of failures) {
    console.error(`  - ${f}`);
  }
  console.error('\nAbilita la RLS sulle tabelle elencate (vedi migration 0003_enable_rls).');
  process.exit(1);
}

console.log(`\n[check-rls] OK: nessuna tabella espone dati alla anon key.`);
