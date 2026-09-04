import { UnprocessableEntityException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { UserProfileDto } from '../../auth/dto/user-profile.dto';
import { CashCheckoutService } from '../../cash-sessions/cash-checkout.service';
import { CashSessionsService } from '../../cash-sessions/cash-sessions.service';
import { CreationIntentService } from '../../common/idempotency/creation-intent.util';
import { DocumentSettingsService } from '../../documents/document-settings.service';

import { creaClientIntegrazione } from './prisma';

/**
 * Collaudo del checkout della Cassa (tranche C4A).
 *
 * ⛔ **Ciò che questi test falsificano**, uno per uno:
 *
 * ```text
 *   il client decide il totale        il server RICALCOLA, e rifiuta se non torna
 *   il retry duplica                  stesso intento = un documento solo
 *   le quote finiscono in `method`    quel campo resta NULL: e' legacy
 *   «misto» si persiste               non esiste una colonna, si calcola
 *   un errore lascia effetti          rollback COMPLETO: zero documenti, zero movimenti
 * ```
 *
 * ⚠️ Il finto `ChannelSyncFacade` non e' una scorciatoia: il push ai canali e'
 * una chiamata di rete che sta FUORI dalla transazione, e in un collaudo di
 * database non deve partire. I movimenti veri, che sono dentro, si verificano.
 *
 * Sul PostgreSQL usa-e-getta, con tenant propri cancellati alla fine.
 */

const PREFISSO = 'COLLAUDO C4A';

describe('checkout della Cassa — C4A su PostgreSQL TEST', () => {
  let prisma: PrismaClient;
  let checkout: CashCheckoutService;
  let sessioni: CashSessionsService;

  let tenant = '';
  let sede = '';
  let variante = '';
  let contanti = '';
  let carta = '';
  let bonifico = '';
  let condizione = '';
  let buono = '';

  const utente = (tenantId: string): UserProfileDto =>
    ({
      id: '00000000-0000-4000-8000-00000000c4a0',
      tenantId,
      displayName: 'Cassiere',
      role: 'owner',
      supportSession: false,
      hasAllLocationsAccess: true,
      assignedLocationIds: [],
      permissions: [],
    }) as unknown as UserProfileDto;

  beforeAll(async () => {
    prisma = creaClientIntegrazione();
    const finto = prisma as never;
    checkout = new CashCheckoutService(
      finto,
      new DocumentSettingsService(finto),
      new CreationIntentService(finto),
      // ⚠️ Il push ai canali non deve partire in un collaudo di database.
      { pushInventoryLevels: async () => undefined } as never,
    );
    sessioni = new CashSessionsService(finto);

    await pulisci(prisma);
    tenant = await creaTenant(prisma);
    sede = await creaSede(prisma, tenant);
    variante = await creaVariante(prisma, tenant);
    contanti = await creaTipo(prisma, tenant, 'Contanti', 'cash', 1);
    carta = await creaTipo(prisma, tenant, 'Carta', 'electronic', 2);
    bonifico = await creaTipo(prisma, tenant, 'Bonifico', null, 3);
    condizione = await creaTipo(prisma, tenant, '30 gg', null, 4, 'terms');
    buono = await creaTipo(prisma, tenant, 'Buono pasto', 'voucher', 5);
  }, 120_000);

  afterEach(async () => {
    await svuotaOperazioni(prisma);
  });

  afterAll(async () => {
    if (prisma) {
      await pulisci(prisma);
      await prisma.$disconnect();
    }
  });

  /** Apre una sessione fresca: l'indice parziale ne ammette una per sede. */
  async function apriSessione(): Promise<string> {
    const s = await sessioni.open(tenant, utente(tenant), {
      locationId: sede,
      openingFloatMinor: 10_000,
    });
    return s.id;
  }

  const riga = (quantity = 1, unitPriceMinor = 10_000) => ({
    variantId: variante,
    quantity,
    unitPriceMinor,
  });

  // ── Il caso semplice ──────────────────────────────────────────────────────

  it('vendita in CONTANTI: documento, righe, quota e movimento', async () => {
    const s = await apriSessione();

    const esito = await checkout.checkout(tenant, utente(tenant), {
      locationId: sede,
      sessionId: s,
      creationIntentId: `${PREFISSO}-contanti`,
      lines: [riga(2, 10_000)],
      payments: [{ paymentOptionId: contanti, amountMinor: 20_000, tenderedMinor: 20_000 }],
    });

    expect(esito.totaleMinor).toBe(20_000);
    expect(esito.restoMinor).toBe(0);

    const doc = await prisma.document.findUnique({
      where: { id: esito.documentId },
      include: { lines: true, storeSalePayments: true },
    });
    expect(doc?.status).toBe('confirmed');
    // ⭐ È QUESTO a distinguere una vendita Cassa da una Vendita al banco.
    expect(doc?.cashSessionId).toBe(s);
    expect(doc?.totalMinor).toBe(20_000);
    expect(doc?.lines).toHaveLength(1);

    const quota = doc?.storeSalePayments[0];
    expect(quota?.amountMinor).toBe(20_000);
    // ⛔ Il campo LEGACY resta NULL: la Cassa non lo scrive mai.
    expect(quota?.method).toBeNull();
    expect(quota?.paymentOptionId).toBe(contanti);
    expect(quota?.optionNameSnapshot).toBe(`${PREFISSO} Contanti`);
    expect(quota?.tenderKindSnapshot).toBe('cash');

    // ⛔ E «misto» non si persiste da nessuna parte: nemmeno in testata.
    expect(doc?.paymentMethod).toBeNull();

    const movimenti = await prisma.stockMovement.findMany({
      where: { sourceDocumentId: esito.documentId },
    });
    expect(movimenti).toHaveLength(1);
    expect(movimenti[0]?.quantity).toBe(2);
  });

  it('il RESTO è tendered − amount, e non si memorizza', async () => {
    const s = await apriSessione();

    const esito = await checkout.checkout(tenant, utente(tenant), {
      locationId: sede,
      sessionId: s,
      creationIntentId: `${PREFISSO}-resto`,
      lines: [riga(1, 10_000)],
      payments: [{ paymentOptionId: contanti, amountMinor: 10_000, tenderedMinor: 20_000 }],
    });

    expect(esito.restoMinor).toBe(10_000);
    const quota = await prisma.storeSalePayment.findFirst({
      where: { documentId: esito.documentId },
    });
    // A pagare la vendita è `amountMinor`, non il consegnato.
    expect(quota?.amountMinor).toBe(10_000);
    expect(quota?.tenderedMinor).toBe(20_000);
  });

  it('pagamento MISTO 60/40: due quote, nessuna colonna «misto»', async () => {
    const s = await apriSessione();

    const esito = await checkout.checkout(tenant, utente(tenant), {
      locationId: sede,
      sessionId: s,
      creationIntentId: `${PREFISSO}-misto`,
      lines: [riga(1, 10_000)],
      payments: [
        { paymentOptionId: contanti, amountMinor: 6_000, tenderedMinor: 6_000 },
        { paymentOptionId: carta, amountMinor: 4_000, confirmed: true },
      ],
    });

    const quote = await prisma.storeSalePayment.findMany({
      where: { documentId: esito.documentId },
      orderBy: { position: 'asc' },
    });
    expect(quote).toHaveLength(2);
    expect(quote.map((q) => q.amountMinor)).toEqual([6_000, 4_000]);
    expect(quote.map((q) => q.tenderKindSnapshot)).toEqual(['cash', 'electronic']);
    expect(quote.map((q) => q.position)).toEqual([1, 2]);
    // ⭐ Su una quota elettronica il consegnato non significa niente.
    expect(quote[1]?.tenderedMinor).toBeNull();
  });

  // ── I rifiuti ─────────────────────────────────────────────────────────────

  it('somma quote DIVERSA dal totale: rifiutata, e senza tolleranza', async () => {
    const s = await apriSessione();

    await expect(
      checkout.checkout(tenant, utente(tenant), {
        locationId: sede,
        sessionId: s,
        creationIntentId: `${PREFISSO}-somma`,
        lines: [riga(1, 10_000)],
        // Un centesimo in meno: basta.
        payments: [{ paymentOptionId: contanti, amountMinor: 9_999, tenderedMinor: 9_999 }],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it("l'ELETTRONICO senza conferma dell'operatore è rifiutato", async () => {
    const s = await apriSessione();

    await expect(
      checkout.checkout(tenant, utente(tenant), {
        locationId: sede,
        sessionId: s,
        creationIntentId: `${PREFISSO}-noconf`,
        lines: [riga(1, 10_000)],
        payments: [{ paymentOptionId: carta, amountMinor: 10_000 }],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('un Tipo NON classificato, una CONDIZIONE e un BUONO sono rifiutati', async () => {
    const s = await apriSessione();
    const base = {
      locationId: sede,
      sessionId: s,
      lines: [riga(1, 10_000)],
    };

    for (const [nome, optionId] of [
      ['non classificato', bonifico],
      ['condizione', condizione],
      ['buono', buono],
    ] as const) {
      await expect(
        checkout.checkout(tenant, utente(tenant), {
          ...base,
          creationIntentId: `${PREFISSO}-${nome}`,
          payments: [{ paymentOptionId: optionId, amountMinor: 10_000, confirmed: true }],
        }),
        nome,
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    }
  });

  it('lo stesso Tipo due volte nello stesso incasso è rifiutato', async () => {
    const s = await apriSessione();

    await expect(
      checkout.checkout(tenant, utente(tenant), {
        locationId: sede,
        sessionId: s,
        creationIntentId: `${PREFISSO}-doppio`,
        lines: [riga(1, 10_000)],
        payments: [
          { paymentOptionId: contanti, amountMinor: 5_000, tenderedMinor: 5_000 },
          { paymentOptionId: contanti, amountMinor: 5_000, tenderedMinor: 5_000 },
        ],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  /**
   * ⛔ Il ROLLBACK deve essere completo: un errore che arriva DOPO la creazione
   * del documento non deve lasciare né documento, né righe, né movimenti.
   */
  it('un errore tardivo lascia ZERO effetti', async () => {
    const s = await apriSessione();
    const primaDocumenti = await prisma.document.count({ where: { tenantId: tenant } });
    const primaMovimenti = await prisma.stockMovement.count({ where: { tenantId: tenant } });

    await expect(
      checkout.checkout(tenant, utente(tenant), {
        locationId: sede,
        sessionId: s,
        creationIntentId: `${PREFISSO}-rollback`,
        lines: [riga(1, 10_000)],
        // La somma non torna: il rifiuto arriva dopo il claim dell'intento.
        payments: [{ paymentOptionId: contanti, amountMinor: 1, tenderedMinor: 1 }],
      }),
    ).rejects.toThrow();

    expect(await prisma.document.count({ where: { tenantId: tenant } })).toBe(primaDocumenti);
    expect(await prisma.stockMovement.count({ where: { tenantId: tenant } })).toBe(primaMovimenti);
    // ⭐ Nemmeno l'intento resta: era la PRIMA scrittura, e la transazione lo
    //    porta via con tutto il resto.
    expect(
      await prisma.creationIntent.count({
        where: { tenantId: tenant, intentId: `${PREFISSO}-rollback` },
      }),
    ).toBe(0);
  });

  // ── Idempotenza e concorrenza ─────────────────────────────────────────────

  it('il RETRY con lo stesso intento non duplica niente', async () => {
    const s = await apriSessione();
    const richiesta = {
      locationId: sede,
      sessionId: s,
      creationIntentId: `${PREFISSO}-retry`,
      lines: [riga(1, 10_000)],
      payments: [{ paymentOptionId: contanti, amountMinor: 10_000, tenderedMinor: 10_000 }],
    };

    await checkout.checkout(tenant, utente(tenant), richiesta);
    // ⚠️ Il secondo tentativo NON crea: si ferma sul vincolo unico dell'intento.
    await expect(checkout.checkout(tenant, utente(tenant), richiesta)).rejects.toThrow();

    expect(await prisma.document.count({ where: { tenantId: tenant, cashSessionId: s } })).toBe(1);
    expect(await prisma.stockMovement.count({ where: { tenantId: tenant } })).toBe(1);
  });

  it('due checkout SIMULTANEI con lo stesso intento: uno solo passa', async () => {
    const s = await apriSessione();
    const richiesta = {
      locationId: sede,
      sessionId: s,
      creationIntentId: `${PREFISSO}-concorrenza`,
      lines: [riga(1, 10_000)],
      payments: [{ paymentOptionId: contanti, amountMinor: 10_000, tenderedMinor: 10_000 }],
    };

    const esiti = await Promise.allSettled([
      checkout.checkout(tenant, utente(tenant), richiesta),
      checkout.checkout(tenant, utente(tenant), richiesta),
    ]);

    expect(esiti.filter((e) => e.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.document.count({ where: { tenantId: tenant, cashSessionId: s } })).toBe(1);
  });

  // ── Il contesto ───────────────────────────────────────────────────────────

  it('senza sessione APERTA non si incassa', async () => {
    const s = await apriSessione();
    await prisma.cashSession.update({
      where: { id: s },
      data: { status: 'closed', closedAt: new Date() },
    });

    await expect(
      checkout.checkout(tenant, utente(tenant), {
        locationId: sede,
        sessionId: s,
        creationIntentId: `${PREFISSO}-chiusa`,
        lines: [riga(1, 10_000)],
        payments: [{ paymentOptionId: contanti, amountMinor: 10_000, tenderedMinor: 10_000 }],
      }),
    ).rejects.toThrow();
  });

  it('un Tipo pagamento di un ALTRO tenant è rifiutato', async () => {
    const s = await apriSessione();
    const altro = await creaTenant(prisma, 2);
    const suoTipo = await creaTipo(prisma, altro, 'Contanti altrui', 'cash', 1);

    await expect(
      checkout.checkout(tenant, utente(tenant), {
        locationId: sede,
        sessionId: s,
        creationIntentId: `${PREFISSO}-crosstenant`,
        lines: [riga(1, 10_000)],
        payments: [{ paymentOptionId: suoTipo, amountMinor: 10_000, tenderedMinor: 10_000 }],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
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

async function creaSede(prisma: PrismaClient, tenantId: string): Promise<string> {
  const [r] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO "locations" ("id","tenant_id","name","updated_at")
     VALUES (gen_random_uuid(), $1::uuid, $2, CURRENT_TIMESTAMP) RETURNING "id"`,
    tenantId,
    `${PREFISSO} sede`,
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
  tenderKind: 'cash' | 'electronic' | 'voucher' | null,
  sortOrder: number,
  kind: 'method' | 'terms' = 'method',
): Promise<string> {
  const o = await prisma.paymentOption.create({
    data: { tenantId, kind, name: `${PREFISSO} ${nome}`, sortOrder, tenderKind },
  });
  return o.id;
}

/** Fra una prova e l'altra: nessuna sessione aperta, nessun documento. */
async function svuotaOperazioni(prisma: PrismaClient): Promise<void> {
  const like = `${PREFISSO}%`;
  const dentro = `"tenant_id" IN (SELECT "id" FROM "tenants" WHERE "name" LIKE $1)`;
  await prisma.$executeRawUnsafe(`DELETE FROM "stock_movements" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "store_sale_payments" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "document_lines" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "documents" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "cash_session_device_changes" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "cash_session_movements" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "cash_sessions" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "creation_intents" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "inventory_levels" WHERE ${dentro}`, like);
}

async function pulisci(prisma: PrismaClient): Promise<void> {
  const like = `${PREFISSO}%`;
  const dentro = `"tenant_id" IN (SELECT "id" FROM "tenants" WHERE "name" LIKE $1)`;
  await svuotaOperazioni(prisma);
  await prisma.$executeRawUnsafe(`DELETE FROM "payment_options" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "product_variants" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "products" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "locations" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "tenants" WHERE "name" LIKE $1`, like);
}
