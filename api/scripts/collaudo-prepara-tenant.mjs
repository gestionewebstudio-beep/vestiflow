/**
 * Prepara il TENANT del collaudo reale Shopify (`docs/28`) nel database del
 * collaudo, e SOLO lì: un'azienda con profilo Shopify, due sedi licenziate
 * (A e B — il reso «spedito da A, reintegrato su B» le vuole entrambe) e il
 * titolare, collegato a un utente Supabase Auth GIÀ ESISTENTE.
 *
 *   node scripts/collaudo-prepara-tenant.mjs --auth-user-id <uuid> --email <indirizzo>
 *
 * ⛔ Non scrive su Supabase Auth: l'identità del titolare esiste già (è il suo
 *    accesso di prova); qui nasce solo la riga `users` che la lega al tenant.
 * ⛔ Il bersaglio è verificato prima di aprire la connessione: rifiuta il
 *    condiviso, il database di prova delle suite e qualunque altro nome.
 * ⭐ Idempotente: rieseguito, non duplica (upsert per id fissi).
 */
import { PrismaClient } from '@prisma/client';

import { leggiFileAmbiente } from '../../scripts/backup/load-env.mjs';
import { FILE_AMBIENTE_COLLAUDO, verificaBersaglioCollaudo } from './prisma-deploy-collaudo.mjs';

const TENANT_ID = 'c0a11ad0-0000-4000-8000-000000000001';
const STORE_ID = 'c0a11ad0-0000-4000-8000-000000000002';
const SEDE_A_ID = 'c0a11ad0-0000-4000-8000-00000000000a';
const SEDE_B_ID = 'c0a11ad0-0000-4000-8000-00000000000b';

function argomento(nome) {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function muori(messaggio) {
  console.error(`\n  Fermo: ${messaggio}\n`);
  process.exit(1);
}

const authUserId = argomento('--auth-user-id');
const email = argomento('--email');
if (!authUserId || !/^[0-9a-f-]{36}$/i.test(authUserId)) {
  muori('serve --auth-user-id <uuid dell’utente Supabase Auth del titolare di prova>.');
}
if (!email || !email.includes('@')) {
  muori('serve --email <indirizzo dell’utente di prova>.');
}

const env = leggiFileAmbiente(FILE_AMBIENTE_COLLAUDO);
const bersaglio = verificaBersaglioCollaudo(env['DATABASE_URL']);
if (!bersaglio.ok) {
  muori(`DATABASE_URL del collaudo ${bersaglio.motivo}.`);
}

const prisma = new PrismaClient({ datasources: { db: { url: bersaglio.url.toString() } } });
try {
  const nomeDb = await prisma.$queryRawUnsafe('SELECT current_database() AS db');
  if (nomeDb[0]?.db !== 'vestiflow_collaudo') {
    muori(`connesso a «${nomeDb[0]?.db}», non a vestiflow_collaudo.`);
  }

  const tenant = await prisma.tenant.upsert({
    where: { id: TENANT_ID },
    update: {},
    create: {
      id: TENANT_ID,
      name: 'Collaudo Shopify (prova)',
      channelProfile: 'shopify',
      licensedLocationCount: 2,
    },
  });
  const store = await prisma.store.upsert({
    where: { id: STORE_ID },
    update: {},
    create: { id: STORE_ID, tenantId: tenant.id, name: 'Negozio di collaudo', code: 'COLL-01' },
  });
  for (const [id, name, code] of [
    [SEDE_A_ID, 'Sede A (spedizione)', 'COLL-A'],
    [SEDE_B_ID, 'Sede B (rientro resi)', 'COLL-B'],
  ]) {
    await prisma.location.upsert({
      where: { id },
      update: {},
      create: {
        id,
        tenantId: tenant.id,
        storeId: store.id,
        name,
        code,
        isActive: true,
        licensedInVf: true,
        countryCode: 'IT',
      },
    });
  }
  await prisma.user.upsert({
    where: { authUserId },
    update: { tenantId: tenant.id, role: 'owner', isActive: true },
    create: {
      tenantId: tenant.id,
      authUserId,
      email,
      displayName: 'Titolare di collaudo',
      role: 'owner',
      isActive: true,
    },
  });

  console.log(
    `  tenant «${tenant.name}» pronto su vestiflow_collaudo: 2 sedi (A, B), titolare ${email}`,
  );
} finally {
  await prisma.$disconnect();
}
