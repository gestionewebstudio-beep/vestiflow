/**
 * Avvia l'API del COLLAUDO REALE Shopify (`docs/28`) da `dist/`, con il SOLO
 * file di ambiente del collaudo — mai `api/.env`.
 *
 * ⭐ Prima di avviare, verifica ciò che l'istanza userebbe:
 *    - il file esiste (`api/.env.collaudo.local`);
 *    - `DATABASE_URL` e `DIRECT_URL` puntano a `localhost:5434/vestiflow_collaudo`
 *      (la stessa guardia di `prisma:deploy:collaudo`);
 *    - `PORT` non è la 3000 dell'API di sviluppo;
 *    - `dist/main.js` esiste ed è più recente dei sorgenti toccati di recente?
 *      No: si dice solo QUANDO è stato compilato, e chi avvia decide.
 *
 * ⛔ Non tocca nessun processo esistente: è una seconda istanza, su un'altra
 *    porta, con un altro database. Si ferma con Ctrl+C.
 */
import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { leggiFileAmbiente } from '../../scripts/backup/load-env.mjs';
import { componiAmbienteCollaudo } from './collaudo-ambiente.mjs';
import { FILE_AMBIENTE_COLLAUDO, verificaBersaglioCollaudo } from './prisma-deploy-collaudo.mjs';

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function muori(messaggio) {
  console.error(`\n  Fermo: ${messaggio}\n`);
  process.exit(1);
}

if (!existsSync(FILE_AMBIENTE_COLLAUDO)) {
  muori(`manca ${FILE_AMBIENTE_COLLAUDO} (modello: api/.env.collaudo.example).`);
}
const env = leggiFileAmbiente(FILE_AMBIENTE_COLLAUDO);
for (const nome of ['DATABASE_URL', 'DIRECT_URL']) {
  const esito = verificaBersaglioCollaudo(env[nome]);
  if (!esito.ok) {
    muori(`${nome} ${esito.motivo}.`);
  }
}
if (!env['PORT'] || env['PORT'] === '3000') {
  muori(`PORT deve essere dichiarata e diversa da 3000 (l'API di sviluppo): attesa 3100.`);
}
if (!env['SHOPIFY_APP_URL']) {
  muori(`SHOPIFY_APP_URL manca: senza l'URL pubblico del tunnel i webhook veri non arrivano.`);
}
// ⛔ I nomi dei bucket vengono SOLO dall'ambiente, e i servizi ripiegano sui nomi
//    ORIGINALI se la variabile manca (`?? 'product-media'`…): una copia ripristinata
//    scriverebbe nei bucket di sviluppo. Qui i quattro devono esserci e non
//    coincidere con i nomi originali.
const BUCKET_ORIGINALI = {
  SUPABASE_PRODUCT_MEDIA_BUCKET: 'product-media',
  SUPABASE_USER_AVATARS_BUCKET: 'user-avatars',
  SUPABASE_DOCUMENT_ATTACHMENTS_BUCKET: 'document-attachments',
  SUPABASE_SUPPLIER_ATTACHMENTS_BUCKET: 'supplier-attachments',
};
for (const [nome, originale] of Object.entries(BUCKET_ORIGINALI)) {
  const valore = env[nome]?.trim();
  if (!valore || valore === originale) {
    muori(
      `${nome} deve essere dichiarata e diversa da «${originale}»: la copia non deve scrivere nei bucket originali.`,
    );
  }
}
const main = join(apiRoot, 'dist', 'main.js');
if (!existsSync(main)) {
  muori(`manca ${main}: compila prima con «npm run build» in api/.`);
}
console.log(`  dist/main.js compilato il ${statSync(main).mtime.toLocaleString('it-IT')}`);
console.log(`  ambiente: ${FILE_AMBIENTE_COLLAUDO}`);
console.log(`  database: localhost:5434/vestiflow_collaudo · porta API: ${env['PORT']}\n`);

// ⛔ Qui c'era il contrario: le chiavi del file si TOGLIEVANO dall'ambiente
//    ereditato «così a valere è solo il file». Il client Prisma generato carica
//    `api/.env` al primo require, proprio nelle chiavi non definite: l'istanza
//    girava sul CONDIVISO con la porta del collaudo (12/09/2026 sera, misurato).
//    Ora le chiavi del collaudo si METTONO nell'ambiente, e quelle che solo
//    `api/.env` dichiara si azzerano: `collaudo-ambiente.mjs`.
const fileSviluppo = join(apiRoot, '.env');
const chiaviSviluppo = existsSync(fileSviluppo) ? Object.keys(leggiFileAmbiente(fileSviluppo)) : [];
const figlio = spawn(process.execPath, [main], {
  cwd: apiRoot,
  stdio: 'inherit',
  env: componiAmbienteCollaudo(process.env, env, chiaviSviluppo, '.env.collaudo.local'),
});
figlio.on('exit', (codice) => process.exit(codice ?? 1));
