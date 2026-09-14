/**
 * Prove OFFLINE di `scripts/env-destinazioni.mjs`: nessun file letto, nessun
 * ambiente. `righeDestinazioni` riceve i valori come parametro, INVENTATI.
 *
 * ⭐ Che cosa falsificano: il difetto del 12/09/2026 — uno strumento che oscurava
 *    per NOME ha stampato una passphrase perché «PASSPHRASE» non era nella lista.
 *    Qui una variabile con un nome mai visto (`QUALCOSA_DI_NUOVO`) deve uscire
 *    senza valore, e una URL con credenziali deve perdere utente, password e query.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { destinazioneDiUrl, MOSTRABILI, righeDestinazioni } from './env-destinazioni.mjs';

const SEGRETO = 'valore-che-non-deve-mai-comparire';

test('una variabile non dichiarata mostrabile esce SENZA valore, qualunque sia il nome', () => {
  const righe = righeDestinazioni({
    BACKUP_ENCRYPTION_PASSPHRASE: SEGRETO,
    QUALCOSA_DI_NUOVO: SEGRETO,
    SHOPIFY_API_KEY: SEGRETO,
  });
  for (const r of righe) {
    assert.equal(r.mostrata, false, r.chiave);
    assert.equal(r.testo.includes(SEGRETO), false, `${r.chiave} ha stampato il valore`);
    assert.match(r.testo, /non mostrata, \d+ caratteri/);
  }
});

test('una URL mostra solo protocollo, host, porta e percorso: mai utente, password, query', () => {
  const d = destinazioneDiUrl(
    `postgresql://utente:${SEGRETO}@aws-0.pooler.example.com:6543/postgres?pgbouncer=true&password=${SEGRETO}`,
  );
  assert.equal(d, 'postgresql://aws-0.pooler.example.com:6543/postgres');
  assert.equal(d.includes(SEGRETO), false);
  assert.equal(d.includes('utente'), false);
});

test('una chiave mostrabile con un valore che non è una URL non lo stampa', () => {
  const [riga] = righeDestinazioni({ DATABASE_URL: SEGRETO });
  assert.equal(riga.mostrata, true);
  assert.equal(riga.testo.includes(SEGRETO), false);
  assert.match(riga.testo, /non è una URL/);
});

test('gli elenchi e i testi dichiarati si mostrano com’è deciso', () => {
  const righe = righeDestinazioni({
    CORS_ORIGINS: 'http://localhost:4200,http://localhost:4212',
    SHOPIFY_API_VERSION: '2026-07',
    FRONTEND_URL: 'http://localhost:4212/',
  });
  assert.deepEqual(
    righe.map((r) => r.testo),
    ['http://localhost:4200 · http://localhost:4212', '2026-07', 'http://localhost:4212'],
  );
});

test('nessuna chiave mostrabile ha un nome che suggerisca un segreto', () => {
  for (const chiave of Object.keys(MOSTRABILI)) {
    assert.doesNotMatch(chiave, /SECRET|KEY|TOKEN|PASS|PHRASE|CREDENTIAL/i, chiave);
  }
});
