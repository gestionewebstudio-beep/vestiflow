/**
 * Prove OFFLINE dei tre cancelli di `prisma-deploy-prova-condivisa.mjs`: nessun
 * Prisma, nessuna rete. Il modulo si importa senza eseguire.
 *
 * ⭐ Che cosa falsificano: un bersaglio locale è rifiutato (ha i suoi script),
 *    una conferma che non ripete l'host è rifiutata, un backup vecchio, senza
 *    database o senza manifest non fa partire niente.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { verificaBackup, verificaBersaglioCondiviso } from './prisma-deploy-prova-condivisa.mjs';

const REMOTO = 'postgresql://u:p@aws-0-eu-west-1.pooler.supabase.com:5432/postgres';

test('il bersaglio remoto passa solo con la conferma che ne ripete l’host', () => {
  assert.equal(verificaBersaglioCondiviso(REMOTO, 'aws-0-eu-west-1.pooler.supabase.com').ok, true);
  const senza = verificaBersaglioCondiviso(REMOTO, undefined);
  assert.equal(senza.ok, false);
  assert.match(senza.motivo, /--conferma/);
  const sbagliata = verificaBersaglioCondiviso(REMOTO, 'altro-host');
  assert.equal(sbagliata.ok, false);
});

test('un bersaglio LOCALE è rifiutato: TEST e COLLAUDO hanno i loro script', () => {
  for (const url of [
    'postgresql://u:p@localhost:5433/vestiflow_test',
    'postgresql://u:p@127.0.0.1:5434/vestiflow_collaudo',
  ]) {
    const esito = verificaBersaglioCondiviso(url, new URL(url).hostname);
    assert.equal(esito.ok, false, url);
    assert.match(esito.motivo, /prisma:deploy:test e prisma:deploy:collaudo/);
  }
  assert.equal(verificaBersaglioCondiviso('non-una-url', 'x').ok, false);
});

function cartellaBackup(manifest, conFile = true) {
  const dir = mkdtempSync(join(tmpdir(), 'vf-backup-'));
  if (manifest !== null) {
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
  }
  if (conFile) {
    writeFileSync(join(dir, 'database.dump.enc'), 'x');
  }
  return dir;
}

test('il backup deve esistere, contenere il database ed essere recente', () => {
  const adesso = Date.parse('2026-09-12T12:00:00.000Z');
  const buono = {
    createdAt: '2026-09-12T10:00:00.000Z',
    components: { database: { file: 'database.dump.enc' } },
  };
  const ok = verificaBackup(cartellaBackup(buono), adesso);
  assert.equal(ok.ok, true);
  assert.equal(ok.ore.toFixed(1), '2.0');

  assert.match(verificaBackup(cartellaBackup(null), adesso).motivo, /manca .*manifest\.json/);
  assert.match(
    verificaBackup(cartellaBackup({ ...buono, components: { storage: {} } }), adesso).motivo,
    /non contiene il database/,
  );
  assert.match(verificaBackup(cartellaBackup(buono, false), adesso).motivo, /manca il file/);
  assert.match(
    verificaBackup(cartellaBackup({ ...buono, createdAt: '2026-09-10T10:00:00.000Z' }), adesso)
      .motivo,
    /ha 50\.0 ore/,
  );
});
