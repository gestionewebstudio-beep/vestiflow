import type { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { UserProfileDto } from '../../auth/dto/user-profile.dto';
import { CashCheckoutService } from '../../cash-sessions/cash-checkout.service';
import { CashReturnService } from '../../cash-sessions/cash-return.service';
import { CashSessionsService } from '../../cash-sessions/cash-sessions.service';
import { CreationIntentService } from '../../common/idempotency/creation-intent.util';
import { CorrispettiviService } from '../../corrispettivi/corrispettivi.service';
import { DocumentSettingsService } from '../../documents/document-settings.service';

import { creaClientIntegrazione } from './prisma';

/**
 * Le operazioni di Cassa alimentano il **Registro corrispettivi contabile**?
 *
 * ⭐ **La risposta è sì, e senza che nessuno l'abbia scritto per la Cassa**: il
 * Registro raccoglie i documenti per TIPO — `store_sale` e `store_return`, non
 * annullati, nel periodo — e una vendita di Cassa è una normale `store_sale`
 * (`docs/25` §4, decisione 2). Non esiste un secondo percorso di
 * contabilizzazione, e non esiste un indicatore «registrato nei corrispettivi».
 *
 * ⛔ **Questa prova esiste perché quella catena non è visibile da nessuna
 * parte.** Nessuna riga di codice della Cassa nomina i corrispettivi, e nessuna
 * riga dei corrispettivi nomina la Cassa: chi legge uno dei due file non ha
 * modo di sapere che sono collegati, e il giorno in cui qualcuno aggiungesse
 * alla Cassa un tipo documento proprio, o al Registro un filtro su
 * `cashSessionId`, il collegamento si romperebbe **in silenzio**.
 *
 * ⚠️ E verifica anche la **non duplicazione**: una sola riga per operazione.
 */

const PREFISSO = 'COLLAUDO CASSA-CORR';

describe('la Cassa alimenta il Registro corrispettivi — su PostgreSQL TEST', () => {
  let prisma: PrismaClient;
  let checkout: CashCheckoutService;
  let resi: CashReturnService;
  let sessioni: CashSessionsService;
  let registro: CorrispettiviService;

  let tenant = '';
  let sede = '';
  let variante = '';
  let contanti = '';

  const utente = (tenantId: string): UserProfileDto =>
    ({
      id: '00000000-0000-4000-8000-00000000cc00',
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
    registro = new CorrispettiviService(finto);

    await pulisci(prisma);
    tenant = await creaTenant(prisma);
    sede = await creaSede(prisma, tenant);
    variante = await creaVariante(prisma, tenant);
    contanti = await creaTipo(prisma, tenant);
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

  /** Il filtro del Registro: tutto il periodo, tutte le origini. */
  const periodo = () =>
    ({
      page: 1,
      pageSize: 200,
      placedFrom: '2020-01-01',
      placedTo: '2100-01-01',
    }) as never;

  async function vendi(sessionId: string, quantita: number, intento: string) {
    const totale = quantita * 10_000;
    const esito = await checkout.checkout(tenant, utente(tenant), {
      locationId: sede,
      sessionId,
      creationIntentId: `${PREFISSO}-${intento}`,
      lines: [{ variantId: variante, quantity: quantita, unitPriceMinor: 10_000 }],
      payments: [{ paymentOptionId: contanti, amountMinor: totale, tenderedMinor: totale }],
    });
    const riga = await prisma.documentLine.findFirstOrThrow({
      where: { documentId: esito.documentId },
    });
    const quota = await prisma.storeSalePayment.findFirstOrThrow({
      where: { documentId: esito.documentId },
    });
    return { ...esito, lineId: riga.id, quotaId: quota.id, totale };
  }

  it('una vendita di Cassa compare nel Registro UNA volta, come vendita', async () => {
    const s = await sessioni.open(tenant, utente(tenant), {
      locationId: sede,
      openingFloatMinor: 0,
    });
    const v = await vendi(s.id, 2, 'vendita'); // 200,00 €

    const elenco = await registro.listOrders(tenant, periodo());
    const righe = elenco.items.filter((r) => r.documentId === v.documentId);

    // ⭐ UNA riga sola: nessuna seconda contabilizzazione.
    expect(righe).toHaveLength(1);
    expect(righe[0]?.kind).toBe('sale');
    expect(righe[0]?.totalMinor).toBe(20_000);
    // ⭐ L'origine è quella della Vendita al banco: è la stessa cassa.
    expect(righe[0]?.source).toBe('store');
    expect(righe[0]?.locationId).toBe(sede);
  });

  it('un reso di Cassa compare come RETTIFICA, e abbatte il riepilogo', async () => {
    const s = await sessioni.open(tenant, utente(tenant), {
      locationId: sede,
      openingFloatMinor: 0,
    });
    const v = await vendi(s.id, 2, 'reso-v'); // 200,00 €

    const prima = await registro.getSummary(tenant, periodo());

    const reso = await resi.createReturn(tenant, utente(tenant), {
      locationId: sede,
      sessionId: s.id,
      originalDocumentId: v.documentId,
      creationIntentId: `${PREFISSO}-reso`,
      reason: 'taglia sbagliata',
      lines: [{ originalLineId: v.lineId, quantity: 1 }],
      refunds: [{ originalPaymentId: v.quotaId, amountMinor: 10_000 }],
    });

    const elenco = await registro.listOrders(tenant, periodo());
    const righeReso = elenco.items.filter((r) => r.documentId === reso.documentId);
    expect(righeReso).toHaveLength(1);
    // ⛔ `refund`, mai `sale`: il verso lo dà il TIPO documento.
    expect(righeReso[0]?.kind).toBe('refund');

    const dopo = await registro.getSummary(tenant, periodo());
    // ⭐ Il reso SOTTRAE dal netto, che è «il numero che conta».
    expect(prima.netTotalMinor - dopo.netTotalMinor).toBe(10_000);
    expect(dopo.refundTotalMinor - prima.refundTotalMinor).toBe(10_000);
    expect(dopo.refundCount - prima.refundCount).toBe(1);
    // ⚠️ E il LORDO delle vendite non si muove: il reso non è una vendita in
    //    meno, è una rettifica in più. Sono due numeri diversi, ed è la ragione
    //    per cui il Registro li tiene separati.
    expect(dopo.totalMinor).toBe(prima.totalMinor);
  });

  it('una vendita ANNULLATA esce dal Registro', async () => {
    const s = await sessioni.open(tenant, utente(tenant), {
      locationId: sede,
      openingFloatMinor: 0,
    });
    const v = await vendi(s.id, 1, 'annullata');

    await prisma.document.update({
      where: { id: v.documentId },
      data: { status: 'cancelled' },
    });

    const elenco = await registro.listOrders(tenant, periodo());
    expect(elenco.items.filter((r) => r.documentId === v.documentId)).toHaveLength(0);
  });

  /**
   * ⛔ Il difetto che romperebbe la catena senza far arrossare niente: un
   * documento di Cassa con un tipo diverso da `store_sale`/`store_return`.
   */
  it('la Cassa scrive i tipi che il Registro raccoglie, e non altri', async () => {
    const s = await sessioni.open(tenant, utente(tenant), {
      locationId: sede,
      openingFloatMinor: 0,
    });
    const v = await vendi(s.id, 1, 'tipi');
    const reso = await resi.createReturn(tenant, utente(tenant), {
      locationId: sede,
      sessionId: s.id,
      originalDocumentId: v.documentId,
      creationIntentId: `${PREFISSO}-tipi-r`,
      reason: 'controllo tipi',
      lines: [{ originalLineId: v.lineId, quantity: 1 }],
      refunds: [{ originalPaymentId: v.quotaId, amountMinor: 10_000 }],
    });

    const documenti = await prisma.document.findMany({
      where: { id: { in: [v.documentId, reso.documentId] } },
      select: { id: true, type: true, status: true, cashSessionId: true },
    });
    expect(documenti.map((d) => d.type).sort()).toEqual(['store_return', 'store_sale']);
    // ⚠️ E la sessione è valorizzata: è ciò che distingue Cassa da banco, e
    //    NON è un filtro del Registro — se lo diventasse, la catena si
    //    romperebbe in silenzio.
    expect(documenti.every((d) => d.cashSessionId === s.id)).toBe(true);
    expect(documenti.every((d) => d.status === 'confirmed')).toBe(true);
  });
});

// ── Aiutanti ───────────────────────────────────────────────────────────────

async function creaTenant(prisma: PrismaClient): Promise<string> {
  const [r] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO "tenants" ("id","name","updated_at")
     VALUES (gen_random_uuid(), $1, CURRENT_TIMESTAMP) RETURNING "id"`,
    `${PREFISSO} 1`,
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

async function creaTipo(prisma: PrismaClient, tenantId: string): Promise<string> {
  const o = await prisma.paymentOption.create({
    data: {
      tenantId,
      kind: 'method',
      name: `${PREFISSO} Contanti`,
      sortOrder: 1,
      tenderKind: 'cash',
    },
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
