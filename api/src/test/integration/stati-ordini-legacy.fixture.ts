import type { PrismaClient } from '@prisma/client';

import { ambienteIntegrazione } from './env';

/**
 * Le fixture LEGACY per il collaudo della migration degli stati commerciali.
 *
 * ⭐ **Scritte in SQL grezzo, e non è pigrizia.** Devono esistere sullo schema
 *    PRE-migration, dove la colonna `commercial_state` non c'è ancora e il
 *    client Prisma generato non la conosce. Il SQL grezzo attraversa la
 *    migration senza bisogno di rigenerare niente — che è anche la ragione per
 *    cui il collaudo non richiede `prisma generate` a metà strada.
 *
 * ⛔ Non usano il seed generale: descrivono l'esatta configurazione che il
 *    backfill deve tradurre, caso per caso.
 */

export const LEGACY = {
  tenant: '0c000000-0000-4000-8000-00000000000c',
  supplier: '0c100000-0000-4000-8000-0000000000c1',
  documentAttivo: '5a000000-0000-4000-8000-000000000d01',
  documentAnnullato: '5a000000-0000-4000-8000-000000000d02',

  // ── i sette casi, uno per riga attesa del backfill ──
  /** manuale normale → confirmed */
  ordNormale: '6a000000-0000-4000-8000-00000000e001',
  /** cancelledAt valorizzato → cancelled */
  ordAnnullato: '6a000000-0000-4000-8000-00000000e002',
  /** fulfilledAt + collegamento ATTIVO → concluded */
  ordConcluso: '6a000000-0000-4000-8000-00000000e003',
  /** partially_fulfilled + collegamento ATTIVO → concluded */
  ordParziale: '6a000000-0000-4000-8000-00000000e004',
  /** ⭐ fulfilledAt ma collegamento ASSENTE → confirmed (il residuo misurato) */
  ordResiduo: '6a000000-0000-4000-8000-00000000e005',
  /** ⚠️ collegamento a documento ANNULLATO → confirmed (il link non è attivo) */
  ordLinkAnnullato: '6a000000-0000-4000-8000-00000000e006',
  /** Shopify → commercialState NULL, campi canale intatti */
  ordShopify: '6a000000-0000-4000-8000-00000000e007',
  /** Vendita al banco: altro canale, stessa attesa */
  ordBanco: '6a000000-0000-4000-8000-00000000e008',

  fornConfermato: '7a000000-0000-4000-8000-00000000f001',
  fornConcluso: '7a000000-0000-4000-8000-00000000f002',
  fornAnnullato: '7a000000-0000-4000-8000-00000000f003',
} as const;

/** Ciò che il backfill deve produrre. La verifica confronta contro questa mappa. */
export const ATTESO: Readonly<Record<string, string | null>> = {
  [LEGACY.ordNormale]: 'confirmed',
  [LEGACY.ordAnnullato]: 'cancelled',
  [LEGACY.ordConcluso]: 'concluded',
  [LEGACY.ordParziale]: 'concluded',
  [LEGACY.ordResiduo]: 'confirmed',
  [LEGACY.ordLinkAnnullato]: 'confirmed',
  [LEGACY.ordShopify]: null,
  [LEGACY.ordBanco]: null,
};

/** Stato atteso degli ordini fornitore: invariato, nessuno diventa to_confirm. */
export const ATTESO_FORNITORE: Readonly<Record<string, string>> = {
  [LEGACY.fornConfermato]: 'confirmed',
  [LEGACY.fornConcluso]: 'concluded',
  [LEGACY.fornAnnullato]: 'cancelled',
};

function assertBersaglio(): void {
  const ambiente = ambienteIntegrazione();
  if (ambiente.host !== 'localhost:5433' || ambiente.database !== 'vestiflow_test') {
    throw new Error(`⛔ rifiutato: ${ambiente.host}/${ambiente.database} non è il database di prova.`);
  }
}

/**
 * Fotografa lo stato PRE-migration in tabelle che la migration non tocca.
 *
 * ⭐ **Lo snapshot vive nel database, non in un file**: sopravvive fra le due
 *    esecuzioni del collaudo, sta dove stanno i dati, e non lascia artefatti nel
 *    repository da ignorare o ripulire.
 *
 * ⛔ Serve a dimostrare «IDENTICI», non «uguali a ciò che mi aspettavo». Un
 *    confronto contro attese ri-derivate proverebbe solo che so scrivere due
 *    volte la stessa regola.
 */
export async function salvaSnapshot(prisma: PrismaClient): Promise<void> {
  assertBersaglio();

  await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "_collaudo_snapshot"');
  await prisma.$executeRawUnsafe(
    `CREATE TABLE "_collaudo_snapshot" AS
     SELECT id, source::text AS source, fulfillment_status::text AS fulfillment_status,
            financial_status::text AS financial_status, fulfilled_at, cancelled_at, document_id
     FROM "sales_orders"`,
  );

  await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "_collaudo_snapshot_fornitore"');
  await prisma.$executeRawUnsafe(
    `CREATE TABLE "_collaudo_snapshot_fornitore" AS
     SELECT id, status::text AS status FROM "supplier_orders"`,
  );

  await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "_collaudo_conteggi"');
  await prisma.$executeRawUnsafe(
    `CREATE TABLE "_collaudo_conteggi" AS
       SELECT 'stock_reservations'::text AS tabella, count(*) AS n FROM "stock_reservations"
       UNION ALL SELECT 'stock_movements', count(*) FROM "stock_movements"
       UNION ALL SELECT 'inventory_levels', count(*) FROM "inventory_levels"`,
  );

  await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "_collaudo_giacenze"');
  await prisma.$executeRawUnsafe(
    `CREATE TABLE "_collaudo_giacenze" AS
     SELECT coalesce(sum(on_hand), 0) AS on_hand, coalesce(sum(committed), 0) AS committed
     FROM "inventory_levels"`,
  );
}

/** Azzera e ricrea le fixture legacy. Idempotente. */
export async function creaLegacy(prisma: PrismaClient): Promise<void> {
  // ⛔ La barriera si ri-verifica prima del TRUNCATE, non solo all'avvio.
  assertBersaglio();

  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "sales_orders", "supplier_orders", "documents", "suppliers", ' +
      '"parties", "locations", "tenants" RESTART IDENTITY CASCADE',
  );

  await prisma.$executeRawUnsafe(
    `INSERT INTO "tenants" ("id","name","created_at","updated_at")
     VALUES ('${LEGACY.tenant}','Tenant collaudo stati',now(),now())`,
  );

  // Due documenti: uno attivo, uno annullato. È il secondo a dimostrare che
  // «collegato» non basta — deve essere collegato a qualcosa di NON annullato.
  for (const [id, stato] of [
    [LEGACY.documentAttivo, 'confirmed'],
    [LEGACY.documentAnnullato, 'cancelled'],
  ] as const) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "documents" ("id","tenant_id","type","status","year","document_date","created_by_name","created_at","updated_at")
       VALUES ('${id}','${LEGACY.tenant}','sales_ddt','${stato}',2026,'2026-08-01','Collaudo',now(),now())`,
    );
  }

  const ordine = (
    id: string,
    source: string,
    campi: {
      cancelledAt?: string;
      fulfilledAt?: string;
      fulfillment?: string;
      documentId?: string;
    },
  ): string =>
    `INSERT INTO "sales_orders"
       ("id","tenant_id","order_number","customer_name","placed_at","source",
        "fulfillment_status","cancelled_at","fulfilled_at","document_id","created_at","updated_at")
     VALUES ('${id}','${LEGACY.tenant}','ORD-${id.slice(-4)}','Cliente collaudo',
        '2026-08-01','${source}','${campi.fulfillment ?? 'unfulfilled'}',
        ${campi.cancelledAt ? `'${campi.cancelledAt}'` : 'NULL'},
        ${campi.fulfilledAt ? `'${campi.fulfilledAt}'` : 'NULL'},
        ${campi.documentId ? `'${campi.documentId}'` : 'NULL'}, now(), now())`;

  const istruzioni = [
    ordine(LEGACY.ordNormale, 'manual', {}),
    ordine(LEGACY.ordAnnullato, 'manual', { cancelledAt: '2026-08-02' }),
    ordine(LEGACY.ordConcluso, 'manual', {
      fulfilledAt: '2026-08-03',
      fulfillment: 'fulfilled',
      documentId: LEGACY.documentAttivo,
    }),
    ordine(LEGACY.ordParziale, 'manual', {
      fulfillment: 'partially_fulfilled',
      documentId: LEGACY.documentAttivo,
    }),
    // ⭐ Il residuo misurato: evaso secondo l'etichetta, senza collegamento.
    ordine(LEGACY.ordResiduo, 'manual', {
      fulfilledAt: '2026-08-04',
      fulfillment: 'fulfilled',
    }),
    // ⚠️ Collegato, ma a un documento annullato: il legame non è attivo.
    ordine(LEGACY.ordLinkAnnullato, 'manual', {
      fulfilledAt: '2026-08-05',
      fulfillment: 'fulfilled',
      documentId: LEGACY.documentAnnullato,
    }),
    ordine(LEGACY.ordShopify, 'shopify_online', {
      fulfilledAt: '2026-08-06',
      fulfillment: 'fulfilled',
    }),
    ordine(LEGACY.ordBanco, 'store', { fulfillment: 'partially_fulfilled' }),
  ];
  for (const sql of istruzioni) {
    await prisma.$executeRawUnsafe(sql);
  }

  // ── Ordini fornitore nei tre stati ──
  // ⚠️ `parties` non ha `kind` né `display_name`: il nome sta in `company_name`.
  //    Verificato sullo schema del container, non dedotto.
  await prisma.$executeRawUnsafe(
    `INSERT INTO "parties" ("id","tenant_id","company_name","created_at","updated_at")
     VALUES ('${LEGACY.supplier}','${LEGACY.tenant}','Fornitore collaudo',now(),now())`,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "suppliers" ("id","tenant_id","party_id","created_at","updated_at")
     VALUES ('${LEGACY.supplier}','${LEGACY.tenant}','${LEGACY.supplier}',now(),now())`,
  );
  for (const [id, stato] of [
    [LEGACY.fornConfermato, 'confirmed'],
    [LEGACY.fornConcluso, 'concluded'],
    [LEGACY.fornAnnullato, 'cancelled'],
  ] as const) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "supplier_orders"
         ("id","tenant_id","reference","supplier_id","supplier_name","status","created_at","updated_at")
       VALUES ('${id}','${LEGACY.tenant}','OF-${id.slice(-4)}','${LEGACY.supplier}',
               'Fornitore collaudo','${stato}',now(),now())`,
    );
  }
}
