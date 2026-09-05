import { NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { UserProfileDto } from '../../auth/dto/user-profile.dto';
import { CashCheckoutService } from '../../cash-sessions/cash-checkout.service';
import { CashClosingService } from '../../cash-sessions/cash-closing.service';
import { CashOperationsService } from '../../cash-sessions/cash-operations.service';
import { CashReturnService } from '../../cash-sessions/cash-return.service';
import { CashSessionsReportService } from '../../cash-sessions/cash-sessions-report.service';
import { CashSessionsService } from '../../cash-sessions/cash-sessions.service';
import { CreationIntentService } from '../../common/idempotency/creation-intent.util';
import { DocumentSettingsService } from '../../documents/document-settings.service';

import { creaClientIntegrazione } from './prisma';

/**
 * Le API di CONSULTAZIONE della Cassa: registro operativo, ricerca dello
 * scontrino, sessioni.
 *
 * ⛔ **Ciò che questi test falsificano**:
 *
 * ```text
 *   il registro mostra anche il banco     NO: solo cio` che ha una SESSIONE
 *   gli annullati spariscono              NO: si vedono, ma non si sommano
 *   i totali si fanno nel browser         NO: arrivano dal server, col filtro
 *   il reso si cerca per UUID             NO: numero, articolo, importo, cliente
 *   una sede fuori ambito si vede         NO: lo scope filtra sul server
 *   gli attesi si vedono a sessione aperta NO: `frozen` e` null finche` e` aperta
 * ```
 *
 * ⛔ **Nessuna prova sullo stato fiscale, e non manca**: il registro non porta
 * quel campo, e a impedirne il ritorno c'è già `npm run check:registro-legacy`
 * — che fa fallire la build in QUALUNQUE file, mentre una prova coprirebbe solo
 * questa proiezione. Scriverla, per giunta, avrebbe richiesto di nominare il
 * termine vietato, e la guardia l'ha respinta: misurato il 04/09/2026.
 */

const PREFISSO = 'COLLAUDO CONSULT';

describe('consultazione della Cassa — su PostgreSQL TEST', () => {
  let prisma: PrismaClient;
  let checkout: CashCheckoutService;
  let resi: CashReturnService;
  let sessioni: CashSessionsService;
  let chiusura: CashClosingService;
  let operazioni: CashOperationsService;
  let report: CashSessionsReportService;

  let tenant = '';
  let sedeA = '';
  let sedeB = '';
  let variante = '';
  let contanti = '';
  let carta = '';

  const OPERATORE = '00000000-0000-4000-8000-00000000ce01';
  const ALTRO_OPERATORE = '00000000-0000-4000-8000-00000000ce02';

  const utente = (tenantId: string, opzioni?: { id?: string; sedi?: string[] }): UserProfileDto =>
    ({
      id: opzioni?.id ?? OPERATORE,
      tenantId,
      displayName: 'Cassiere',
      role: opzioni?.sedi ? 'clerk' : 'owner',
      supportSession: false,
      hasAllLocationsAccess: !opzioni?.sedi,
      assignedLocationIds: opzioni?.sedi ?? [],
      permissions: [],
    }) as unknown as UserProfileDto;

  beforeAll(async () => {
    prisma = creaClientIntegrazione();
    const finto = prisma as never;
    const canali = { pushInventoryLevels: async () => undefined } as never;
    checkout = new CashCheckoutService(
      finto,
      new DocumentSettingsService(finto),
      new CreationIntentService(finto),
      canali,
    );
    resi = new CashReturnService(
      finto,
      new DocumentSettingsService(finto),
      new CreationIntentService(finto),
      canali,
    );
    sessioni = new CashSessionsService(finto);
    chiusura = new CashClosingService(finto);
    operazioni = new CashOperationsService(finto);
    report = new CashSessionsReportService(finto);

    await pulisci(prisma);
    tenant = await creaTenant(prisma);
    sedeA = await creaSede(prisma, tenant, 'A');
    sedeB = await creaSede(prisma, tenant, 'B');
    variante = await creaVariante(prisma, tenant);
    contanti = await creaTipo(prisma, tenant, 'Contanti', 'cash', 1);
    carta = await creaTipo(prisma, tenant, 'Carta', 'electronic', 2);
  }, 120_000);

  afterEach(async () => {
    await svuota(prisma);
  });

  afterAll(async () => {
    if (prisma) {
      await pulisci(prisma);
      await prisma.$disconnect();
    }
  });

  const pagina = { page: 1, pageSize: 100 };

  async function apri(sede = sedeA, fondo = 0): Promise<string> {
    const s = await sessioni.open(tenant, utente(tenant), {
      locationId: sede,
      openingFloatMinor: fondo,
    });
    return s.id;
  }

  async function vendi(
    sessionId: string,
    opzioni: {
      sede?: string;
      quantita?: number;
      modo?: 'contanti' | 'carta' | 'misto';
      intento: string;
      operatore?: string;
    },
  ) {
    const sede = opzioni.sede ?? sedeA;
    const quantita = opzioni.quantita ?? 1;
    const totale = quantita * 10_000;
    const modo = opzioni.modo ?? 'contanti';
    const esito = await checkout.checkout(
      tenant,
      utente(tenant, opzioni.operatore ? { id: opzioni.operatore } : undefined),
      {
        locationId: sede,
        sessionId,
        creationIntentId: `${PREFISSO}-${opzioni.intento}`,
        lines: [{ variantId: variante, quantity: quantita, unitPriceMinor: 10_000 }],
        payments:
          modo === 'contanti'
            ? [{ paymentOptionId: contanti, amountMinor: totale, tenderedMinor: totale + 500 }]
            : modo === 'carta'
              ? [{ paymentOptionId: carta, amountMinor: totale, confirmed: true }]
              : [
                  { paymentOptionId: contanti, amountMinor: 6_000, tenderedMinor: 6_000 },
                  { paymentOptionId: carta, amountMinor: totale - 6_000, confirmed: true },
                ],
      },
    );
    const riga = await prisma.documentLine.findFirstOrThrow({
      where: { documentId: esito.documentId },
    });
    // ⚠️ La prima quota, non «quella dei contanti»: una vendita con sola
    //    carta non ne ha, e l_aiutante falliva prima della prova.
    const quota = await prisma.storeSalePayment.findFirstOrThrow({
      where: { documentId: esito.documentId },
      orderBy: { position: 'asc' },
    });
    return { ...esito, lineId: riga.id, quotaId: quota.id, totale };
  }

  // ── Il registro operativo ─────────────────────────────────────────────────

  it('mostra le operazioni di CASSA, non le vendite al banco', async () => {
    const s = await apri();
    const v = await vendi(s, { intento: 'cassa' });
    // Una Vendita al banco: stesso tipo documento, NESSUNA sessione.
    const banco = await creaVenditaAlBanco(prisma, tenant, sedeA);

    const elenco = await operazioni.list(tenant, utente(tenant), pagina);

    expect(elenco.items.map((i) => i.id)).toContain(v.documentId);
    // ⭐ `cashSessionId` è l'unica cosa che le distingue.
    expect(elenco.items.map((i) => i.id)).not.toContain(banco);
  });

  it('i totali arrivano dal SERVER e seguono il filtro', async () => {
    const s = await apri();
    const v = await vendi(s, { quantita: 3, intento: 't-v' }); // 300,00 contanti
    await vendi(s, { modo: 'carta', intento: 't-c' }); // 100,00 elettronico
    await resi.createReturn(tenant, utente(tenant), {
      locationId: sedeA,
      sessionId: s,
      originalDocumentId: v.documentId,
      creationIntentId: `${PREFISSO}-t-r`,
      reason: 'reso',
      lines: [{ originalLineId: v.lineId, quantity: 1 }],
      refunds: [{ originalPaymentId: v.quotaId, amountMinor: 10_000 }],
    });

    const tutto = await operazioni.list(tenant, utente(tenant), pagina);
    expect(tutto.summary.grossSalesMinor).toBe(40_000);
    expect(tutto.summary.returnsMinor).toBe(10_000);
    expect(tutto.summary.netSalesMinor).toBe(30_000);
    expect(tutto.summary.cashMinor).toBe(20_000); // 300 − 100 resi
    expect(tutto.summary.electronicMinor).toBe(10_000);
    expect(tutto.summary.saleCount).toBe(2);
    expect(tutto.summary.returnCount).toBe(1);
    expect(tutto.summary.operationCount).toBe(3);
    expect(tutto.summary.averageMinor).toBe(10_000);

    // ⭐ Il riepilogo SEGUE il filtro: solo le vendite.
    const soloVendite = await operazioni.list(tenant, utente(tenant), {
      ...pagina,
      kind: 'sale',
    });
    expect(soloVendite.summary.returnsMinor).toBe(0);
    expect(soloVendite.summary.netSalesMinor).toBe(40_000);
  });

  it('gli ANNULLATI si vedono, ma non si sommano', async () => {
    const s = await apri();
    const v = await vendi(s, { intento: 'ann' });
    await vendi(s, { intento: 'ann2' });
    await prisma.document.update({
      where: { id: v.documentId },
      data: { status: 'cancelled' },
    });

    const elenco = await operazioni.list(tenant, utente(tenant), pagina);
    const annullata = elenco.items.find((i) => i.id === v.documentId);
    // ⭐ Visibile, con il suo stato.
    expect(annullata?.status).toBe('cancelled');
    expect(annullata?.anomalies).toContain('annullato');
    // ⛔ …e fuori dai totali.
    expect(elenco.summary.grossSalesMinor).toBe(10_000);
    expect(elenco.summary.saleCount).toBe(1);
  });

  it('il resto e il «misto» si leggono dalla riga', async () => {
    const s = await apri();
    await vendi(s, { intento: 'resto' }); // tendered 105,00 su 100,00
    const misto = await vendi(s, { modo: 'misto', intento: 'misto' });

    const elenco = await operazioni.list(tenant, utente(tenant), pagina);
    const conResto = elenco.items.find((i) => !i.mixed);
    expect(conResto?.changeMinor).toBe(500);

    const rigaMista = elenco.items.find((i) => i.id === misto.documentId);
    // ⭐ «Misto» è calcolato a lettura, mai persistito.
    expect(rigaMista?.mixed).toBe(true);
    expect(rigaMista?.payments).toHaveLength(2);
  });

  it('filtra per sessione, operatore, classe di incasso e numero', async () => {
    const s1 = await apri();
    const v1 = await vendi(s1, { intento: 'f1', operatore: OPERATORE });
    await vendi(s1, { modo: 'carta', intento: 'f2', operatore: ALTRO_OPERATORE });

    const perSessione = await operazioni.list(tenant, utente(tenant), {
      ...pagina,
      sessionId: s1,
    });
    expect(perSessione.total).toBe(2);

    const perOperatore = await operazioni.list(tenant, utente(tenant), {
      ...pagina,
      operatorId: ALTRO_OPERATORE,
    });
    expect(perOperatore.total).toBe(1);

    const perClasse = await operazioni.list(tenant, utente(tenant), {
      ...pagina,
      tenderKind: 'electronic',
    });
    expect(perClasse.total).toBe(1);

    const perTipo = await operazioni.list(tenant, utente(tenant), {
      ...pagina,
      paymentOptionId: contanti,
    });
    expect(perTipo.items.map((i) => i.id)).toEqual([v1.documentId]);

    const documento = await prisma.document.findUniqueOrThrow({ where: { id: v1.documentId } });
    const perNumero = await operazioni.list(tenant, utente(tenant), {
      ...pagina,
      number: documento.reference ?? String(documento.number),
    });
    expect(perNumero.items.map((i) => i.id)).toEqual([v1.documentId]);
  });

  /**
   * ⭐ Le cinque anomalie sono DICHIARATE, e la più grave — le quote che non
   * sommano al totale — non è esprimibile in Prisma: la trova una query a
   * parte, ed è la ragione per cui esiste.
   */
  it('segnala le anomalie, comprese le quote che non quadrano', async () => {
    const s = await apri();
    const v = await vendi(s, { intento: 'anom' });
    // Si sporca la quota: 100,00 incassati diventano 90,00.
    await prisma.storeSalePayment.updateMany({
      where: { documentId: v.documentId },
      data: { amountMinor: 9_000 },
    });

    const elenco = await operazioni.list(tenant, utente(tenant), pagina);
    expect(elenco.items[0]?.anomalies).toContain('quote_non_quadrate');

    const soloAnomalie = await operazioni.list(tenant, utente(tenant), {
      ...pagina,
      anomaliesOnly: true,
    });
    // ⚠️ Il FILTRO copre le quattro esprimibili: questa non c'è fra loro, e
    //    l'elenco filtrato non la contiene. È dichiarato, non nascosto.
    expect(soloAnomalie.items.map((i) => i.id)).not.toContain(v.documentId);
  });

  it('una quota NON classificata è un_anomalia, e il filtro la prende', async () => {
    const s = await apri();
    const v = await vendi(s, { intento: 'noclass' });
    await prisma.storeSalePayment.updateMany({
      where: { documentId: v.documentId },
      data: { tenderKindSnapshot: null },
    });

    const soloAnomalie = await operazioni.list(tenant, utente(tenant), {
      ...pagina,
      anomaliesOnly: true,
    });
    expect(soloAnomalie.items.map((i) => i.id)).toContain(v.documentId);
    expect(soloAnomalie.items[0]?.anomalies).toContain('quota_non_classificata');
  });

  it('lo SCOPE delle sedi filtra sul server', async () => {
    const sa = await apri(sedeA);
    const sb = await apri(sedeB);
    const vA = await vendi(sa, { sede: sedeA, intento: 'scope-a' });
    const vB = await vendi(sb, { sede: sedeB, intento: 'scope-b' });

    const pieno = await operazioni.list(tenant, utente(tenant), pagina);
    expect(pieno.items.map((i) => i.id).sort()).toEqual([vA.documentId, vB.documentId].sort());

    const ristretto = await operazioni.list(
      tenant,
      utente(tenant, { sedi: [sedeB] }),
      pagina,
    );
    expect(ristretto.items.map((i) => i.id)).toEqual([vB.documentId]);
    // ⭐ E anche i TOTALI seguono lo scope, non solo l'elenco.
    expect(ristretto.summary.grossSalesMinor).toBe(10_000);
  });

  /*
    ⛔ **LA RICHIESTA RESTRINGE, NON SOSTITUISCE.**

    Tutti e tre i percorsi di consultazione scrivevano prima il perimetro
    autorizzato e POI la sede chiesta dal client, sulla stessa proprieta`:

    ```ts
    ...(scope === 'unrestricted' ? {} : { locationId: { in: [...scope] } }),
    ...(query.locationId ? { locationId: query.locationId } : {}),   // ⛔ vince questa
    ```

    In JavaScript la seconda chiave sovrascrive la prima: un utente limitato
    alla sede A che chiede la sede B **vedeva la sede B**. Non e` un caso di
    frontiera — e` il filtro Sede della schermata, con un id copiato.

    ⚠️ **E non e` cross-tenant**: le due sedi stanno nello STESSO tenant, che
    e` la ragione per cui nessuna delle prove esistenti lo prendeva. Le prove
    cross-tenant restano dove sono e provano un'altra cosa.
  */
  it('⛔ la sede CHIESTA non scavalca il perimetro: elenco, conteggio e riepilogo', async () => {
    const sa = await apri(sedeA);
    const sb = await apri(sedeB);
    const vA = await vendi(sa, { sede: sedeA, intento: 'chiede-a' });
    const vB = await vendi(sb, { sede: sedeB, intento: 'chiede-b' });

    // Un utente della sola sede A che chiede esplicitamente la sede B.
    const esito = await operazioni.list(tenant, utente(tenant, { sedi: [sedeA] }), {
      ...pagina,
      locationId: sedeB,
    });

    // ⛔ Nessuna riga della sede B, e nemmeno un totale che la riveli.
    expect(esito.items.map((i) => i.id)).not.toContain(vB.documentId);
    expect(esito.items).toEqual([]);
    expect(esito.total).toBe(0);
    expect(esito.summary.grossSalesMinor).toBe(0);
    expect(esito.summary.operationCount).toBe(0);

    // ⭐ E la stessa richiesta sulla PROPRIA sede continua a funzionare:
    //    restringere non significa rifiutare.
    const suo = await operazioni.list(tenant, utente(tenant, { sedi: [sedeA] }), {
      ...pagina,
      locationId: sedeA,
    });
    expect(suo.items.map((i) => i.id)).toEqual([vA.documentId]);
    expect(suo.summary.grossSalesMinor).toBe(10_000);
  });

  it('⛔ la RICERCA SCONTRINO non si fa dare una sede fuori perimetro', async () => {
    const sb = await apri(sedeB);
    const vB = await vendi(sb, { sede: sedeB, intento: 'cerca-chiede-b' });

    const trovati = await operazioni.searchReceipts(tenant, utente(tenant, { sedi: [sedeA] }), {
      locationId: sedeB,
    });

    expect(trovati.map((t) => t.documentId)).not.toContain(vB.documentId);
  });

  it('⛔ l_elenco SESSIONI non si fa dare una sede fuori perimetro', async () => {
    const sb = await apri(sedeB);

    const esito = await report.list(tenant, utente(tenant, { sedi: [sedeA] }), {
      ...pagina,
      locationId: sedeB,
    });

    expect(esito.items.map((i) => i.id)).not.toContain(sb);
    expect(esito.total).toBe(0);

    // ⭐ E la propria sede resta visibile.
    const sa = await apri(sedeA);
    const suo = await report.list(tenant, utente(tenant, { sedi: [sedeA] }), {
      ...pagina,
      locationId: sedeA,
    });
    expect(suo.items.map((i) => i.id)).toContain(sa);
  });

  /*
    ⛔ **DUE `OR` SULLA STESSA PROPRIETA` NE LASCIANO UNO.**

    `number` costruiva un `OR` e `anomaliesOnly` ne scriveva un altro: con
    entrambi attivi la ricerca per numero **spariva**, e l_elenco rispondeva
    «tutte le anomalie» a chi ne aveva chiesta una sola.

    ⚠️ **Non falliva**: rispondeva di piu`, il che e` il modo in cui un filtro
    perso non si nota.
  */
  it('⛔ numero E anomalie valgono INSIEME, con periodo, tenant e sede', async () => {
    const s = await apri(sedeA);
    const conAnomalia = await vendi(s, { intento: 'combi-1' });
    const altraConAnomalia = await vendi(s, { intento: 'combi-2' });

    // Due documenti entrambi anomali: si toglie la classe alle quote.
    for (const d of [conAnomalia, altraConAnomalia]) {
      await prisma.storeSalePayment.updateMany({
        where: { documentId: d.documentId },
        data: { tenderKindSnapshot: null },
      });
    }

    const numero = await prisma.document.findUniqueOrThrow({
      where: { id: conAnomalia.documentId },
      select: { number: true, reference: true, documentDate: true },
    });

    const esito = await operazioni.list(tenant, utente(tenant), {
      ...pagina,
      number: String(numero.number),
      anomaliesOnly: true,
    });

    // ⛔ Prima tornavano ENTRAMBI: il filtro numero era stato sovrascritto.
    expect(esito.items.map((i) => i.id)).toEqual([conAnomalia.documentId]);
    expect(esito.items[0]?.anomalies).toContain('quota_non_classificata');

    // ⭐ E il periodo continua a valere insieme agli altri due.
    const giorno = numero.documentDate.toISOString().slice(0, 10);
    const conPeriodo = await operazioni.list(tenant, utente(tenant), {
      ...pagina,
      number: String(numero.number),
      anomaliesOnly: true,
      from: giorno,
      to: giorno,
    });
    expect(conPeriodo.items.map((i) => i.id)).toEqual([conAnomalia.documentId]);

    // ⛔ Un periodo che non lo contiene lo esclude: i gruppi sono in AND.
    const fuoriPeriodo = await operazioni.list(tenant, utente(tenant), {
      ...pagina,
      number: String(numero.number),
      anomaliesOnly: true,
      from: '2000-01-01',
      to: '2000-01-02',
    });
    expect(fuoriPeriodo.items).toEqual([]);
  });

  /*
    ⛔ **UN TETTO PIU` ALTO RESTA UN TETTO.**

    I due registri chiedevano `page: 1` con un `pageSize` via via piu` grande —
    100, poi 5.000 — e le righe oltre la finestra restavano irraggiungibili:
    nessuno chiedeva la pagina due. `regole-stile-ui` dice «NESSUN TETTO DI
    RIGHE», e il contenimento e` il PERIODO.

    ⭐ Ora si chiede `all=1`, sul percorso condiviso `UnpagedQueryDto` +
    `pageWindow` — quello di clienti, prodotti, documenti e vendite online.

    ⚠️ **La prova semina oltre il vecchio tetto** (5.100): sotto quella soglia
    non falsificherebbe niente, perche' anche il codice di prima l'avrebbe
    superata.
  */
  it('⛔ oltre il vecchio tetto: `all` porta TUTTO il risultato', async () => {
    const s = await apri(sedeA);
    const quante = 5_100;
    await seminaVendite(prisma, tenant, sedeA, s, quante);

    // ⛔ Con la finestra, il massimo consentito era 5.000: mancherebbero 100.
    const finestra = await operazioni.list(tenant, utente(tenant), {
      page: 1,
      pageSize: 5_000,
    });
    expect(finestra.items.length).toBe(5_000);
    expect(finestra.total).toBeGreaterThanOrEqual(quante);

    // ⭐ Con `all`, tutte.
    const tutto = await operazioni.list(tenant, utente(tenant), {
      all: true,
      page: 1,
      pageSize: 5_000,
    });
    expect(tutto.items.length).toBe(tutto.total);
    expect(tutto.items.length).toBeGreaterThanOrEqual(quante);

    // ⭐ E il contratto per chi impagina non cambia: `total`, `page`, `pageSize`.
    expect(tutto.page).toBe(1);
    expect(tutto.pageSize).toBe(5_000);
  }, 300_000);

  it('⭐ le righe prima ESCLUSE entrano nel filtro e nei totali', async () => {
    const s = await apri(sedeA);
    await seminaVendite(prisma, tenant, sedeA, s, 5_050);

    // La riga di riferimento e` l_ULTIMA seminata: con la finestra da 5.000
    // ordinata per data discendente, le ultime restavano fuori.
    const ultime = await prisma.document.findMany({
      where: { tenantId: tenant, cashSessionId: s },
      orderBy: { documentDate: 'asc' },
      take: 1,
      select: { id: true, number: true },
    });
    const fuoriFinestra = ultime[0]!;

    const finestra = await operazioni.list(tenant, utente(tenant), {
      page: 1,
      pageSize: 5_000,
    });
    expect(finestra.items.map((i) => i.id)).not.toContain(fuoriFinestra.id);

    const tutto = await operazioni.list(tenant, utente(tenant), {
      all: true,
      page: 1,
      pageSize: 5_000,
    });
    expect(tutto.items.map((i) => i.id)).toContain(fuoriFinestra.id);

    // ⭐ E la si raggiunge anche col FILTRO per numero, che prima la escludeva
    //    solo perche` non era nella finestra.
    const perNumero = await operazioni.list(tenant, utente(tenant), {
      all: true,
      page: 1,
      pageSize: 5_000,
      number: String(fuoriFinestra.number),
    });
    expect(perNumero.items.map((i) => i.id)).toContain(fuoriFinestra.id);

    // ⚠️ Il riepilogo del server NON dipendeva dalla finestra e non cambia:
    //    contava gia` tutto il filtro. E` la prova che i due ambiti sono
    //    distinti — riepilogo del PERIODO contro righe caricate.
    expect(tutto.summary.operationCount).toBe(finestra.summary.operationCount);
  }, 300_000);

  it('⭐ anche le SESSIONI arrivano tutte', async () => {
    for (let i = 0; i < 3; i += 1) {
      const s = await apri(sedeA);
      await chiusura.close(tenant, utente(tenant), sedeA, s, { countedCashMinor: 0 });
    }

    const unaSola = await report.list(tenant, utente(tenant), { page: 1, pageSize: 1 });
    expect(unaSola.items.length).toBe(1);
    expect(unaSola.total).toBeGreaterThanOrEqual(3);

    const tutte = await report.list(tenant, utente(tenant), { all: true, page: 1, pageSize: 1 });
    expect(tutte.items.length).toBe(tutte.total);
  });

  it('⭐ numero e anomalie insieme rispettano anche lo SCOPE', async () => {
    const sb = await apri(sedeB);
    const vB = await vendi(sb, { sede: sedeB, intento: 'combi-scope' });
    await prisma.storeSalePayment.updateMany({
      where: { documentId: vB.documentId },
      data: { tenderKindSnapshot: null },
    });
    const numero = await prisma.document.findUniqueOrThrow({
      where: { id: vB.documentId },
      select: { number: true },
    });

    const esito = await operazioni.list(tenant, utente(tenant, { sedi: [sedeA] }), {
      ...pagina,
      number: String(numero.number),
      anomaliesOnly: true,
    });

    expect(esito.items).toEqual([]);
  });

  // ── Il dettaglio ──────────────────────────────────────────────────────────

  it('il dettaglio porta righe, quote, movimenti e resi collegati', async () => {
    const s = await apri();
    const v = await vendi(s, { quantita: 2, intento: 'det' });
    const reso = await resi.createReturn(tenant, utente(tenant), {
      locationId: sedeA,
      sessionId: s,
      originalDocumentId: v.documentId,
      creationIntentId: `${PREFISSO}-det-r`,
      reason: 'difetto',
      lines: [{ originalLineId: v.lineId, quantity: 1 }],
      refunds: [{ originalPaymentId: v.quotaId, amountMinor: 10_000 }],
    });

    const dettaglio = await operazioni.detail(tenant, utente(tenant), v.documentId);
    expect(dettaglio.lines).toHaveLength(1);
    expect(dettaglio.payments).toHaveLength(1);
    expect(dettaglio.stockMovements.length).toBeGreaterThan(0);
    expect((dettaglio.relatedReturns as { id: string }[]).map((r) => r.id)).toEqual([
      reso.documentId,
    ]);

    // E dal reso si risale alla vendita.
    const dettaglioReso = await operazioni.detail(tenant, utente(tenant), reso.documentId);
    expect(dettaglioReso.sourceDocumentId).toBe(v.documentId);
    expect(dettaglioReso.kind).toBe('return');
  });

  it('il dettaglio di un_operazione fuori ambito non si apre', async () => {
    const sb = await apri(sedeB);
    const vB = await vendi(sb, { sede: sedeB, intento: 'fuori' });

    await expect(
      operazioni.detail(tenant, utente(tenant, { sedi: [sedeA] }), vB.documentId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('il dettaglio di un ALTRO tenant non si apre', async () => {
    const altro = await creaTenant(prisma, 2);
    const suaSede = await creaSede(prisma, altro, 'X');
    const suoDoc = await creaVenditaAlBanco(prisma, altro, suaSede);

    await expect(
      operazioni.detail(tenant, utente(tenant), suoDoc),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // ── La ricerca dello scontrino ────────────────────────────────────────────

  it('lo scontrino si cerca per NUMERO, senza conoscere un UUID', async () => {
    const s = await apri();
    const v = await vendi(s, { intento: 'cerca-num' });
    const documento = await prisma.document.findUniqueOrThrow({ where: { id: v.documentId } });

    const trovati = await operazioni.searchReceipts(tenant, utente(tenant), {
      text: documento.reference ?? String(documento.number),
    });
    expect(trovati.map((t) => t.documentId)).toContain(v.documentId);
    // ⭐ E porta con sé di che si tratta, per riconoscerlo a colpo d'occhio.
    expect(trovati[0]?.itemsPreview).toContain('×');
    expect(trovati[0]?.lineCount).toBe(1);
  });

  it('si cerca anche per ARTICOLO e per IMPORTO', async () => {
    const s = await apri();
    const v = await vendi(s, { quantita: 2, intento: 'cerca-art' }); // 200,00

    const perArticolo = await operazioni.searchReceipts(tenant, utente(tenant), {
      text: `${PREFISSO}-SKU`,
    });
    expect(perArticolo.map((t) => t.documentId)).toContain(v.documentId);

    const perImporto = await operazioni.searchReceipts(tenant, utente(tenant), {
      totalMinor: 20_000,
    });
    expect(perImporto.map((t) => t.documentId)).toContain(v.documentId);

    const nessuno = await operazioni.searchReceipts(tenant, utente(tenant), {
      totalMinor: 99_999,
    });
    expect(nessuno).toHaveLength(0);
  });

  it('la ricerca NON trova annullati, resi, né sedi fuori ambito', async () => {
    const s = await apri();
    const annullata = await vendi(s, { intento: 'cerca-ann' });
    await prisma.document.update({
      where: { id: annullata.documentId },
      data: { status: 'cancelled' },
    });
    const sb = await apri(sedeB);
    const altraSede = await vendi(sb, { sede: sedeB, intento: 'cerca-b' });

    const tutti = await operazioni.searchReceipts(tenant, utente(tenant), {});
    expect(tutti.map((t) => t.documentId)).not.toContain(annullata.documentId);

    const ristretto = await operazioni.searchReceipts(
      tenant,
      utente(tenant, { sedi: [sedeA] }),
      {},
    );
    expect(ristretto.map((t) => t.documentId)).not.toContain(altraSede.documentId);
  });

  // ── Le sessioni ───────────────────────────────────────────────────────────

  it('l_elenco sessioni porta i conteggi senza N+1', async () => {
    const s = await apri(sedeA, 5_000);
    const v = await vendi(s, { quantita: 2, intento: 'sess-v' });
    await resi.createReturn(tenant, utente(tenant), {
      locationId: sedeA,
      sessionId: s,
      originalDocumentId: v.documentId,
      creationIntentId: `${PREFISSO}-sess-r`,
      reason: 'reso',
      lines: [{ originalLineId: v.lineId, quantity: 1 }],
      refunds: [{ originalPaymentId: v.quotaId, amountMinor: 10_000 }],
    });
    await sessioni.addMovement(tenant, utente(tenant), sedeA, s, {
      type: 'deposit',
      amountMinor: 2_000,
      reason: 'versamento',
    });

    const elenco = await report.list(tenant, utente(tenant), pagina);
    const riga = elenco.items.find((i) => i.id === s);
    expect(riga?.saleCount).toBe(1);
    expect(riga?.salesTotalMinor).toBe(20_000);
    expect(riga?.returnCount).toBe(1);
    expect(riga?.returnsTotalMinor).toBe(10_000);
    expect(riga?.depositsMinor).toBe(2_000);
    expect(riga?.openingFloatMinor).toBe(5_000);
    expect(riga?.status).toBe('open');
  });

  it('a sessione APERTA la quadratura non esiste', async () => {
    const s = await apri(sedeA, 5_000);
    await vendi(s, { intento: 'aperta' });

    const dettaglio = await report.detail(tenant, utente(tenant), s);
    // ⛔ La cecità è strutturale: `frozen` è null finché non si chiude.
    expect(dettaglio.frozen).toBeNull();
    // ⚠️ Gli addendi si ricostruiscono comunque: servono a vedere la sessione,
    //    non a chiuderla.
    expect(dettaglio.breakdown?.salesCashMinor).toBe(10_000);
    expect(dettaglio.breakdownMatchesFrozen).toBeNull();
  });

  it('a sessione CHIUSA porta congelati, addendi e differenze', async () => {
    const s = await apri(sedeA, 5_000);
    await vendi(s, { intento: 'chiusa' });
    await chiusura.close(tenant, utente(tenant), sedeA, s, {
      countedCashMinor: 14_500,
      declaredElectronicMinor: 0,
    });

    const dettaglio = await report.detail(tenant, utente(tenant), s);
    expect(dettaglio.frozen?.expectedCashMinor).toBe(15_000);
    expect(dettaglio.frozen?.countedCashMinor).toBe(14_500);
    // ⭐ Derivata, non persistita.
    expect(dettaglio.frozen?.cashDifferenceMinor).toBe(-500);
    expect(dettaglio.frozen?.electronicDifferenceMinor).toBe(0);
    expect(dettaglio.breakdownMatchesFrozen).toBe(true);
    expect(dettaglio.documents).toHaveLength(1);
  });

  /**
   * ⭐ Il caso che la ricostruzione serve a scoprire: un documento annullato
   * DOPO la chiusura. Il congelato non cambia — è un fatto storico — e la
   * ricostruzione non torna più. Si dice, invece di mostrare due numeri
   * diversi senza spiegazione.
   */
  it('se un documento si annulla DOPO, la ricostruzione non torna e lo dichiara', async () => {
    const s = await apri(sedeA, 0);
    const v = await vendi(s, { intento: 'post-ann' });
    await chiusura.close(tenant, utente(tenant), sedeA, s, { countedCashMinor: 10_000 });

    await prisma.document.update({
      where: { id: v.documentId },
      data: { status: 'cancelled' },
    });

    const dettaglio = await report.detail(tenant, utente(tenant), s);
    // ⛔ Il congelato NON si muove.
    expect(dettaglio.frozen?.expectedCashMinor).toBe(10_000);
    // …e la ricostruzione dice che non torna più.
    expect(dettaglio.breakdown?.expectedCashMinor).toBe(0);
    expect(dettaglio.breakdownMatchesFrozen).toBe(false);
  });

  it('le sessioni si filtrano per stato e per sede, dentro lo scope', async () => {
    const aperta = await apri(sedeA);
    const daChiudere = await apri(sedeB);
    await chiusura.close(tenant, utente(tenant), sedeB, daChiudere, { countedCashMinor: 0 });

    const chiuse = await report.list(tenant, utente(tenant), { ...pagina, status: 'closed' });
    expect(chiuse.items.map((i) => i.id)).toEqual([daChiudere]);

    const aperte = await report.list(tenant, utente(tenant), { ...pagina, status: 'open' });
    expect(aperte.items.map((i) => i.id)).toEqual([aperta]);

    const ristretto = await report.list(tenant, utente(tenant, { sedi: [sedeA] }), pagina);
    expect(ristretto.items.map((i) => i.id)).toEqual([aperta]);
  });

  it('una sessione fuori ambito non si apre', async () => {
    const sb = await apri(sedeB);

    await expect(
      report.detail(tenant, utente(tenant, { sedi: [sedeA] }), sb),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ── Aiutanti ───────────────────────────────────────────────────────────────

async function creaTenant(prisma: PrismaClient, n = 1): Promise<string> {
  const [r] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO "tenants" ("id","name","updated_at")
     VALUES (gen_random_uuid(), $1, CURRENT_TIMESTAMP) RETURNING "id"`,
    `${PREFISSO} ${n}`,
  );
  if (!r) throw new Error('INSERT senza RETURNING');
  return r.id;
}

async function creaSede(prisma: PrismaClient, tenantId: string, nome: string): Promise<string> {
  const [r] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    // ⚠️ `licensed_in_vf` nasce FALSE: senza, lo scope di un utente con sedi
    //    assegnate e` vuoto e le prove sullo scope non provano niente.
    `INSERT INTO "locations" ("id","tenant_id","name","licensed_in_vf","is_active","updated_at")
     VALUES (gen_random_uuid(), $1::uuid, $2, true, true, CURRENT_TIMESTAMP) RETURNING "id"`,
    tenantId,
    `${PREFISSO} ${nome}`,
  );
  if (!r) throw new Error('INSERT senza RETURNING');
  return r.id;
}

/** Una Vendita al banco: stesso tipo documento, NESSUNA sessione di cassa. */
/**
 * Semina in blocco: alla prova interessa QUANTE righe tornano, non come sono
 * nate. Un `checkout` per riga renderebbe la prova lunga minuti.
 */
async function seminaVendite(
  prisma: PrismaClient,
  tenantId: string,
  locationId: string,
  sessionId: string,
  quante: number,
): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "documents"
       ("id","tenant_id","location_id","type","status","year","document_date",
        "reference","number","created_by_name","cash_session_id","total_minor","updated_at")
     SELECT gen_random_uuid(), $1::uuid, $2::uuid, 'store_sale'::"DocumentType",
            'confirmed'::"DocumentStatus", EXTRACT(YEAR FROM CURRENT_DATE)::int,
            CURRENT_DATE - (g || ' minutes')::interval, 'MASSA/' || g, 900000 + g, $4,
            $3::uuid, 10000, CURRENT_TIMESTAMP
       FROM generate_series(1, ${quante}) AS g`,
    tenantId,
    locationId,
    sessionId,
    PREFISSO,
  );
}

async function creaVenditaAlBanco(
  prisma: PrismaClient,
  tenantId: string,
  locationId: string,
): Promise<string> {
  const [r] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO "documents"
       ("id","tenant_id","location_id","type","status","year","document_date",
        "created_by_name","total_minor","updated_at")
     VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'store_sale'::"DocumentType",
             'confirmed'::"DocumentStatus", EXTRACT(YEAR FROM CURRENT_DATE)::int,
             CURRENT_DATE, $3, 5000, CURRENT_TIMESTAMP)
     RETURNING "id"`,
    tenantId,
    locationId,
    PREFISSO,
  );
  if (!r) throw new Error('INSERT senza RETURNING');
  return r.id;
}

async function creaVariante(prisma: PrismaClient, tenantId: string): Promise<string> {
  const prodotto = await prisma.product.create({
    data: {
      tenantId,
      name: `${PREFISSO} articolo`,
      status: 'active',
      articleCode: `${PREFISSO}-ART`,
    },
  });
  const variante = await prisma.productVariant.create({
    data: {
      tenantId,
      productId: prodotto.id,
      sku: `${PREFISSO}-SKU`,
      sellingPriceMinor: 10_000,
      purchasePriceMinor: 4_000,
    },
  });
  return variante.id;
}

async function creaTipo(
  prisma: PrismaClient,
  tenantId: string,
  nome: string,
  tenderKind: 'cash' | 'electronic',
  sortOrder: number,
): Promise<string> {
  const o = await prisma.paymentOption.create({
    data: { tenantId, kind: 'method', name: `${PREFISSO} ${nome}`, sortOrder, tenderKind },
  });
  return o.id;
}

async function svuota(prisma: PrismaClient): Promise<void> {
  const like = `${PREFISSO}%`;
  const dentro = `"tenant_id" IN (SELECT "id" FROM "tenants" WHERE "name" LIKE $1)`;
  await prisma.$executeRawUnsafe(`DELETE FROM "stock_movements" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(
    `DELETE FROM "store_sale_payments" WHERE ${dentro} AND "refunded_from_payment_id" IS NOT NULL`,
    like,
  );
  await prisma.$executeRawUnsafe(`DELETE FROM "store_sale_payments" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(
    `DELETE FROM "document_lines" WHERE ${dentro} AND "returned_from_line_id" IS NOT NULL`,
    like,
  );
  await prisma.$executeRawUnsafe(`DELETE FROM "document_lines" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(
    `DELETE FROM "documents" WHERE ${dentro} AND "type" = 'store_return'`,
    like,
  );
  await prisma.$executeRawUnsafe(`DELETE FROM "documents" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "cash_session_movements" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "cash_session_device_changes" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "cash_sessions" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "creation_intents" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "inventory_levels" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "document_sequences" WHERE ${dentro}`, like);
}

async function pulisci(prisma: PrismaClient): Promise<void> {
  const like = `${PREFISSO}%`;
  const dentro = `"tenant_id" IN (SELECT "id" FROM "tenants" WHERE "name" LIKE $1)`;
  await svuota(prisma);
  await prisma.$executeRawUnsafe(`DELETE FROM "payment_options" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "product_variants" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "products" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "locations" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "tenants" WHERE "name" LIKE $1`, like);
}
