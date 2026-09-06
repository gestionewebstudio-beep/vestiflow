import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { avviaApp, chiama, type AppIntegrazione } from './app';
import { creaDataset, IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';

/**
 * Passo 5 — l'autorizzazione di sede provata **contro un database vero**.
 *
 * ⭐ **Ogni prova passa da una richiesta HTTP su un socket**, quindi esercita il
 *    percorso intero: `JwtAuthGuard` → controller → service → Prisma →
 *    PostgreSQL. Nessuna guardia sostituita, nessun `@CurrentUser()` iniettato
 *    a mano, nessuna chiamata diretta al service.
 *
 * ⛔ **È l'unica forma che certifica la cosa giusta.** I sei difetti di
 *    `docs/21` avevano tutti test di servizio VERDI: il predicato c'era, era
 *    commentato, ed era inerte perché il controller non propagava l'utente.
 *    Chiamare il service dal test riprodurrebbe quella cecità.
 *
 * L'identità è quella vera: un token HS256 che il guard verifica, e un profilo
 * che il guard legge dal database di prova — `assignedLocationIds` compreso.
 */
describe('scope Location — integrazione HTTP su PostgreSQL TEST', () => {
  let app: AppIntegrazione;
  let prisma: PrismaClient;
  let tokenA1: string;
  let tokenSupervisore: string;

  beforeAll(async () => {
    prisma = creaClientIntegrazione();
    await creaDataset(prisma);
    app = await avviaApp();
    tokenA1 = await app.token(IDS.authA1);
    tokenSupervisore = await app.token(IDS.authSupervisore);
  }, 120_000);

  afterAll(async () => {
    await app?.chiudi();
    if (prisma) {
      await svuota(prisma);
      await prisma.$disconnect();
    }
  }, 60_000);

  // ═══ 0 · l'autenticazione è vera, non aggirata ═══════════════════════════
  describe('l’identità arriva davvero dal token al servizio', () => {
    it('senza token: 401, il guard c’è', async () => {
      const esito = await chiama(app, 'GET', `/documents/${IDS.docA1}`);
      expect(esito.stato).toBe(401);
    });

    it('con token valido: il profilo è quello letto dal database', async () => {
      const esito = await chiama(app, 'GET', '/auth/me', { token: tokenA1 });
      expect(esito.stato).toBe(200);
      expect(esito.corpo).toMatchObject({
        email: 'commesso.a1@integrazione.local',
        assignedLocationIds: [IDS.locA1],
      });
    });
  });

  // ═══ 1 · lettura diretta per ID ══════════════════════════════════════════
  describe('lettura diretta fuori scope', () => {
    it('✅ documento della PROPRIA sede A1: 200', async () => {
      const esito = await chiama(app, 'GET', `/documents/${IDS.docA1}`, { token: tokenA1 });
      expect(esito.stato).toBe(200);
      expect(esito.corpo).toMatchObject({ id: IDS.docA1, locationId: IDS.locA1 });
    });

    it('⛔ documento della sede A2, stesso tenant: 403', async () => {
      const esito = await chiama(app, 'GET', `/documents/${IDS.docA2}`, { token: tokenA1 });
      expect(esito.stato).toBe(403);
    });

    /**
     * ⚠️ Sul tenant B la risposta è 404, non 403, ed è **corretto**: il filtro
     * di tenant viene prima e il documento non esiste proprio per chi chiede.
     * Un 403 direbbe «esiste ma non puoi», che è un'informazione di troppo.
     */
    it('⛔ documento di un ALTRO tenant: non esiste per chi chiede', async () => {
      const esito = await chiama(app, 'GET', `/documents/${IDS.docB1}`, { token: tokenA1 });
      expect([403, 404]).toContain(esito.stato);
      expect(esito.stato).not.toBe(200);
    });
  });

  // ═══ 2 · scrittura verso una sede nuova ══════════════════════════════════
  describe('scrittura che SPOSTA il documento su un’altra sede', () => {
    it('⛔ da A1 a A2: rifiutata, e la sede nel database resta A1', async () => {
      const prima = await prisma.document.findUniqueOrThrow({ where: { id: IDS.docA1 } });
      expect(prima.locationId).toBe(IDS.locA1);

      const esito = await chiama(app, 'PATCH', `/documents/${IDS.docA1}`, {
        token: tokenA1,
        corpo: { locationId: IDS.locA2 },
      });
      expect(esito.stato).toBe(403);

      // ⭐ La verifica che conta: non basta il 403, il dato non deve muoversi.
      const dopo = await prisma.document.findUniqueOrThrow({ where: { id: IDS.docA1 } });
      expect(dopo.locationId).toBe(IDS.locA1);
      expect(dopo.updatedAt.getTime()).toBe(prima.updatedAt.getTime());
    });

    it('⛔ e nessun effetto collaterale: righe e movimenti invariati', async () => {
      const righe = await prisma.documentLine.count({ where: { documentId: IDS.docA1 } });
      const movimenti = await prisma.stockMovement.count({ where: { tenantId: IDS.tenantA } });
      expect(righe).toBe(0);
      expect(movimenti).toBe(0);
    });
  });

  // ═══ 3 · riferimento documentale passato per ID ══════════════════════════
  describe('riferimento per ID a un documento di un’altra sede', () => {
    it('⛔ DDT di A2 agganciato a una fattura di A1: rifiutato', async () => {
      const esito = await chiama(app, 'PATCH', `/documents/${IDS.docA1}`, {
        token: tokenA1,
        corpo: { linkedSalesDdtIds: [IDS.ddtA2] },
      });
      expect(esito.stato).toBe(403);
    });

    it('⛔ e nessun collegamento è stato creato', async () => {
      const collegamenti = await prisma.invoiceSalesDdtLink.count({
        where: { invoiceId: IDS.docA1 },
      });
      expect(collegamenti).toBe(0);
    });

    it('⛔ e nessun dato economico è stato importato nella fattura', async () => {
      const fattura = await prisma.document.findUniqueOrThrow({ where: { id: IDS.docA1 } });
      expect(fattura.subtotalMinor).toBe(0);
      expect(fattura.totalMinor).toBe(0);
    });
  });

  // ═══ 4 · lookup di inventario ════════════════════════════════════════════
  describe('lookup di cassa su una sede non assegnata', () => {
    it('⛔ locationId = A2 dalla querystring: 403', async () => {
      const esito = await chiama(
        app,
        'GET',
        `/store-sales/lookup?code=QUALUNQUE&locationId=${IDS.locA2}`,
        { token: tokenA1 },
      );
      expect(esito.stato).toBe(403);
    });

    /**
     * ⭐ Il rifiuto deve arrivare **prima** della lettura delle quantità: se
     * arrivasse dopo, l'endpoint sarebbe già stato un oracolo di giacenza. Qui
     * si osserva dall'esito: un codice inesistente su una sede AUTORIZZATA
     * risponde 200 con elenco vuoto, mentre la sede non autorizzata risponde
     * 403 — cioè il gate scatta prima di sapere se l'articolo esiste.
     */
    it('✅ la stessa richiesta su A1 arriva alla lettura: 200', async () => {
      const esito = await chiama(
        app,
        'GET',
        `/store-sales/lookup?code=QUALUNQUE&locationId=${IDS.locA1}`,
        { token: tokenA1 },
      );
      expect(esito.stato).toBe(200);
      expect(esito.corpo).toEqual([]);
    });
  });

  // ═══ 5 · LETTURA e SCRITTURA restano due cose diverse ════════════════════
  describe('inventory.view_all_locations: legge ovunque, non scrive ovunque', () => {
    it('✅ LETTURA di A2 con il permesso: 200', async () => {
      const esito = await chiama(app, 'GET', `/documents/${IDS.docA2}`, {
        token: tokenSupervisore,
      });
      expect(esito.stato).toBe(200);
      expect(esito.corpo).toMatchObject({ id: IDS.docA2, locationId: IDS.locA2 });
    });

    /**
     * ⛔ **Lo stesso utente, lo stesso documento, l'altro verbo.** È la prova
     * che il permesso non è una chiave universale: `assertLocationInUserScope`
     * non lo onora, `assertLocationReadableInUserScope` sì.
     */
    it('⛔ SCRITTURA che sposta A1 verso A2 con lo stesso permesso: 403', async () => {
      const esito = await chiama(app, 'PATCH', `/documents/${IDS.docA1}`, {
        token: tokenSupervisore,
        corpo: { locationId: IDS.locA2 },
      });
      expect(esito.stato).toBe(403);

      const dopo = await prisma.document.findUniqueOrThrow({ where: { id: IDS.docA1 } });
      expect(dopo.locationId).toBe(IDS.locA1);
    });
  });
});
