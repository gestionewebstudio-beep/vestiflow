/**
 * Prove OFFLINE della guardia di `prisma-deploy-collaudo.mjs`: nessun Prisma,
 * nessun database. Il modulo si importa senza eseguire (`invocatoDirettamente`).
 *
 * ⭐ Che cosa falsificano: il comando che riscrive uno schema deve rifiutare il
 *    condiviso, il database di prova delle suite (5433) e un PostgreSQL qualunque
 *    (5432), e accettare SOLO `localhost:5434/vestiflow_collaudo`.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { verificaBersaglioCollaudo } from './prisma-deploy-collaudo.mjs';

test('accetta solo il database del collaudo, su 5434', () => {
  const esito = verificaBersaglioCollaudo('postgresql://u:p@localhost:5434/vestiflow_collaudo');
  assert.equal(esito.ok, true);
  assert.equal(
    verificaBersaglioCollaudo('postgresql://u:p@127.0.0.1:5434/vestiflow_collaudo').ok,
    true,
  );
});

test('rifiuta il condiviso, il database di prova delle suite e un PostgreSQL qualunque', () => {
  const casi = [
    ['postgresql://u:p@aws-0-eu-west-1.pooler.supabase.com:6543/postgres', /non è locale/],
    ['postgresql://u:p@localhost:5433/vestiflow_test', /porta 5433/],
    ['postgresql://u:p@localhost:5432/vestiflow_collaudo', /porta 5432/],
    ['postgresql://u:p@localhost:5434/vestiflow_test', /atteso «vestiflow_collaudo»/],
    ['', /non è una URL/],
    [undefined, /non è una URL/],
  ];
  for (const [url, motivo] of casi) {
    const esito = verificaBersaglioCollaudo(url);
    assert.equal(esito.ok, false, String(url));
    assert.match(esito.motivo, motivo, String(url));
  }
});
