import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { creaClientIntegrazione } from './prisma';

/**
 * Collaudo di `20260904200000_reso_collegato_alla_riga` (tranche C4R, schema).
 *
 * ⛔ **Ciò che questi test falsificano**, uno per uno:
 *
 * ```text
 *   il legame si perde cancellando       la vendita NON si cancella se ha resi
 *   la stessa riga si rende due volte    non nello STESSO documento di reso
 *   un unique globale basterebbe         due resi PARZIALI distinti devono passare
 *   fiscalNumber contiene la chiusura    sono DUE colonne, e restano separate
 *   la ricevuta originale si cancella    RESTRICT, come la riga
 * ```
 *
 * ⚠️ Qui si prova lo SCHEMA. Il limite cumulativo — «non più della quantità
 * venduta» — non è un vincolo di database: lo fanno lock e transazione nel
 * servizio, ed è materia del checkout (`docs/25` §12).
 *
 * Sul PostgreSQL usa-e-getta, con tenant propri cancellati alla fine.
 */

const PREFISSO = 'COLLAUDO C4R';

describe('reso collegato alla riga — C4R su PostgreSQL TEST', () => {
  let prisma: PrismaClient;
  let tenant = '';
  let sede = '';

  beforeAll(async () => {
    prisma = creaClientIntegrazione();
    await pulisci(prisma);
    tenant = await creaTenant(prisma);
    sede = await creaSede(prisma, tenant);
  }, 120_000);

  afterAll(async () => {
    if (prisma) {
      await pulisci(prisma);
      await prisma.$disconnect();
    }
  });

  // ── Il collegamento ───────────────────────────────────────────────────────

  it('una riga di reso dichiara la riga di vendita che rettifica', async () => {
    const vendita = await creaDocumento(prisma, tenant, sede, 'store_sale');
    const rigaVendita = await creaRiga(prisma, tenant, vendita, 1, 3);
    const reso = await creaDocumento(prisma, tenant, sede, 'store_return');

    const rigaReso = await creaRiga(prisma, tenant, reso, 1, 1, rigaVendita.id);

    expect(rigaReso.returnedFromLineId).toBe(rigaVendita.id);

    const conOrigine = await prisma.documentLine.findUnique({
      where: { id: rigaReso.id },
      include: { returnSourceLine: true },
    });
    expect(conOrigine?.returnSourceLine?.id).toBe(rigaVendita.id);
  });

  it('e dalla riga di vendita si risale a TUTTI i resi che la rettificano', async () => {
    const vendita = await creaDocumento(prisma, tenant, sede, 'store_sale');
    const rigaVendita = await creaRiga(prisma, tenant, vendita, 1, 5);

    // ⭐ Due resi PARZIALI, in documenti distinti: e' il caso che un unique
    //    globale su `returned_from_line_id` avrebbe vietato.
    const primo = await creaDocumento(prisma, tenant, sede, 'store_return');
    const secondo = await creaDocumento(prisma, tenant, sede, 'store_return');
    await creaRiga(prisma, tenant, primo, 1, 2, rigaVendita.id);
    await creaRiga(prisma, tenant, secondo, 1, 1, rigaVendita.id);

    const origine = await prisma.documentLine.findUnique({
      where: { id: rigaVendita.id },
      include: { returnLines: true },
    });
    expect(origine?.returnLines).toHaveLength(2);
    expect(origine?.returnLines.map((l) => l.quantity).sort()).toEqual([1, 2]);
  });

  /**
   * ⛔ La stessa riga originale due volte nello STESSO reso sarebbero due righe
   * che rendono la stessa cosa, e il cumulativo diventerebbe ambiguo.
   */
  it('la stessa riga originale NON entra due volte nello stesso documento di reso', async () => {
    const vendita = await creaDocumento(prisma, tenant, sede, 'store_sale');
    const rigaVendita = await creaRiga(prisma, tenant, vendita, 1, 5);
    const reso = await creaDocumento(prisma, tenant, sede, 'store_return');
    await creaRiga(prisma, tenant, reso, 1, 1, rigaVendita.id);

    await expect(creaRiga(prisma, tenant, reso, 2, 1, rigaVendita.id)).rejects.toThrow();
  });

  /**
   * ⚠️ In PostgreSQL un UNIQUE con una colonna NULL non vincola quelle righe:
   * senza questa prova, l'unique composto sembrerebbe impedire due righe
   * ordinarie nello stesso documento.
   */
  it('ma due righe SENZA collegamento nello stesso documento restano lecite', async () => {
    const vendita = await creaDocumento(prisma, tenant, sede, 'store_sale');

    const a = await creaRiga(prisma, tenant, vendita, 1, 1);
    const b = await creaRiga(prisma, tenant, vendita, 2, 1);

    expect(a.returnedFromLineId).toBeNull();
    expect(b.returnedFromLineId).toBeNull();
  });

  // ── La protezione ─────────────────────────────────────────────────────────

  /**
   * ⭐ È la ragione di `RESTRICT`, e il comportamento che il preflight ha
   * misurato: con questa FK il `CASCADE` da `documents` non può più
   * attraversare le righe.
   */
  it('la VENDITA non si cancella finché un reso ne rettifica una riga', async () => {
    const vendita = await creaDocumento(prisma, tenant, sede, 'store_sale');
    const rigaVendita = await creaRiga(prisma, tenant, vendita, 1, 2);
    const reso = await creaDocumento(prisma, tenant, sede, 'store_return');
    await creaRiga(prisma, tenant, reso, 1, 1, rigaVendita.id);

    await expect(prisma.document.delete({ where: { id: vendita } })).rejects.toThrow();
  });

  /**
   * ⚠️ Questa prova verifica il CLIENT Prisma, non la chiave esterna: Prisma
   * emula le azioni referenziali che dichiara, quindi rifiuta la `delete`
   * prima di arrivare al database. Misurato falsificando: portando la FK a
   * `SET NULL` questa prova resta VERDE, mentre quella sopra — che passa dal
   * `CASCADE` del documento, gestito dal database — arrossa.
   *
   * ⭐ Le due insieme coprono le due strade; da sola, questa direbbe di aver
   * provato il vincolo del database senza averlo fatto.
   */
  it('e nemmeno la singola RIGA di vendita si cancella', async () => {
    const vendita = await creaDocumento(prisma, tenant, sede, 'store_sale');
    const rigaVendita = await creaRiga(prisma, tenant, vendita, 1, 2);
    const reso = await creaDocumento(prisma, tenant, sede, 'store_return');
    await creaRiga(prisma, tenant, reso, 1, 1, rigaVendita.id);

    await expect(prisma.documentLine.delete({ where: { id: rigaVendita.id } })).rejects.toThrow();
  });

  it('tolto il reso, la vendita torna cancellabile', async () => {
    const vendita = await creaDocumento(prisma, tenant, sede, 'store_sale');
    const rigaVendita = await creaRiga(prisma, tenant, vendita, 1, 2);
    const reso = await creaDocumento(prisma, tenant, sede, 'store_return');
    await creaRiga(prisma, tenant, reso, 1, 1, rigaVendita.id);

    await prisma.document.delete({ where: { id: reso } });
    await prisma.document.delete({ where: { id: vendita } });

    expect(await prisma.document.findUnique({ where: { id: vendita } })).toBeNull();
  });

  /**
   * ⚠️ Il database NON verifica che la riga originale appartenga al documento
   * indicato come `sourceDocumentId`, né che sia dello stesso tenant: le FK
   * legano gli identificativi uno per uno (`docs/25` §13). Sono verifiche
   * APPLICATIVE, e questa prova le dichiara invece di fingerle.
   */
  it('il database NON verifica tenant e documento della riga originale', async () => {
    const altroTenant = await creaTenant(prisma, 2);
    const altraSede = await creaSede(prisma, altroTenant);
    const venditaAltrui = await creaDocumento(prisma, altroTenant, altraSede, 'store_sale');
    const rigaAltrui = await creaRiga(prisma, altroTenant, venditaAltrui, 1, 1);

    const reso = await creaDocumento(prisma, tenant, sede, 'store_return');
    const incoerente = await creaRiga(prisma, tenant, reso, 1, 1, rigaAltrui.id);

    expect(incoerente.tenantId).toBe(tenant);
    const origine = await prisma.documentLine.findUnique({ where: { id: rigaAltrui.id } });
    expect(origine?.tenantId).toBe(altroTenant);
  });

  // ── I riferimenti fiscali ─────────────────────────────────────────────────

  /**
   * ⛔ Il ramo storico infilava il numero di chiusura dentro `fiscalNumber`
   * come prefisso composto (`0012-0034`). Da C4R sono due colonne.
   */
  it('numero documento e numero di chiusura sono DUE colonne', async () => {
    const documento = await creaDocumento(prisma, tenant, sede, 'store_sale');
    const ricevuta = await prisma.fiscalReceipt.create({
      data: {
        tenantId: tenant,
        documentId: documento,
        status: 'emitted',
        fiscalNumber: '0034',
        closureNumber: '0012',
        serialNumber: 'MATRICOLA-1',
      },
    });

    expect(ricevuta.fiscalNumber).toBe('0034');
    expect(ricevuta.closureNumber).toBe('0012');
    // ⚠️ Testo: gli zeri iniziali si conservano, e senza non si confronterebbe
    //    piu' con lo scontrino di carta.
    expect(ricevuta.closureNumber).not.toBe('12');
  });

  it('una ricevuta richiamata da un reso NON si cancella', async () => {
    const docVendita = await creaDocumento(prisma, tenant, sede, 'store_sale');
    const docReso = await creaDocumento(prisma, tenant, sede, 'store_return');
    const originale = await prisma.fiscalReceipt.create({
      data: { tenantId: tenant, documentId: docVendita, status: 'emitted', fiscalNumber: '0001' },
    });
    await prisma.fiscalReceipt.create({
      data: {
        tenantId: tenant,
        documentId: docReso,
        status: 'emitted',
        fiscalNumber: '0002',
        originalReceiptId: originale.id,
      },
    });

    await expect(prisma.fiscalReceipt.delete({ where: { id: originale.id } })).rejects.toThrow();
  });

  // ── I resi storici ────────────────────────────────────────────────────────

  /**
   * ⭐ I 15 resi storici del database condiviso restano senza origine, e non si
   * ricostruisce: dedurla per variante o per prezzo sarebbe inventarla.
   */
  it('un reso senza origine resta valido: è il caso dei resi storici', async () => {
    const reso = await creaDocumento(prisma, tenant, sede, 'store_return');
    const riga = await creaRiga(prisma, tenant, reso, 1, 1);

    expect(riga.returnedFromLineId).toBeNull();
    const documento = await prisma.document.findUnique({ where: { id: reso } });
    expect(documento?.sourceDocumentId).toBeNull();
  });

  // ── Il rimborso collegato alla QUOTA ──────────────────────────────────────

  /**
   * ⭐ L'identita' di un incasso e' la QUOTA, non il Tipo con cui e' stato
   * preso: il Tipo puo` essere eliminato, e due quote possono averlo uguale.
   */
  it('una quota di rimborso dichiara la quota di incasso che restituisce', async () => {
    const vendita = await creaDocumento(prisma, tenant, sede, 'store_sale');
    const reso = await creaDocumento(prisma, tenant, sede, 'store_return');
    const incasso = await creaQuota(prisma, tenant, vendita, 1, 10_000);
    const rimborso = await creaQuota(prisma, tenant, reso, 1, 4_000, incasso.id);

    expect(rimborso.refundedFromPaymentId).toBe(incasso.id);
    // ⭐ E dalla quota di incasso si risale a tutti i rimborsi che la toccano.
    const conRimborsi = await prisma.storeSalePayment.findUniqueOrThrow({
      where: { id: incasso.id },
      include: { refunds: true },
    });
    expect(conRimborsi.refunds.map((q) => q.id)).toEqual([rimborso.id]);
  });

  /**
   * ⛔ Due rimborsi della stessa quota nello STESSO documento renderebbero il
   * cumulativo ambiguo da leggere: e` una riga sola, o due?
   */
  it('la stessa quota di incasso NON si rimborsa due volte nello stesso reso', async () => {
    const vendita = await creaDocumento(prisma, tenant, sede, 'store_sale');
    const reso = await creaDocumento(prisma, tenant, sede, 'store_return');
    const incasso = await creaQuota(prisma, tenant, vendita, 1, 10_000);
    await creaQuota(prisma, tenant, reso, 1, 3_000, incasso.id);

    await expect(creaQuota(prisma, tenant, reso, 2, 2_000, incasso.id)).rejects.toThrow();
  });

  /**
   * ⭐ Ma in resi DISTINTI la stessa quota si rimborsa piu` volte: un reso
   * oggi, un altro domani, ciascuno parziale. Il
   * limite lo fa la transazione col suo lock, non un vincolo del database.
   */
  it('in resi DISTINTI la stessa quota si rimborsa piu` volte', async () => {
    const vendita = await creaDocumento(prisma, tenant, sede, 'store_sale');
    const primo = await creaDocumento(prisma, tenant, sede, 'store_return');
    const secondo = await creaDocumento(prisma, tenant, sede, 'store_return');
    const incasso = await creaQuota(prisma, tenant, vendita, 1, 10_000);

    await creaQuota(prisma, tenant, primo, 1, 3_000, incasso.id);
    await creaQuota(prisma, tenant, secondo, 1, 2_000, incasso.id);

    const uscito = await prisma.storeSalePayment.aggregate({
      where: { refundedFromPaymentId: incasso.id },
      _sum: { amountMinor: true },
    });
    expect(uscito._sum.amountMinor).toBe(5_000);
  });

  /**
   * ⛔ `RESTRICT`, non `SET NULL`: azzerare il riferimento perderebbe in
   * silenzio l_origine del rimborso, e con lei il cumulativo — cioe` proprio
   * il difetto che il collegamento chiude.
   */
  it('la quota di incasso non si cancella finche` un rimborso la restituisce', async () => {
    const vendita = await creaDocumento(prisma, tenant, sede, 'store_sale');
    const reso = await creaDocumento(prisma, tenant, sede, 'store_return');
    const incasso = await creaQuota(prisma, tenant, vendita, 1, 10_000);
    const rimborso = await creaQuota(prisma, tenant, reso, 1, 10_000, incasso.id);

    await expect(
      prisma.$executeRawUnsafe(`DELETE FROM "store_sale_payments" WHERE "id" = $1::uuid`, incasso.id),
    ).rejects.toThrow();

    // Tolto il rimborso, la quota torna cancellabile.
    await prisma.$executeRawUnsafe(
      `DELETE FROM "store_sale_payments" WHERE "id" = $1::uuid`,
      rimborso.id,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM "store_sale_payments" WHERE "id" = $1::uuid`,
      incasso.id,
    );
    expect(
      await prisma.storeSalePayment.count({ where: { id: incasso.id } }),
    ).toBe(0);
  });
});

// ── Aiutanti ───────────────────────────────────────────────────────────────

async function creaTenant(prisma: PrismaClient, n = 1): Promise<string> {
  const [riga] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO "tenants" ("id","name","updated_at")
     VALUES (gen_random_uuid(), $1, CURRENT_TIMESTAMP) RETURNING "id"`,
    `${PREFISSO} ${n}`,
  );
  if (!riga) throw new Error('INSERT senza RETURNING');
  return riga.id;
}

async function creaSede(prisma: PrismaClient, tenantId: string): Promise<string> {
  const [riga] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO "locations" ("id","tenant_id","name","updated_at")
     VALUES (gen_random_uuid(), $1::uuid, $2, CURRENT_TIMESTAMP) RETURNING "id"`,
    tenantId,
    `${PREFISSO} sede`,
  );
  if (!riga) throw new Error('INSERT senza RETURNING');
  return riga.id;
}

async function creaDocumento(
  prisma: PrismaClient,
  tenantId: string,
  locationId: string,
  tipo: 'store_sale' | 'store_return',
): Promise<string> {
  const [riga] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO "documents"
       ("id","tenant_id","location_id","type","status","year","document_date",
        "created_by_name","updated_at")
     VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::"DocumentType",
             'confirmed'::"DocumentStatus", EXTRACT(YEAR FROM CURRENT_DATE)::int,
             CURRENT_DATE, $4, CURRENT_TIMESTAMP)
     RETURNING "id"`,
    tenantId,
    locationId,
    tipo,
    PREFISSO,
  );
  if (!riga) throw new Error('INSERT senza RETURNING');
  return riga.id;
}

async function creaRiga(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string,
  lineNumber: number,
  quantity: number,
  returnedFromLineId: string | null = null,
) {
  return prisma.documentLine.create({
    data: {
      tenantId,
      documentId,
      lineNumber,
      quantity,
      description: `${PREFISSO} riga ${lineNumber}`,
      returnedFromLineId,
    },
  });
}

async function creaQuota(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string,
  position: number,
  amountMinor: number,
  refundedFromPaymentId: string | null = null,
) {
  return prisma.storeSalePayment.create({
    data: {
      tenantId,
      documentId,
      position,
      amountMinor,
      optionNameSnapshot: `${PREFISSO} quota`,
      refundedFromPaymentId,
    },
  });
}

async function pulisci(prisma: PrismaClient): Promise<void> {
  const like = `${PREFISSO}%`;
  const dentro = `"tenant_id" IN (SELECT "id" FROM "tenants" WHERE "name" LIKE $1)`;
  await prisma.$executeRawUnsafe(`DELETE FROM "fiscal_receipts" WHERE ${dentro}`, like);
  // ⚠️ Prima le quote di RIMBORSO: anche la loro self-FK e` RESTRICT.
  await prisma.$executeRawUnsafe(
    `DELETE FROM "store_sale_payments" WHERE ${dentro} AND "refunded_from_payment_id" IS NOT NULL`,
    like,
  );
  await prisma.$executeRawUnsafe(`DELETE FROM "store_sale_payments" WHERE ${dentro}`, like);
  // ⚠️ Prima le righe di RESO, poi le altre: la self-FK e' RESTRICT, e
  //    cancellarle in ordine inverso fallirebbe.
  await prisma.$executeRawUnsafe(
    `DELETE FROM "document_lines" WHERE ${dentro} AND "returned_from_line_id" IS NOT NULL`,
    like,
  );
  await prisma.$executeRawUnsafe(`DELETE FROM "document_lines" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "documents" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "locations" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "tenants" WHERE "name" LIKE $1`, like);
}
