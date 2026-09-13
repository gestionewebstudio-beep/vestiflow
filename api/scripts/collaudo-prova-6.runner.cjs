/**
 * PROVA 6 del collaudo reale (`docs/28` §3): DISCONNETTI e RICONNESSIONE allo stesso negozio.
 * Fotografia in sola lettura di ciò che deve restare uguale (sedi, coppie e periodi, percorso,
 * ordini e movimenti) e di ciò che cambia legittimamente (connessione, notifiche); il token
 * si confronta per IMPRONTA (sha256 del valore decifrato), mai stampato.
 *
 *   node scripts/collaudo-esegui.mjs collaudo-prova-6.runner.cjs prima
 *      → salva la fotografia in <scratch>/prova-6-prima.json
 *   node scripts/collaudo-esegui.mjs collaudo-prova-6.runner.cjs dopo
 *      → rifotografa e confronta con «prima», voce per voce
 */
'use strict';

const { createHash } = require('node:crypto');
const { readFileSync, writeFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');

async function main() {
  const [fase] = process.argv.slice(2);
  if (!['prima', 'dopo'].includes(fase ?? '')) {
    throw new Error('indica la fase: prima|dopo');
  }
  const cartella = process.env.PROVA6_CARTELLA ?? __dirname;
  const file = join(cartella, 'prova-6-prima.json');

  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module');
  const { PrismaService } = require('../dist/prisma/prisma.service');
  const { ShopifyCryptoService } = require('../dist/shopify/shopify-crypto.service');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const prisma = app.get(PrismaService);
    const db = await prisma.$queryRawUnsafe('SELECT current_database() AS db');
    if (db[0]?.db !== 'vestiflow_collaudo') {
      throw new Error(`database «${db[0]?.db}», non vestiflow_collaudo`);
    }
    const conn = await prisma.shopifyConnection.findFirstOrThrow({
      select: {
        tenantId: true,
        status: true,
        shopDomain: true,
        scopes: true,
        autoSyncEnabled: true,
        webhookTopics: true,
        webhookAddress: true,
        webhooksActivatedAt: true,
        lastWebhookEventAt: true,
      },
    });
    const tenantId = conn.tenantId;
    const credenziale = await prisma.shopifyCredential.findUnique({
      where: { tenantId },
      select: { accessTokenEnc: true, scopes: true },
    });
    let improntaToken = null;
    if (credenziale) {
      const crypto = app.get(ShopifyCryptoService);
      improntaToken = createHash('sha256')
        .update(crypto.decrypt(credenziale.accessTokenEnc))
        .digest('hex')
        .slice(0, 16);
    }
    const sedi = await prisma.location.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, shopifyLocationId: true, isActive: true, licensedInVf: true },
    });
    const coppie = await prisma.shopifyLocationPair.findMany({
      where: { tenantId },
      orderBy: { shopifyLocationGid: 'asc' },
      select: {
        locationId: true,
        shopifyLocationGid: true,
        periodi: {
          orderBy: { linkedAt: 'asc' },
          select: { status: true, closeReason: true, linkedAt: true, closedAt: true },
        },
      },
    });
    const setup = await prisma.shopifySetup.findUnique({
      where: { tenantId },
      select: { status: true, direction: true, activatedAt: true },
    });
    const ordini = await prisma.salesOrder.count({ where: { tenantId } });
    const movimenti = await prisma.stockMovement.count({ where: { tenantId } });
    const vendite = await prisma.onlineSale.count({ where: { tenantId } });
    const impegni = await prisma.stockReservation.count({ where: { tenantId, status: 'active' } });

    const foto = {
      connessione: {
        status: conn.status,
        shopDomain: conn.shopDomain,
        scopes: [...conn.scopes].sort(),
        autoSyncEnabled: conn.autoSyncEnabled,
        webhookTopics: [...conn.webhookTopics].sort(),
        webhookAddress: conn.webhookAddress,
        webhooksActivatedAt: conn.webhooksActivatedAt,
        lastWebhookEventAt: conn.lastWebhookEventAt,
      },
      credenziale: credenziale
        ? { improntaToken, scopes: [...credenziale.scopes].sort() }
        : null,
      sedi,
      coppie,
      setup,
      conteggi: { ordini, movimenti, vendite, impegniAttivi: impegni },
    };

    if (fase === 'prima') {
      writeFileSync(file, JSON.stringify(foto, null, 2));
      console.log(`── PRIMA (salvata in ${file})`);
      stampa(foto);
      return;
    }
    if (!existsSync(file)) {
      throw new Error(`manca la fotografia «prima»: ${file}`);
    }
    const prima = JSON.parse(readFileSync(file, 'utf8'));
    console.log('── DOPO');
    stampa(foto);
    console.log('── CONFRONTO con «prima»');
    const uguale = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const riga = (nome, ok, dettaglio) => console.log(`   ${ok ? '✓' : '⚠️'} ${nome}${dettaglio ? ` — ${dettaglio}` : ''}`);
    riga('sedi (nomi, cache shopifyLocationId, attive)', uguale(prima.sedi, foto.sedi));
    riga('coppie e periodi', uguale(prima.coppie, foto.coppie));
    riga('percorso (stato, direzione, attivazione)', uguale(prima.setup, foto.setup));
    riga('ordini · movimenti · vendite · impegni attivi', uguale(prima.conteggi, foto.conteggi), JSON.stringify(foto.conteggi));
    riga(
      'token',
      prima.credenziale?.improntaToken === foto.credenziale?.improntaToken,
      prima.credenziale?.improntaToken === foto.credenziale?.improntaToken
        ? 'STESSO token offline (stessa impronta)'
        : 'token DIVERSO',
    );
    riga('ambiti', uguale(prima.credenziale?.scopes, foto.credenziale?.scopes), (foto.credenziale?.scopes ?? []).join(' '));
    riga('stato connessione', foto.connessione.status === 'connected', foto.connessione.status);
    riga('aggiornamenti automatici', foto.connessione.autoSyncEnabled === prima.connessione.autoSyncEnabled, String(foto.connessione.autoSyncEnabled));
    riga('notifiche registrate', foto.connessione.webhookTopics.length >= prima.connessione.webhookTopics.length, `${foto.connessione.webhookTopics.length} (prima ${prima.connessione.webhookTopics.length}) → ${foto.connessione.webhookAddress ?? '—'}`);
  } finally {
    await app.close();
  }
}

function stampa(foto) {
  const ora = (d) => (d ? new Date(d).toISOString().slice(0, 19).replace('T', ' ') : '—');
  const c = foto.connessione;
  console.log(
    `   connessione: ${c.status} · ${c.shopDomain} · auto ${c.autoSyncEnabled} · ${c.webhookTopics.length} notifiche → ${c.webhookAddress ?? '—'} (attivate ${ora(c.webhooksActivatedAt)}) · ultimo webhook ${ora(c.lastWebhookEventAt)}`,
  );
  console.log(`   ambiti: ${c.scopes.join(' ')}`);
  console.log(`   credenziale: ${foto.credenziale ? `token presente (impronta ${foto.credenziale.improntaToken})` : 'ASSENTE'}`);
  console.log(`   percorso: ${foto.setup ? `${foto.setup.status} · ${foto.setup.direction} · attivato ${ora(foto.setup.activatedAt)}` : 'ASSENTE'}`);
  for (const s of foto.sedi) {
    const coppia = foto.coppie.find((p) => p.locationId === s.id);
    const periodi = coppia ? coppia.periodi.map((p) => `${p.status}${p.closeReason ? ` (${p.closeReason})` : ''}`).join(', ') : 'nessuna coppia';
    console.log(`   sede «${s.name}»: cache ${s.shopifyLocationId ?? '—'} · ${coppia ? coppia.shopifyLocationGid : '—'} · periodi: ${periodi}`);
  }
  console.log(`   conteggi: ${JSON.stringify(foto.conteggi)}`);
}

main().catch((e) => {
  console.error('Fermo:', e.message);
  process.exit(1);
});
