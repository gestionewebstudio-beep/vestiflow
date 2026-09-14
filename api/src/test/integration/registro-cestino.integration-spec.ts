import { ConflictException, NotFoundException } from '@nestjs/common';
import { PlatformAuditActor, type PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PlatformAuditService } from '../../common/audit/platform-audit.service';
import type { AttoreRegistro } from '../../common/audit/platform-audit.types';
import { ProductsService } from '../../products/products.service';
import { ShopifyLinkHistoryService } from '../../shopify/shopify-link-history.service';
import { ambienteIntegrazione } from './env';
import { creaDataset, IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';

/**
 * `PlatformAuditLog` — il registro UNICO delle operazioni, sul database VERO.
 *
 * ⛔ **Le prove del cestino in `products.service.spec.ts` usano un database
 *    SIMULATO**, e non possono dimostrare quello che serve qui: che una
 *    transazione rotoli davvero indietro, che la traccia sopravviva al
 *    ripristino, che i tenant siano isolati. Queste girano sul database di
 *    prova locale, con Prisma vero.
 */
describe('PlatformAuditLog — il registro sul database di prova', () => {
  let prisma: PrismaClient;
  let products: ProductsService;
  let audit: PlatformAuditService;

  const P1 = '95000000-0000-4000-8000-000000000001';
  const P_COLLEGATO = '95000000-0000-4000-8000-000000000002';
  const P_ALTRO_TENANT = '95000000-0000-4000-8000-000000000003';
  const V1 = '96000000-0000-4000-8000-000000000001';

  const utente: AttoreRegistro = {
    tipo: PlatformAuditActor.utente,
    userId: IDS.utenteA1,
    name: 'Mario Rossi',
    email: 'mario@example.test',
  };

  /** Le righe di registro di un'entita`, in ordine di scrittura. */
  async function registro(entityId: string) {
    return prisma.platformAuditLog.findMany({
      where: { entityId },
      orderBy: { createdAt: 'asc' },
      select: {
        correlationId: true,
        outcome: true,
        operation: true,
        tenantId: true,
        actor: true,
        actorUserId: true,
        actorName: true,
        actorEmail: true,
        entityLabel: true,
        remoteGid: true,
        reason: true,
        detail: true,
      },
    });
  }

  beforeAll(() => {
    ambienteIntegrazione();
    prisma = creaClientIntegrazione();
    audit = new PlatformAuditService(prisma as never, prisma as never);
    // ⚠️ Il canale e la tassonomia non servono a queste prove e non vengono
    //    invocati: il cestino non parla con Shopify.
    products = new ProductsService(
      prisma as never,
      { enqueueProductPush: () => undefined } as never,
      { prepareCategories: async () => undefined } as never,
      audit,
      // ⭐ B4 · lo storico Shopify: qui nessun prodotto è collegato, quindi lo
      //    sgancio non trova identità e non fa niente. Serve il servizio vero
      //    perché il cestino deve continuare a funzionare con lui in mezzo.
      new ShopifyLinkHistoryService(),
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await svuota(prisma);
    await creaDataset(prisma);
    // ⛔ Il registro NON ha FK verso `tenants`, quindi il TRUNCATE della
    //    fixture non lo raggiunge: senza questa riga le prove leggerebbero le
    //    righe della prova precedente e sarebbero verdi per il motivo sbagliato.
    await prisma.platformAuditLog.deleteMany({});
    await prisma.$executeRawUnsafe(
      `INSERT INTO products (id, tenant_id, name, article_code, updated_at) VALUES
         ($1::uuid, $3::uuid, 'Articolo locale', 'LOC-1', now()),
         ($2::uuid, $3::uuid, 'Articolo collegato', 'COL-1', now())`,
      P1,
      P_COLLEGATO,
      IDS.tenantA,
    );
    await prisma.$executeRawUnsafe(
      `UPDATE products SET shopify_product_id = 'gid://shopify/Product/700' WHERE id = $1::uuid`,
      P_COLLEGATO,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO products (id, tenant_id, name, article_code, updated_at)
       VALUES ($1::uuid, $2::uuid, 'Articolo altro tenant', 'ALT-1', now())`,
      P_ALTRO_TENANT,
      IDS.tenantB,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO product_variants (id, tenant_id, product_id, sku, selling_price_minor, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'SKU-LOC', 1000, now())`,
      V1,
      IDS.tenantA,
      P1,
    );
  });

  // ── 1 · cestino e ripristino riusciti, con le tracce conservate ───────────

  it('1a · il cestino riuscito lascia tentativo + riuscita, correlati', async () => {
    await products.moveToTrash(IDS.tenantA, P1, utente, 'doppione');

    const righe = await registro(P1);
    expect(righe.map((r) => r.outcome)).toEqual(['tentativo', 'riuscita']);
    // ⭐ La correlazione e` la stessa: senza, sono due fatti scollegati.
    expect(righe[0]!.correlationId).toBe(righe[1]!.correlationId);
    expect(righe[1]!.operation).toBe('cestino_prodotto');
    expect(righe[1]!.actor).toBe('utente');
    expect(righe[1]!.actorName).toBe('Mario Rossi');
    expect(righe[1]!.actorEmail).toBe('mario@example.test');
    expect(righe[1]!.entityLabel).toBe('Articolo locale');
    expect(righe[1]!.reason).toBe('doppione');
    // ⛔ Nessun dettaglio tecnico su un esito positivo: non c'e` niente da spiegare.
    expect(righe[1]!.detail).toBeNull();
  });

  it('1b · la traccia SOPRAVVIVE al ripristino, che azzera le colonne del cestino', async () => {
    await products.moveToTrash(IDS.tenantA, P1, utente, 'doppione');
    await products.restoreFromTrash(IDS.tenantA, P1, utente);

    const prodotto = await prisma.product.findUniqueOrThrow({
      where: { id: P1 },
      select: { deletedAt: true, deletedById: true, deletionReason: true, status: true },
    });
    // Le colonne del cestino sono state azzerate…
    expect(prodotto.deletedAt).toBeNull();
    expect(prodotto.deletedById).toBeNull();
    expect(prodotto.deletionReason).toBeNull();
    expect(prodotto.status).toBe('archived');

    // …e il registro invece porta ancora tutte e quattro le righe.
    const righe = await registro(P1);
    expect(righe.map((r) => r.outcome)).toEqual([
      'tentativo',
      'riuscita',
      'tentativo',
      'riuscita',
    ]);
    expect(righe.map((r) => r.operation)).toEqual([
      'cestino_prodotto',
      'cestino_prodotto',
      'ripristino_prodotto',
      'ripristino_prodotto',
    ]);
    // ⭐ Il MOTIVO dello spostamento resta leggibile dopo il ripristino: e` la
    //    ragione per cui i campi del cestino non bastano come registro.
    expect(righe[1]!.reason).toBe('doppione');
  });

  it('1c · la variante: stesse garanzie, operazioni proprie', async () => {
    await products.moveVariantToTrash(IDS.tenantA, P1, V1, utente);
    await products.restoreVariantFromTrash(IDS.tenantA, P1, V1, utente);

    const righe = await registro(V1);
    expect(righe.map((r) => r.operation)).toEqual([
      'cestino_variante',
      'cestino_variante',
      'ripristino_variante',
      'ripristino_variante',
    ]);
    expect(righe[1]!.entityLabel).toBe('SKU-LOC');
    const variante = await prisma.productVariant.findUniqueOrThrow({
      where: { id: V1 },
      select: { deletedAt: true, lifecycleStatus: true },
    });
    expect(variante.deletedAt).toBeNull();
    expect(variante.lifecycleStatus).toBe('inactive');
  });

  // ── 2 · rifiuto su articolo collegato, senza modifiche ────────────────────

  it('2 · articolo COLLEGATO: rifiutato, registrato, e l articolo non cambia', async () => {
    await expect(
      products.moveToTrash(IDS.tenantA, P_COLLEGATO, utente),
    ).rejects.toBeInstanceOf(ConflictException);

    const righe = await registro(P_COLLEGATO);
    expect(righe.map((r) => r.outcome)).toEqual(['tentativo', 'rifiutata']);
    expect(righe[0]!.correlationId).toBe(righe[1]!.correlationId);
    // ⭐ Il rifiuto dice PERCHE`, e il CHECK del database lo pretende.
    // ⚠️ Frammento senza accenti: due scritture della stessa lettera accentata
    //    possono differire per normalizzazione Unicode, e il confronto
    //    fallirebbe su stringhe identiche a vedersi (misurato l'08/09/2026).
    expect(righe[1]!.detail).toContain('ancora disponibile per gli articoli collegati');
    // ⭐ L'identificativo remoto e` conservato: e` il dato che spiega il rifiuto.
    expect(righe[1]!.remoteGid).toBe('gid://shopify/Product/700');

    // ⛔ L'articolo non e` stato toccato.
    const prodotto = await prisma.product.findUniqueOrThrow({
      where: { id: P_COLLEGATO },
      select: { deletedAt: true, deletedById: true, deletionReason: true },
    });
    expect(prodotto).toEqual({ deletedAt: null, deletedById: null, deletionReason: null });
  });

  // ── 3 · se la RIUSCITA non si scrive, l'operazione si annulla ─────────────

  it('3 · fallita la scrittura dell esito positivo, anche il cestino viene annullato', async () => {
    // ⭐ La scrittura della riuscita fallisce per davvero, sul DATABASE: la
    //    riga viola `…_utente_ha_un_nome` (attore `utente` senza nome). Non un
    //    `throw` finto: si vuole che a rotolare indietro sia PostgreSQL.
    const rotto = new PlatformAuditService(prisma as never, prisma as never);
    rotto.registraRiuscita = async (tx) => {
      await (tx as unknown as PrismaClient).$executeRawUnsafe(
        `INSERT INTO platform_audit_logs (id, correlation_id, tenant_id, actor, operation, outcome)
         VALUES (gen_random_uuid(), gen_random_uuid(), $1::uuid, 'utente', 'cestino_prodotto', 'riuscita')`,
        IDS.tenantA,
      );
    };
    const conRegistroRotto = new ProductsService(
      prisma as never,
      { enqueueProductPush: () => undefined } as never,
      { prepareCategories: async () => undefined } as never,
      rotto,
      new ShopifyLinkHistoryService(),
    );

    await expect(conRegistroRotto.moveToTrash(IDS.tenantA, P1, utente)).rejects.toThrow(
      /platform_audit_logs_utente_ha_un_nome/,
    );

    // ⭐ Il prodotto NON e` nel cestino: la transazione ha rotolato indietro.
    const prodotto = await prisma.product.findUniqueOrThrow({
      where: { id: P1 },
      select: { deletedAt: true },
    });
    expect(prodotto.deletedAt).toBeNull();

    // ⭐ E il registro racconta la cosa giusta: tentativo + fallita.
    const righe = await registro(P1);
    expect(righe.map((r) => r.outcome)).toEqual(['tentativo', 'fallita']);
    expect(righe[1]!.detail).toContain('platform_audit_logs_utente_ha_un_nome');

    // ⛔ La riga di riuscita scritta dentro la transazione NON e` sopravvissuta.
    const riuscite = await prisma.platformAuditLog.count({
      where: { tenantId: IDS.tenantA, outcome: 'riuscita' },
    });
    expect(riuscite).toBe(0);
  });

  // ── 4 · richieste ripetute ────────────────────────────────────────────────

  it('4 · una seconda richiesta non duplica l effetto ne` la traccia', async () => {
    await products.moveToTrash(IDS.tenantA, P1, utente, 'primo motivo');
    const dopoPrima = await prisma.product.findUniqueOrThrow({
      where: { id: P1 },
      select: { deletedAt: true, deletionReason: true },
    });

    await products.moveToTrash(IDS.tenantA, P1, utente, 'secondo motivo');

    const dopoSeconda = await prisma.product.findUniqueOrThrow({
      where: { id: P1 },
      select: { deletedAt: true, deletionReason: true },
    });
    // ⭐ Data e motivo originali intatti.
    expect(dopoSeconda).toEqual(dopoPrima);
    // ⭐ E nessun tentativo orfano: l'idempotenza sta PRIMA della traccia.
    const righe = await registro(P1);
    expect(righe.map((r) => r.outcome)).toEqual(['tentativo', 'riuscita']);
  });

  it('4b · ripristinare due volte non duplica niente', async () => {
    await products.moveToTrash(IDS.tenantA, P1, utente);
    await products.restoreFromTrash(IDS.tenantA, P1, utente);
    await products.restoreFromTrash(IDS.tenantA, P1, utente);

    const righe = await registro(P1);
    expect(righe.filter((r) => r.operation === 'ripristino_prodotto')).toHaveLength(2);
  });

  it('4c · un articolo inesistente non lascia traccia', async () => {
    await expect(
      products.moveToTrash(IDS.tenantA, '95000000-0000-4000-8000-00000000ffff', utente),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(await prisma.platformAuditLog.count()).toBe(0);
  });

  // ── 5 · isolamento fra tenant e protezione delle registrazioni ────────────

  it('5a · un tenant non tocca l articolo di un altro, e non lascia traccia', async () => {
    await expect(
      products.moveToTrash(IDS.tenantA, P_ALTRO_TENANT, utente),
    ).rejects.toBeInstanceOf(NotFoundException);

    const altro = await prisma.product.findUniqueOrThrow({
      where: { id: P_ALTRO_TENANT },
      select: { deletedAt: true },
    });
    expect(altro.deletedAt).toBeNull();
    expect(await prisma.platformAuditLog.count()).toBe(0);
  });

  it('5b · le righe portano il tenant di chi ha agito, e restano separate', async () => {
    await products.moveToTrash(IDS.tenantA, P1, utente);
    await audit.registraTentativo({
      tenantId: IDS.tenantB,
      attore: { tipo: PlatformAuditActor.pull },
      operation: 'cestino_prodotto',
      entityId: P_ALTRO_TENANT,
    });

    const diA = await prisma.platformAuditLog.count({ where: { tenantId: IDS.tenantA } });
    const diB = await prisma.platformAuditLog.count({ where: { tenantId: IDS.tenantB } });
    expect(diA).toBe(2);
    expect(diB).toBe(1);
  });

  it('5c · il registro SOPRAVVIVE alla cancellazione dei dati del tenant', async () => {
    await products.moveToTrash(IDS.tenantA, P1, utente);
    expect(await prisma.platformAuditLog.count()).toBe(2);

    // ⭐ `svuota` tronca `tenants` con CASCADE: il registro non ha FK, quindi
    //    non viene raggiunto. E` la proprieta` per cui non c'e` una relazione.
    await svuota(prisma);

    expect(await prisma.tenant.count()).toBe(0);
    expect(await prisma.platformAuditLog.count()).toBe(2);
    const righe = await registro(P1);
    expect(righe[1]!.tenantId).toBe(IDS.tenantA);
    expect(righe[1]!.actorName).toBe('Mario Rossi');
  });

  it('5d · un PROCESSO non puo` portare un nome: lo vieta il database', async () => {
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO platform_audit_logs (id, correlation_id, tenant_id, actor, actor_name, operation, outcome)
         VALUES (gen_random_uuid(), gen_random_uuid(), $1::uuid, 'webhook', 'Finto Nome', 'cestino_prodotto', 'tentativo')`,
        IDS.tenantA,
      ),
    ).rejects.toThrow(/platform_audit_logs_processo_senza_nome/);
  });

  it('5e · un UTENTE senza nome e` rifiutato, e un esito negativo senza motivo pure', async () => {
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO platform_audit_logs (id, correlation_id, tenant_id, actor, operation, outcome)
         VALUES (gen_random_uuid(), gen_random_uuid(), $1::uuid, 'utente', 'cestino_prodotto', 'tentativo')`,
        IDS.tenantA,
      ),
    ).rejects.toThrow(/platform_audit_logs_utente_ha_un_nome/);

    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO platform_audit_logs (id, correlation_id, tenant_id, actor, operation, outcome)
         VALUES (gen_random_uuid(), gen_random_uuid(), $1::uuid, 'pull', 'cestino_prodotto', 'fallita')`,
        IDS.tenantA,
      ),
    ).rejects.toThrow(/platform_audit_logs_negativo_motivato/);
  });

  it('5f · la RLS e` accesa e i ruoli pubblici non hanno privilegi', async () => {
    const stato = await prisma.$queryRawUnsafe<{ rls: boolean }[]>(
      `SELECT relrowsecurity AS rls FROM pg_class WHERE relname = 'platform_audit_logs'`,
    );
    expect(stato[0]!.rls).toBe(true);

    const privilegi = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM information_schema.role_table_grants
        WHERE table_name = 'platform_audit_logs' AND grantee IN ('anon', 'authenticated', 'PUBLIC')`,
    );
    expect(Number(privilegi[0]!.n)).toBe(0);
  });
});
