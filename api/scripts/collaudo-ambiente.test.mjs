// Guardia per `collaudo-ambiente.mjs` (`npm run test:guardie`): l'ambiente del
// figlio deve resistere a un caricatore di `.env` che NON sovrascrive le chiavi
// definite — che è ciò che fa il client Prisma generato con `api/.env`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { componiAmbienteCollaudo } from './collaudo-ambiente.mjs';

/** Come `dotenv.config`: assegna solo le chiavi NON ancora definite. */
function caricaComeDotenv(ambiente, file) {
  for (const [k, v] of Object.entries(file)) {
    if (!(k in ambiente)) ambiente[k] = v;
  }
  return ambiente;
}

const SVILUPPO = {
  DATABASE_URL: 'postgresql://condiviso:6543/postgres',
  CORS_ORIGINS: 'http://localhost:4200,http://localhost:4210',
  SHOPIFY_APP_URL: 'http://localhost:3000',
  SHOPIFY_TOKEN_ENCRYPTION_KEY: 'chiave-di-sviluppo',
  BACKUP_ENCRYPTION_PASSPHRASE: 'passphrase-di-sviluppo',
  TIKTOK_APP_KEY: 'tiktok-di-sviluppo',
};
const COLLAUDO = {
  DATABASE_URL: 'postgresql://localhost:5434/vestiflow_collaudo',
  PORT: '3100',
  CORS_ORIGINS: 'http://localhost:4212',
  SHOPIFY_APP_URL: 'https://tunnel.example',
  SHOPIFY_TOKEN_ENCRYPTION_KEY: 'chiave-nuova',
};

test('il guasto del 12/09: togliere le chiavi dal figlio lascia entrare api/.env dal caricatore di Prisma', () => {
  // La forma di prima: chiavi del collaudo TOLTE dall'ambiente, file letto dopo.
  const ereditato = { PATH: 'x', CORS_ORIGINS: 'qualcosa' };
  const diPrima = { ...ereditato };
  for (const k of Object.keys(COLLAUDO)) delete diPrima[k];
  caricaComeDotenv(diPrima, SVILUPPO); // il client Prisma, al primo require
  caricaComeDotenv(diPrima, COLLAUDO); // ConfigModule: process.env vince sul file
  assert.equal(diPrima.DATABASE_URL, SVILUPPO.DATABASE_URL, 'il condiviso entrava davvero');
  assert.equal(diPrima.CORS_ORIGINS, SVILUPPO.CORS_ORIGINS);
  assert.equal(diPrima.PORT, '3100', 'la porta faceva sembrare tutto giusto');
});

test('con la composizione: ogni chiave del collaudo vale, e nessuna di sviluppo entra', () => {
  const ereditato = { PATH: 'x', CORS_ORIGINS: 'qualcosa', DATABASE_URL: 'dalla-shell' };
  const ambiente = componiAmbienteCollaudo(
    ereditato,
    COLLAUDO,
    Object.keys(SVILUPPO),
    '.env.collaudo.local',
  );
  caricaComeDotenv(ambiente, SVILUPPO); // il client Prisma non trova chiavi libere
  for (const [k, v] of Object.entries(COLLAUDO)) assert.equal(ambiente[k], v, k);
  assert.equal(
    ambiente.BACKUP_ENCRYPTION_PASSPHRASE,
    '',
    'presente solo in .env: vuota, non di sviluppo',
  );
  assert.equal(ambiente.TIKTOK_APP_KEY, '');
  assert.equal(ambiente.VESTIFLOW_ENV_FILE, '.env.collaudo.local');
  assert.equal(ambiente.PATH, 'x', 'il resto della shell resta');
});

test('i valori di sviluppo non servono e non si passano: bastano i NOMI', () => {
  const ambiente = componiAmbienteCollaudo({}, COLLAUDO, ['SOLO_SVILUPPO'], '.env.collaudo.local');
  assert.equal(ambiente.SOLO_SVILUPPO, '');
  assert.ok(!Object.values(ambiente).includes('passphrase-di-sviluppo'));
});
