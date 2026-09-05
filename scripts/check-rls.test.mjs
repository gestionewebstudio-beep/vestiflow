import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
function run(args, response, credentials = true) {
  const stub =
    response === null
      ? "globalThis.fetch=()=>{throw new Error('NETWORK_FORBIDDEN')}"
      : `globalThis.fetch=async()=>({status:${response.status},json:async()=>(${JSON.stringify(response.body)})})`;
  return spawnSync(
    process.execPath,
    [
      '--import',
      `data:text/javascript,${encodeURIComponent(stub)}`,
      'scripts/check-rls.mjs',
      ...args,
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        SUPABASE_URL: credentials ? 'http://invalid.test' : '',
        SUPABASE_ANON_KEY: credentials ? 'fixture' : '',
      },
    },
  );
}

test('statico senza credenziali e senza rete', () => {
  const result = run(['--static'], null, false);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /statica/i);
  assert.doesNotMatch(result.stdout, /nessuna tabella espone/);
});
test('statico non contatta la rete neppure con credenziali presenti', () => {
  const result = run(['--static'], null);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
test('il comando ordinario continua a richiedere la verifica live', () => {
  assert.equal(run([], null, false).status, 2);
});
for (const status of [401, 403, 404, 200]) {
  test(`sonda live HTTP ${status} senza righe`, () => {
    assert.equal(run([], { status, body: [] }).status, 0);
  });
}
for (const response of [
  { status: 500, body: [] },
  { status: 200, body: {} },
  { status: 200, body: [{ id: 'fixture' }] },
]) {
  test(`sonda live inconcludente o dati esposti: ${JSON.stringify(response)}`, () => {
    assert.equal(run([], response).status, 1);
  });
}
