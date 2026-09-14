/**
 * Prove OFFLINE di `webhook-sottoscrizioni.mjs`: nessuna rete, nessun database.
 * Il modulo si importa senza eseguire (`invocatoDirettamente`).
 *
 * ⭐ Che cosa falsificano: il ripristino si verifica su (topic, indirizzo,
 *    versione) e NON sugli id — che Shopify riassegna — e una sottoscrizione
 *    mancante, in più o con un indirizzo diverso non passa.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { chiave, stessoInsieme } from './webhook-sottoscrizioni.mjs';

const PROD = 'https://vestiflow-production.up.railway.app/api/v1/shopify/webhooks';
const FOTO = [
  { id: 1, topic: 'inventory_levels/update', address: PROD, api_version: '2026-07' },
  { id: 2, topic: 'products/create', address: PROD, api_version: '2026-07' },
  { id: 3, topic: 'products/update', address: PROD, api_version: '2026-07' },
];

test('stesso insieme con id diversi e ordine diverso', () => {
  const dopo = [
    { id: 30, topic: 'products/update', address: PROD, api_version: '2026-07' },
    { id: 10, topic: 'inventory_levels/update', address: PROD, api_version: '2026-07' },
    { id: 20, topic: 'products/create', address: PROD, api_version: '2026-07' },
  ];
  assert.equal(stessoInsieme(FOTO, dopo), true);
});

test('una mancante, una in più o un indirizzo diverso: NON è un ripristino', () => {
  assert.equal(stessoInsieme(FOTO, FOTO.slice(0, 2)), false);
  assert.equal(
    stessoInsieme(FOTO, [
      ...FOTO,
      { id: 4, topic: 'orders/create', address: PROD, api_version: '2026-07' },
    ]),
    false,
  );
  const tunnel = FOTO.map((w) => ({
    ...w,
    address: 'https://x.trycloudflare.com/api/v1/shopify/webhooks',
  }));
  assert.equal(stessoInsieme(FOTO, tunnel), false);
  const versione = FOTO.map((w) => ({ ...w, api_version: '2026-04' }));
  assert.equal(stessoInsieme(FOTO, versione), false);
});

test('la chiave non contiene l’id', () => {
  assert.equal(chiave(FOTO[0]).includes('1'), chiave({ ...FOTO[0], id: 999 }).includes('1'));
  assert.equal(chiave(FOTO[0]), chiave({ ...FOTO[0], id: 999 }));
});
