import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { avviaApp, chiama, type AppIntegrazione } from './app';
import { creaDataset, IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';

/**
 * ⛔ **«LA NUOVA VENDITA AL BANCO NON SI SALVA»** — segnalato dal proprietario
 * il 30/08/2026, e rimasto in `DA-FARE` §1 come «causa da trovare».
 *
 * ⭐ **Qui la causa si CERCA, non si indovina.** La richiesta parte da un socket
 * vero e attraversa il percorso intero — `JwtAuthGuard` → controller → service →
 * Prisma → PostgreSQL di prova — con la stessa `ValidationPipe` di produzione,
 * `forbidNonWhitelisted` compreso. Se il server rifiuta, questa prova dice
 * **con quale stato e con quale messaggio**.
 *
 * ⚠️ **Nessuna prova esistente lo copriva**: quelle del servizio girano su
 * Prisma finto, e non vedono né la validazione del DTO né i vincoli del
 * database — che sono i due posti dove un salvataggio muore.
 *
 * ⚠️ **Il corpo è quello che manda la maschera**, campo per campo
 * (`salePayload` + `storeSaleLinePayload`): una prova che mandasse un payload
 * «pulito» inventato qui certificherebbe un client che non esiste.
 */
const PRODOTTO = '5a100000-0000-4000-8000-00000000e001';
const VARIANTE = '5a200000-0000-4000-8000-00000000e002';

describe('Vendita al banco — creazione HTTP su PostgreSQL TEST', () => {
  let app: AppIntegrazione;
  let prisma: PrismaClient;
  let token: string;

  beforeAll(async () => {
    prisma = creaClientIntegrazione();
    await creaDataset(prisma);

    await prisma.product.create({
      data: {
        id: PRODOTTO,
        tenantId: IDS.tenantA,
        articleCode: 'ART-BANCO-1',
        name: 'Maglia cotone — integrazione',
      },
    });
    await prisma.productVariant.create({
      data: {
        id: VARIANTE,
        tenantId: IDS.tenantA,
        productId: PRODOTTO,
        sku: 'SKU-BANCO-1',
        sellingPriceMinor: 2500,
      },
    });

    app = await avviaApp();
    token = await app.token(IDS.authA1);
  }, 120_000);

  afterAll(async () => {
    await app?.chiudi();
    if (prisma) {
      await svuota(prisma);
      await prisma.$disconnect();
    }
  }, 60_000);

  /** Il corpo esatto della maschera, con un intento nuovo a ogni chiamata. */
  function corpoVendita(intento: string, righe: readonly unknown[]) {
    return {
      creationIntentId: intento,
      locationId: IDS.locA1,
      documentDate: '2026-09-01',
      pricesIncludeVat: true,
      lines: righe,
    };
  }

  const riga = {
    variantId: VARIANTE,
    quantity: 1,
    loadsStock: true,
    // ⚠️ Con la coda decimale dello scorporo: 25,00 € ivati al 22% sono
    //    2049,180328 centesimi netti, troncati a quattro cifre di centesimo.
    unitPriceMinor: 2049.1803,
  };

  it('⭐ una vendita nuova con una riga SI SALVA', async () => {
    const esito = await chiama(app, 'POST', '/store-sales', {
      token,
      corpo: corpoVendita('intento-banco-0000001', [riga]),
    });

    // Il corpo entra nel messaggio: se fallisce, questa prova deve dire PERCHÉ.
    expect(`${esito.stato} ${JSON.stringify(esito.corpo)}`).toContain('201');
  });

  /*
    ⭐ **Un documento vuoto si salva** — deciso il 25/08/2026, e applicato al
    server il 26/08 togliendo `@ArrayMinSize(1)`. Sta qui perché è la prima cosa
    che si prova aprendo la maschera: si preme «Concludi» senza aver ancora
    scelto un articolo.
  */
  it('⭐ una vendita SENZA righe si salva: la sola condizione è la sede', async () => {
    const esito = await chiama(app, 'POST', '/store-sales', {
      token,
      corpo: corpoVendita('intento-banco-0000002', []),
    });

    expect(`${esito.stato} ${JSON.stringify(esito.corpo)}`).toContain('201');
  });

  /*
    ⛔ **Lo stesso intento non crea una seconda vendita** (T15): se la risposta
    si perde e il client ripete, deve tornare quella già registrata.
  */
  it('⛔ ripetere lo stesso intento non crea una seconda vendita', async () => {
    const intento = 'intento-banco-0000003';
    const primo = await chiama(app, 'POST', '/store-sales', {
      token,
      corpo: corpoVendita(intento, [riga]),
    });
    const secondo = await chiama(app, 'POST', '/store-sales', {
      token,
      corpo: corpoVendita(intento, [riga]),
    });

    expect(primo.stato).toBe(201);
    expect((secondo.corpo as { documentId?: string }).documentId).toBe(
      (primo.corpo as { documentId?: string }).documentId,
    );
  });
});
