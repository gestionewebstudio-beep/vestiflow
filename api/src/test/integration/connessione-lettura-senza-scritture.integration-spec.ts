import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { avviaApp, chiama, type AppIntegrazione } from './app';
import { creaDataset, IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';
import { ShopifyConnectionService } from '../../shopify/shopify-connection.service';

/**
 * ⛔ **Leggere la connessione non deve scriverla** (docs/30 §1, §5, #7).
 *
 * Misurato sul codice di `develop` (`01852516`) il 15/09/2026: `getForTenant` chiamava
 * `healStaleErrorStatus`, che riportava `error → connected` a ogni lettura purché la
 * credenziale esistesse — senza guardare la causa. Con quattro lettori per apertura di
 * pagina e un sondaggio ogni 15 s, uno stato `error` scritto da `recordError` viveva al
 * massimo 15 s, il rifiuto del push su `status ≠ connected` era praticamente inerte, e
 * una GET dichiarata «in sola lettura» faceva `updateMany`.
 *
 * ⭐ La guarigione resta dove è ESPLICITA: `touchSync` (una sincronizzazione riuscita),
 *    «Azzera le segnalazioni di errore», il ritorno dall'OAuth e l'import riuscito
 *    (`shopify-product-pull.service.ts`). Nessun'altra regola degli stati cambia.
 */
describe('Connessione Shopify: la lettura non scrive (API → PostgreSQL isolato)', () => {
  const DOMINIO = 'lettura-senza-scritture.myshopify.com';
  let prisma: PrismaClient;
  let app: AppIntegrazione | undefined;
  let token: string;

  beforeAll(async () => {
    prisma = creaClientIntegrazione();
  });

  afterAll(async () => {
    await app?.chiudi();
    if (prisma) {
      await svuota(prisma).catch(() => undefined);
      await prisma.$disconnect().catch(() => undefined);
    }
  });

  beforeEach(async () => {
    await svuota(prisma);
    await creaDataset(prisma);
    await prisma.user.update({ where: { id: IDS.utenteA1 }, data: { role: 'owner' } });
    await prisma.shopifyConnection.create({
      data: {
        tenantId: IDS.tenantA,
        status: 'connected',
        shopDomain: DOMINIO,
        scopes: ['read_products', 'write_inventory'],
        autoSyncEnabled: true,
      },
    });
    await prisma.shopifyCredential.create({
      data: {
        tenantId: IDS.tenantA,
        shopDomain: DOMINIO,
        accessTokenEnc: 'cifrato',
        scopes: ['read_products', 'write_inventory'],
      },
    });
    app ??= await avviaApp();
    token = await app.token(IDS.authA1);
  });

  /** La riga com'è ADESSO, per un confronto integrale (anche `updatedAt`: ogni scrittura la muove). */
  async function riga() {
    return prisma.shopifyConnection.findUniqueOrThrow({ where: { tenantId: IDS.tenantA } });
  }

  function servizio(): ShopifyConnectionService {
    // Il servizio vero sul database di prova: solo `recordError`, `touchSync` e
    // `healStaleErrorStatus` — nessuna configurazione Shopify serve a questi metodi.
    return new ShopifyConnectionService(prisma as never, {} as never);
  }

  it('riproduzione: una connessione in errore letta con GET /shopify/connection RESTA in errore, con la sua causa', async () => {
    await servizio().recordError(
      IDS.tenantA,
      'Ordine 1: payload senza righe',
      'order_payload_senza_righe',
    );
    const prima = await riga();
    expect(prima.status).toBe('error');

    const risposta = await chiama(app!, 'GET', '/shopify/connection', { token });
    expect(risposta.stato, JSON.stringify(risposta.corpo)).toBe(200);
    const corpo = risposta.corpo as { status: string; lastError: { code?: string } | null };

    // ⛔ Qui `develop` rispondeva `connected` e aveva già riscritto la riga.
    expect(corpo.status).toBe('error');
    expect(corpo.lastError?.code).toBe('order_payload_senza_righe');
    expect(await riga()).toEqual(prima);
  });

  it('letture ripetute lasciano la riga IDENTICA, stato ed errori compresi', async () => {
    await servizio().recordError(IDS.tenantA, 'Shopify Admin API error (502)', 'api_failure');
    const prima = await riga();

    for (let n = 0; n < 3; n += 1) {
      const connessione = await chiama(app!, 'GET', '/shopify/connection', { token });
      expect(connessione.stato).toBe(200);
      // ⚠️ `GET /shopify/setup` passa dalla stessa `getForTenant`, ma legge anche le
      //    location DAL NEGOZIO (`locationsConScelte`): qui non c'è un negozio, e la
      //    prova resta sulla lettura della connessione.
    }

    expect(await riga()).toEqual(prima);
  });

  it('i percorsi ESPLICITI di recupero continuano a guarire: touchSync, «Azzera», healStaleErrorStatus', async () => {
    const s = servizio();

    // 1 · una sincronizzazione riuscita: stato `connected`, errori azzerati.
    await s.recordError(IDS.tenantA, 'errore uno', 'uno');
    await s.touchSync(IDS.tenantA);
    let dopo = await riga();
    expect(dopo.status).toBe('connected');
    expect(dopo.lastErrorCode).toBeNull();
    expect(dopo.lastErrorAt).toBeNull();

    // 2 · «Azzera le segnalazioni di errore» dal titolare: stessa cosa, via HTTP.
    await s.recordError(IDS.tenantA, 'errore due', 'due');
    const azzera = await chiama(app!, 'POST', '/shopify/connection/clear-errors', { token });
    expect(azzera.stato, JSON.stringify(azzera.corpo)).toBe(201);
    dopo = await riga();
    expect(dopo.status).toBe('connected');
    expect(dopo.lastErrorCode).toBeNull();

    // 3 · la guarigione chiamata apposta (ritorno OAuth, import riuscito) resta com'era.
    await s.recordError(IDS.tenantA, 'errore tre', 'tre');
    await s.healStaleErrorStatus(IDS.tenantA);
    dopo = await riga();
    expect(dopo.status).toBe('connected');
    // ⚠️ Guarisce lo STATO, non la causa: il messaggio resta finché una sync o «Azzera» lo tolgono.
    expect(dopo.lastErrorCode).toBe('tre');
  });

  it('senza credenziale la guarigione esplicita non scatta, e la lettura non cambia niente', async () => {
    await prisma.shopifyCredential.delete({ where: { tenantId: IDS.tenantA } });
    const s = servizio();
    await s.recordError(IDS.tenantA, 'token perso', 'token');
    const prima = await riga();

    await s.healStaleErrorStatus(IDS.tenantA);
    expect((await riga()).status).toBe('error');

    const risposta = await chiama(app!, 'GET', '/shopify/connection', { token });
    expect(risposta.stato).toBe(200);
    expect((risposta.corpo as { status: string }).status).toBe('error');
    expect(await riga()).toEqual(prima);
  });
});
