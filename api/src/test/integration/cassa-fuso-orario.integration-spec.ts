import { randomUUID } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, afterEach, describe, expect, it, vi } from 'vitest';

import { avviaApp, chiama, type AppIntegrazione } from './app';
import { creaDatasetCassa } from './cassa.fixture';
import { ambienteIntegrazione } from './env';
import { IDS } from './fixture';
import { creaClientIntegrazione } from './prisma';

/**
 * ⛔ **Il difetto che queste prove falsificano, contro il DATABASE vero.**
 *
 * `documentDate` è una colonna `@db.Date` e riceveva `new Date()`: Prisma ne
 * prende la parte **UTC**. Una vendita alle 00:30 del 7 settembre a Roma
 * (`2026-09-06T22:30Z`) si archiviava **col 6**, e l'anno della serie veniva da
 * `getFullYear()` — cioè dal fuso del PROCESSO, che in produzione è UTC e sulla
 * macchina di sviluppo no.
 *
 * ⭐ **Non è una prova di unità travestita**: qui il valore attraversa Prisma e
 * PostgreSQL, ed è l'unico modo di sapere che cosa la colonna `DATE` conserva
 * davvero. Il calcolo del fuso ha le sue prove in `business-time.util.spec.ts`.
 *
 * ⚠️ **L'orologio si sposta con `vi.setSystemTime`**, perché i servizi leggono
 * `new Date()`. Si ripristina in `afterEach`: una prova che lascia l'orologio
 * spostato rompe quelle dopo di sé in un modo difficilissimo da leggere.
 *
 * ⭐ **E vale in qualunque fuso di processo**: le attese sono assolute. Il
 * corridore CI gira in **UTC**, la macchina di sviluppo in **Europe/Rome**; se
 * il codice leggesse `TZ`, una delle due esecuzioni sarebbe rossa.
 */
describe('Cassa — il giorno è quello dell’attività, non quello di UTC', () => {
  let prisma: PrismaClient;
  let app: AppIntegrazione;
  let token: string;
  let variantId: string;
  let cashId: string;
  let sessionId: string;

  beforeAll(async () => {
    ambienteIntegrazione();
    prisma = creaClientIntegrazione();
    const fixture = await creaDatasetCassa(prisma);
    variantId = fixture.variantId;
    cashId = fixture.cashId;
    app = await avviaApp();
    token = await app.token(IDS.authA1);
    const aperta = await chiama(app, 'POST', '/cash-sessions/open', {
      token,
      corpo: { locationId: IDS.locA2, openingFloatMinor: 0 },
    });
    expect(aperta.stato, JSON.stringify(aperta.corpo)).toBe(201);
    sessionId = (aperta.corpo as { id: string }).id;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    vi.useRealTimers();
    await prisma?.$disconnect();
  });

  /**
   * Una vendita all'istante indicato, e il documento come il database lo ha.
   *
   * ⚠️ **Il token si conia DOPO aver spostato l'orologio**, e non è un
   * dettaglio: firmato al tempo reale, a una data futura risulta scaduto e la
   * chiamata torna 401. Con l'orologio già spostato, `exp` cade nel futuro di
   * quell'istante e l'autenticazione si comporta normalmente.
   */
  async function vendiA(istante: string) {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(istante));
    const tokenDelMomento = await app.token(IDS.authA1);
    const esito = await chiama(app, 'POST', '/cash-sessions/checkout', {
      token: tokenDelMomento,
      corpo: {
        locationId: IDS.locA2,
        sessionId,
        creationIntentId: randomUUID(),
        lines: [{ variantId, quantity: 1, unitPriceMinor: 100 }],
        payments: [{ paymentOptionId: cashId, amountMinor: 100, tenderedMinor: 100 }],
      },
    });
    expect(esito.stato, JSON.stringify(esito.corpo)).toBe(201);
    const documentId = (esito.corpo as { documentId: string }).documentId;
    vi.useRealTimers();
    const documento = await prisma.document.findUniqueOrThrow({
      where: { id: documentId },
      select: { documentDate: true, year: true, createdAt: true, reference: true },
    });
    const movimenti = await prisma.stockMovement.findMany({
      where: { sourceDocumentId: documentId },
      select: { createdAt: true },
    });
    return { documentId, documento, movimenti };
  }

  it('⛔ vendita alle 00:30 di Roma: la DATA è di oggi, non di ieri', async () => {
    // 2026-09-06T22:30Z = 00:30 del 7 settembre a Roma (CEST, +2).
    const { documento, movimenti } = await vendiA('2026-09-06T22:30:00.000Z');

    // La colonna DATE conserva il giorno dell'ATTIVITÀ.
    expect(documento.documentDate.toISOString().slice(0, 10)).toBe('2026-09-07');
    expect(documento.year).toBe(2026);

    /*
      ⭐ **E l'ISTANTE è rimasto un istante.** `StockMovement.createdAt` è il
      momento in cui la merce è uscita, non la mezzanotte del suo giorno:
      sostituirlo farebbe risultare ogni movimento di Cassa fatto a mezzanotte.
    */
    expect(movimenti).toHaveLength(1);
    const istante = movimenti[0]!.createdAt;
    const atteso = new Date('2026-09-06T22:30:00.000Z').getTime();
    // ⚠️ Non al millisecondo: l'orologio finto avanza durante la chiamata. Qui
    //    conta che sia QUELL'istante, non che sia fermo.
    expect(Math.abs(istante.getTime() - atteso)).toBeLessThan(5_000);
    // ⛔ E soprattutto che NON sia una mezzanotte: né quella di Roma
    //    (`T22:00:00Z` in estate) né quella di Greenwich. È la sostituzione che
    //    il mandato vieta, e sarebbe passata inosservata guardando solo la data.
    expect(istante.toISOString()).not.toContain('T00:00:00');
    expect(istante.toISOString()).not.toContain('T22:00:00.000Z');

    /*
      ⚠️ **`Document.createdAt` NON si asserisce qui, e non è una svista.** È
      `@default(now())`: lo genera PostgreSQL, non l'applicazione, quindi
      l'orologio finto di Node non lo tocca e non dice niente su questa
      correzione. Il campo che l'applicazione decide è quello del movimento.
    */
  });

  it('⭐ e il registro filtrato su quel giorno la TROVA', async () => {
    const { documentId } = await vendiA('2026-09-06T22:45:00.000Z');

    const elenco = await chiama(
      app,
      'GET',
      `/cash-sessions/operations?locationId=${IDS.locA2}&from=2026-09-07&to=2026-09-07&all=1`,
      { token },
    );
    expect(elenco.stato).toBe(200);
    const ids = (elenco.corpo as { items: { id: string }[] }).items.map((i) => i.id);
    expect(ids).toContain(documentId);

    // ⛔ E il giorno prima NON la contiene: il confine non è spostato, è corretto.
    const giornoPrima = await chiama(
      app,
      'GET',
      `/cash-sessions/operations?locationId=${IDS.locA2}&from=2026-09-06&to=2026-09-06&all=1`,
      { token },
    );
    const idsPrima = (giornoPrima.corpo as { items: { id: string }[] }).items.map((i) => i.id);
    expect(idsPrima).not.toContain(documentId);
  });

  it('⛔ CAMBIO D’ANNO: la serie di numerazione segue Roma, non UTC', async () => {
    // 2026-12-31T23:30Z = 00:30 del 1º gennaio a Roma (CET, +1).
    const { documento } = await vendiA('2026-12-31T23:30:00.000Z');

    expect(documento.documentDate.toISOString().slice(0, 10)).toBe('2027-01-01');
    /*
      ⛔ **Qui c'era il difetto gemello**: `year` veniva da `getFullYear()`, che
      è locale al processo. Con processo in UTC dava 2026 e data 2026-12-31; con
      processo a Roma dava 2027 e data 2026-12-31 — cioè una serie dell'anno
      nuovo su un documento datato l'anno vecchio.
    */
    expect(documento.year).toBe(2027);
    expect(documento.year).toBe(Number(documento.documentDate.toISOString().slice(0, 4)));
  });

  it('⭐ CAMBIO D’ORA: il giorno di 25 ore è tutto dentro il filtro', async () => {
    // 25 ottobre 2026: alle 03:00 locali si torna alle 02:00. Il giorno dura 25 ore.
    // 2026-10-25T23:30Z sarebbe già il 26 in UTC, ma a Roma (CET, +1) è ancora
    // il 25 alle 00:30... no: è il 26 alle 00:30. Si prende un istante interno.
    const { documento } = await vendiA('2026-10-25T22:30:00.000Z'); // 23:30 locali del 25

    expect(documento.documentDate.toISOString().slice(0, 10)).toBe('2026-10-25');

    // Le sessioni filtrano un ISTANTE: il confine del giorno lungo li copre entrambi.
    const sessioni = await chiama(
      app,
      'GET',
      `/cash-sessions/sessions?locationId=${IDS.locA2}&from=2026-10-25&to=2026-10-25&all=1`,
      { token },
    );
    expect(sessioni.stato).toBe(200);
  });

  it('⚠️ nessuna riscrittura dei documenti storici: la correzione vale da qui in poi', async () => {
    // Un documento con la data «sbagliata» di prima resta com'è: la tranche non
    // tocca lo storico, e nessuna prova qui lo pretende.
    const storico = await prisma.document.create({
      data: {
        tenantId: IDS.tenantA,
        type: 'store_sale',
        status: 'confirmed',
        year: 2026,
        documentDate: new Date('2026-05-10T00:00:00.000Z'),
        locationId: IDS.locA2,
        createdById: IDS.utenteA1,
        createdByName: 'Storico',
        totalMinor: 0,
        subtotalMinor: 0,
        taxMinor: 0,
      },
      select: { id: true, documentDate: true },
    });
    const riletto = await prisma.document.findUniqueOrThrow({
      where: { id: storico.id },
      select: { documentDate: true },
    });
    expect(riletto.documentDate.toISOString().slice(0, 10)).toBe('2026-05-10');
    await prisma.document.delete({ where: { id: storico.id } });
  });
});
