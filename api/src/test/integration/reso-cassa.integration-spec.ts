import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { UserProfileDto } from '../../auth/dto/user-profile.dto';
import { CashCheckoutService } from '../../cash-sessions/cash-checkout.service';
import { CashReturnService } from '../../cash-sessions/cash-return.service';
import { CashSessionsService } from '../../cash-sessions/cash-sessions.service';
import { CreationIntentService } from '../../common/idempotency/creation-intent.util';
import { DocumentSettingsService } from '../../documents/document-settings.service';

import { creaClientIntegrazione } from './prisma';

/**
 * Collaudo del reso di cassa (tranche C4R).
 *
 * ⛔ **Ciò che questi test falsificano**, uno per uno:
 *
 * ```text
 *   si rende piu` del venduto        il CUMULATIVO lo impedisce, anche in concorrenza
 *   gli importi vengono dal listino  vengono dalla RIGA ORIGINALE, prezzo di allora
 *   si rimborsa come si vuole        solo con i Tipi dell_incasso, e non oltre
 *   la merce torna dov_era           rientra nella sede CORRENTE
 *   un errore lascia effetti         rollback completo
 *   il retry duplica                 gli stessi tre esiti del checkout
 * ```
 *
 * Sul PostgreSQL usa-e-getta, con tenant propri cancellati alla fine.
 */

const PREFISSO = 'COLLAUDO C4R-S';

describe('reso di cassa — C4R su PostgreSQL TEST', () => {
  let prisma: PrismaClient;
  let checkout: CashCheckoutService;
  let resi: CashReturnService;
  let sessioni: CashSessionsService;

  let tenant = '';
  let sede = '';
  let altraSede = '';
  let variante = '';
  let contanti = '';
  let carta = '';

  const utente = (tenantId: string, sedi?: string[]): UserProfileDto =>
    ({
      id: '00000000-0000-4000-8000-00000000c4f0',
      tenantId,
      displayName: 'Cassiere',
      role: sedi ? 'clerk' : 'owner',
      supportSession: false,
      hasAllLocationsAccess: !sedi,
      assignedLocationIds: sedi ?? [],
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

    await pulisci(prisma);
    tenant = await creaTenant(prisma);
    sede = await creaSede(prisma, tenant, 'A');
    altraSede = await creaSede(prisma, tenant, 'B');
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

  /** Una sessione aperta sulla sede indicata. */
  async function apri(locationId = sede): Promise<string> {
    const s = await sessioni.open(tenant, utente(tenant), {
      locationId,
      openingFloatMinor: 0,
    });
    return s.id;
  }

  /** Una vendita di `quantita` pezzi a 100,00 € l'uno, pagata in contanti. */
  async function vendi(
    sessionId: string,
    quantita = 3,
    misto = false,
  ): Promise<{ documentId: string; lineId: string; totale: number }> {
    const totale = quantita * 10_000;
    const esito = await checkout.checkout(tenant, utente(tenant), {
      locationId: sede,
      sessionId,
      creationIntentId: `${PREFISSO}-v-${sessionId}-${quantita}-${misto}`,
      lines: [{ variantId: variante, quantity: quantita, unitPriceMinor: 10_000 }],
      payments: misto
        ? [
            {
              paymentOptionId: contanti,
              amountMinor: totale - 4_000,
              tenderedMinor: totale - 4_000,
            },
            { paymentOptionId: carta, amountMinor: 4_000, confirmed: true },
          ]
        : [{ paymentOptionId: contanti, amountMinor: totale, tenderedMinor: totale }],
    });
    const riga = await prisma.documentLine.findFirstOrThrow({
      where: { documentId: esito.documentId },
    });
    return { documentId: esito.documentId, lineId: riga.id, totale };
  }

  // ── Il richiamo ───────────────────────────────────────────────────────────

  it('il richiamo mostra venduto, già reso e residuo', async () => {
    const s = await apri();
    const v = await vendi(s, 3);

    const primo = await resi.lookup(tenant, utente(tenant), sede, v.documentId);
    expect(primo.lines[0]?.quantitySold).toBe(3);
    expect(primo.lines[0]?.quantityReturned).toBe(0);
    expect(primo.lines[0]?.quantityReturnable).toBe(3);
    expect(primo.payments.map((p) => p.tenderKind)).toEqual(['cash']);

    await resi.createReturn(tenant, utente(tenant), {
      locationId: sede,
      sessionId: s,
      originalDocumentId: v.documentId,
      creationIntentId: `${PREFISSO}-r1`,
      reason: 'taglia sbagliata',
      lines: [{ originalLineId: v.lineId, quantity: 1 }],
      refunds: [{ paymentOptionId: contanti, amountMinor: 10_000 }],
    });

    const dopo = await resi.lookup(tenant, utente(tenant), sede, v.documentId);
    expect(dopo.lines[0]?.quantityReturned).toBe(1);
    expect(dopo.lines[0]?.quantityReturnable).toBe(2);
  });

  // ── Gli importi ───────────────────────────────────────────────────────────

  /**
   * ⭐ Il punto: si restituisce quello che il cliente ha PAGATO, non quello che
   * pagherebbe oggi. Il listino cambia dopo la vendita, e il reso non se ne
   * accorge.
   */
  it('gli importi vengono dalla RIGA ORIGINALE, non dal listino corrente', async () => {
    const s = await apri();
    const v = await vendi(s, 2);

    // Il listino raddoppia DOPO la vendita.
    await prisma.productVariant.update({
      where: { id: variante },
      data: { sellingPriceMinor: 20_000 },
    });

    const esito = await resi.createReturn(tenant, utente(tenant), {
      locationId: sede,
      sessionId: s,
      originalDocumentId: v.documentId,
      creationIntentId: `${PREFISSO}-listino`,
      reason: 'difetto',
      lines: [{ originalLineId: v.lineId, quantity: 1 }],
      refunds: [{ paymentOptionId: contanti, amountMinor: 10_000 }],
    });

    // ⭐ 100,00 €, non 200,00 €.
    expect(esito.totaleMinor).toBe(10_000);
    const riga = await prisma.documentLine.findFirstOrThrow({
      where: { documentId: esito.documentId },
    });
    expect(Number(riga.unitPriceMinor)).toBe(10_000);
    // ⭐ E anche descrizione e legame vengono da lì.
    expect(riga.returnedFromLineId).toBe(v.lineId);
  });

  // ── Il cumulativo ─────────────────────────────────────────────────────────

  it('non si rende PIÙ della quantità venduta', async () => {
    const s = await apri();
    const v = await vendi(s, 2);

    await expect(
      resi.createReturn(tenant, utente(tenant), {
        locationId: sede,
        sessionId: s,
        originalDocumentId: v.documentId,
        creationIntentId: `${PREFISSO}-troppo`,
        reason: 'troppi',
        lines: [{ originalLineId: v.lineId, quantity: 3 }],
        refunds: [{ paymentOptionId: contanti, amountMinor: 30_000 }],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  /**
   * ⭐ Il caso che isola il limite di QUANTITÀ da quello del rimborso.
   *
   * ⚠️ La prova qui sopra non lo isolava: rendere 3 pezzi su 2 fa crescere
   * anche il rimborso oltre l’incassato, e a fermarla era QUEL limite —
   * misurato disattivando il controllo sulla quantità, e restava verde.
   *
   * Qui la vendita ha DUE righe da un pezzo: rendendo 2 pezzi dalla PRIMA il
   * denaro torna (200,00 € su 200,00 € incassati), ma la quantità di quella
   * riga sfonda. Solo il limite di quantità può fermarlo.
   */
  it('la quantità sfonda anche quando il RIMBORSO tornerebbe', async () => {
    const s = await apri();
    const esito = await checkout.checkout(tenant, utente(tenant), {
      locationId: sede,
      sessionId: s,
      creationIntentId: `${PREFISSO}-duerighe`,
      lines: [
        { variantId: variante, quantity: 1, unitPriceMinor: 10_000 },
        { variantId: variante, quantity: 1, unitPriceMinor: 10_000 },
      ],
      payments: [{ paymentOptionId: contanti, amountMinor: 20_000, tenderedMinor: 20_000 }],
    });
    const righe = await prisma.documentLine.findMany({
      where: { documentId: esito.documentId },
      orderBy: { lineNumber: 'asc' },
    });

    await expect(
      resi.createReturn(tenant, utente(tenant), {
        locationId: sede,
        sessionId: s,
        originalDocumentId: esito.documentId,
        creationIntentId: `${PREFISSO}-sfonda-qta`,
        reason: 'due pezzi da una riga che ne ha uno',
        // ⛔ 2 pezzi da una riga che ne ha venduto 1.
        lines: [{ originalLineId: righe[0]!.id, quantity: 2 }],
        // ⭐ …ma 200,00 € su 200,00 € incassati: il rimborso NON sfonda.
        refunds: [{ paymentOptionId: contanti, amountMinor: 20_000 }],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('due resi PARZIALI sommano, e il terzo sfonda il limite', async () => {
    const s = await apri();
    const v = await vendi(s, 3);
    const base = {
      locationId: sede,
      sessionId: s,
      originalDocumentId: v.documentId,
      reason: 'parziale',
    };

    await resi.createReturn(tenant, utente(tenant), {
      ...base,
      creationIntentId: `${PREFISSO}-p1`,
      lines: [{ originalLineId: v.lineId, quantity: 2 }],
      refunds: [{ paymentOptionId: contanti, amountMinor: 20_000 }],
    });
    await resi.createReturn(tenant, utente(tenant), {
      ...base,
      creationIntentId: `${PREFISSO}-p2`,
      lines: [{ originalLineId: v.lineId, quantity: 1 }],
      refunds: [{ paymentOptionId: contanti, amountMinor: 10_000 }],
    });

    // Il terzo non ha piu` niente da rendere.
    await expect(
      resi.createReturn(tenant, utente(tenant), {
        ...base,
        creationIntentId: `${PREFISSO}-p3`,
        lines: [{ originalLineId: v.lineId, quantity: 1 }],
        refunds: [{ paymentOptionId: contanti, amountMinor: 10_000 }],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  /**
   * ⭐ La prova che il lock serve: due resi che chiedono insieme l'ULTIMA
   * quantità disponibile. Uno solo deve riuscire.
   */
  it('due resi CONCORRENTI sull_ultima quantità: uno solo riesce', async () => {
    const s = await apri();
    const v = await vendi(s, 1);
    const base = {
      locationId: sede,
      sessionId: s,
      originalDocumentId: v.documentId,
      reason: 'concorrenza',
      lines: [{ originalLineId: v.lineId, quantity: 1 }],
      refunds: [{ paymentOptionId: contanti, amountMinor: 10_000 }],
    };

    const esiti = await Promise.allSettled([
      resi.createReturn(tenant, utente(tenant), { ...base, creationIntentId: `${PREFISSO}-c1` }),
      resi.createReturn(tenant, utente(tenant), { ...base, creationIntentId: `${PREFISSO}-c2` }),
    ]);

    expect(esiti.filter((e) => e.status === 'fulfilled')).toHaveLength(1);
    // ⭐ E la quantità resa non supera quella venduta.
    const resa = await prisma.documentLine.aggregate({
      where: { returnedFromLineId: v.lineId },
      _sum: { quantity: true },
    });
    expect(resa._sum.quantity).toBe(1);
  });

  // ── Il rimborso ───────────────────────────────────────────────────────────

  it('si rimborsa SOLO con i Tipi dell_incasso originale', async () => {
    const s = await apri();
    // Venduta in contanti: la carta non c'entra.
    const v = await vendi(s, 1);

    await expect(
      resi.createReturn(tenant, utente(tenant), {
        locationId: sede,
        sessionId: s,
        originalDocumentId: v.documentId,
        creationIntentId: `${PREFISSO}-altromodo`,
        reason: 'modalita` nuova',
        lines: [{ originalLineId: v.lineId, quantity: 1 }],
        refunds: [{ paymentOptionId: carta, amountMinor: 10_000, confirmed: true }],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('rimborso MISTO entro i limiti originali', async () => {
    const s = await apri();
    // 3 pezzi = 300,00 €, di cui 40,00 con carta.
    const v = await vendi(s, 3, true);

    const esito = await resi.createReturn(tenant, utente(tenant), {
      locationId: sede,
      sessionId: s,
      originalDocumentId: v.documentId,
      creationIntentId: `${PREFISSO}-mistoreso`,
      reason: 'reso misto',
      lines: [{ originalLineId: v.lineId, quantity: 1 }],
      refunds: [
        { paymentOptionId: contanti, amountMinor: 6_000 },
        { paymentOptionId: carta, amountMinor: 4_000, confirmed: true },
      ],
    });

    const quote = await prisma.storeSalePayment.findMany({
      where: { documentId: esito.documentId },
      orderBy: { position: 'asc' },
    });
    expect(quote.map((q) => q.amountMinor)).toEqual([6_000, 4_000]);
    // ⭐ Positivi: la direzione la dà il tipo documento.
    expect(quote.every((q) => q.amountMinor > 0)).toBe(true);
  });

  it('non si rimborsa con un Tipo PIÙ di quanto era stato incassato', async () => {
    const s = await apri();
    const v = await vendi(s, 3, true); // 260,00 contanti + 40,00 carta

    await expect(
      resi.createReturn(tenant, utente(tenant), {
        locationId: sede,
        sessionId: s,
        originalDocumentId: v.documentId,
        creationIntentId: `${PREFISSO}-oltrecarta`,
        reason: 'oltre il carta',
        lines: [{ originalLineId: v.lineId, quantity: 1 }],
        // 100,00 € tutti su carta, ma con carta erano entrati solo 40,00.
        refunds: [{ paymentOptionId: carta, amountMinor: 10_000, confirmed: true }],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('il rimborso deve coprire ESATTAMENTE il reso', async () => {
    const s = await apri();
    const v = await vendi(s, 2);

    await expect(
      resi.createReturn(tenant, utente(tenant), {
        locationId: sede,
        sessionId: s,
        originalDocumentId: v.documentId,
        creationIntentId: `${PREFISSO}-somma`,
        reason: 'somma sbagliata',
        lines: [{ originalLineId: v.lineId, quantity: 1 }],
        refunds: [{ paymentOptionId: contanti, amountMinor: 9_999 }],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  // ── Il rientro della merce ────────────────────────────────────────────────

  /**
   * ⭐ La merce rientra dove viene fisicamente riportata, non dove era stata
   * venduta: il cliente può tornare in un altro negozio.
   */
  it('la merce rientra nella sede CORRENTE, non in quella della vendita', async () => {
    const s = await apri();
    const v = await vendi(s, 1);
    // La sessione della vendita si chiude, e se ne apre una sull'altra sede.
    await prisma.cashSession.update({
      where: { id: s },
      data: { status: 'closed', closedAt: new Date() },
    });
    const altraSessione = await apri(altraSede);

    const esito = await resi.createReturn(tenant, utente(tenant), {
      locationId: altraSede,
      sessionId: altraSessione,
      originalDocumentId: v.documentId,
      creationIntentId: `${PREFISSO}-altrasede`,
      reason: 'reso in altro negozio',
      lines: [{ originalLineId: v.lineId, quantity: 1 }],
      refunds: [{ paymentOptionId: contanti, amountMinor: 10_000 }],
    });

    const doc = await prisma.document.findUniqueOrThrow({ where: { id: esito.documentId } });
    expect(doc.locationId).toBe(altraSede);

    const movimento = await prisma.stockMovement.findFirstOrThrow({
      where: { sourceDocumentId: esito.documentId },
    });
    // ⭐ Il rientro è sulla sede corrente.
    expect(movimento.locationId).toBe(altraSede);
    expect(movimento.quantity).toBe(1);
  });

  it('una sede NON assegnata è rifiutata anche per il reso', async () => {
    const s = await apri();
    const v = await vendi(s, 1);

    await expect(
      resi.createReturn(tenant, utente(tenant, [altraSede]), {
        locationId: sede,
        sessionId: s,
        originalDocumentId: v.documentId,
        creationIntentId: `${PREFISSO}-sedenegata`,
        reason: 'sede altrui',
        lines: [{ originalLineId: v.lineId, quantity: 1 }],
        refunds: [{ paymentOptionId: contanti, amountMinor: 10_000 }],
      }),
    ).rejects.toThrow();
  });

  // ── Rollback e idempotenza ────────────────────────────────────────────────

  it('un errore lascia ZERO effetti', async () => {
    const s = await apri();
    const v = await vendi(s, 1);
    const documenti = await prisma.document.count({ where: { tenantId: tenant } });
    const movimenti = await prisma.stockMovement.count({ where: { tenantId: tenant } });

    await expect(
      resi.createReturn(tenant, utente(tenant), {
        locationId: sede,
        sessionId: s,
        originalDocumentId: v.documentId,
        creationIntentId: `${PREFISSO}-rollback`,
        reason: 'rollback',
        lines: [{ originalLineId: v.lineId, quantity: 1 }],
        refunds: [{ paymentOptionId: contanti, amountMinor: 1 }],
      }),
    ).rejects.toThrow();

    expect(await prisma.document.count({ where: { tenantId: tenant } })).toBe(documenti);
    expect(await prisma.stockMovement.count({ where: { tenantId: tenant } })).toBe(movimenti);
    expect(
      await prisma.creationIntent.count({
        where: { tenantId: tenant, intentId: `${PREFISSO}-rollback` },
      }),
    ).toBe(0);
  });

  it('RETRY identico: restituisce il reso già creato', async () => {
    const s = await apri();
    const v = await vendi(s, 2);
    const richiesta = {
      locationId: sede,
      sessionId: s,
      originalDocumentId: v.documentId,
      creationIntentId: `${PREFISSO}-retry`,
      reason: 'retry',
      lines: [{ originalLineId: v.lineId, quantity: 1 }],
      refunds: [{ paymentOptionId: contanti, amountMinor: 10_000 }],
    };

    const primo = await resi.createReturn(tenant, utente(tenant), richiesta);
    const secondo = await resi.createReturn(tenant, utente(tenant), richiesta);

    expect(secondo.documentId).toBe(primo.documentId);
    expect(secondo.totaleMinor).toBe(primo.totaleMinor);
    // ⭐ E la quantità resa NON raddoppia.
    const resa = await prisma.documentLine.aggregate({
      where: { returnedFromLineId: v.lineId },
      _sum: { quantity: true },
    });
    expect(resa._sum.quantity).toBe(1);
  });

  it('stesso intento e payload DIVERSO: conflitto', async () => {
    const s = await apri();
    const v = await vendi(s, 3);
    const base = {
      locationId: sede,
      sessionId: s,
      originalDocumentId: v.documentId,
      creationIntentId: `${PREFISSO}-mismatch`,
      reason: 'mismatch',
    };

    await resi.createReturn(tenant, utente(tenant), {
      ...base,
      lines: [{ originalLineId: v.lineId, quantity: 1 }],
      refunds: [{ paymentOptionId: contanti, amountMinor: 10_000 }],
    });

    await expect(
      resi.createReturn(tenant, utente(tenant), {
        ...base,
        lines: [{ originalLineId: v.lineId, quantity: 2 }],
        refunds: [{ paymentOptionId: contanti, amountMinor: 20_000 }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  // ── Il cross-tenant ───────────────────────────────────────────────────────

  it('una vendita di un ALTRO tenant non si rende', async () => {
    const s = await apri();
    const altro = await creaTenant(prisma, 2);
    const suaSede = await creaSede(prisma, altro, 'X');
    const suoDoc = await creaDocumentoGrezzo(prisma, altro, suaSede);

    await expect(
      resi.createReturn(tenant, utente(tenant), {
        locationId: sede,
        sessionId: s,
        originalDocumentId: suoDoc,
        creationIntentId: `${PREFISSO}-crosstenant`,
        reason: 'altrui',
        lines: [{ originalLineId: suoDoc, quantity: 1 }],
        refunds: [{ paymentOptionId: contanti, amountMinor: 10_000 }],
      }),
    ).rejects.toThrow();
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
    `INSERT INTO "locations" ("id","tenant_id","name","updated_at")
     VALUES (gen_random_uuid(), $1::uuid, $2, CURRENT_TIMESTAMP) RETURNING "id"`,
    tenantId,
    `${PREFISSO} ${nome}`,
  );
  if (!r) throw new Error('INSERT senza RETURNING');
  return r.id;
}

async function creaDocumentoGrezzo(
  prisma: PrismaClient,
  tenantId: string,
  locationId: string,
): Promise<string> {
  const [r] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO "documents"
       ("id","tenant_id","location_id","type","status","year","document_date",
        "created_by_name","updated_at")
     VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'store_sale'::"DocumentType",
             'confirmed'::"DocumentStatus", EXTRACT(YEAR FROM CURRENT_DATE)::int,
             CURRENT_DATE, $3, CURRENT_TIMESTAMP)
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
  await prisma.$executeRawUnsafe(`DELETE FROM "store_sale_payments" WHERE ${dentro}`, like);
  // ⚠️ Prima le righe di RESO: la self-FK e` RESTRICT.
  await prisma.$executeRawUnsafe(
    `DELETE FROM "document_lines" WHERE ${dentro} AND "returned_from_line_id" IS NOT NULL`,
    like,
  );
  await prisma.$executeRawUnsafe(`DELETE FROM "document_lines" WHERE ${dentro}`, like);
  // ⚠️ E prima i RESI: puntano alla vendita con `source_document_id`.
  await prisma.$executeRawUnsafe(
    `DELETE FROM "documents" WHERE ${dentro} AND "type" = 'store_return'`,
    like,
  );
  await prisma.$executeRawUnsafe(`DELETE FROM "documents" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "cash_session_movements" WHERE ${dentro}`, like);
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
