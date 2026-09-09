import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuthProfileCacheService } from '../../auth/auth-profile-cache.service';
import { SupabaseService } from '../../auth/supabase.service';
import { PlatformAdminService } from '../../common/platform-admin/platform-admin.service';
import { TenantBackupExportService } from '../../tenant/tenant-backup/tenant-backup-export.service';
import { TenantBackupImportService } from '../../tenant/tenant-backup/tenant-backup-import.service';
import {
  TENANT_BACKUP_STORICO_SHOPIFY,
  TENANT_BACKUP_V3_ENTITY_FILES,
  TENANT_BACKUP_V4_ENTITY_FILES,
} from '../../tenant/tenant-backup/tenant-backup.constants';
import {
  readStreamToBuffer,
  readZipManifest,
  rewriteTenantBackupZip,
} from '../fixtures/tenant-backup.fixture';
import { creaDataset, IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';

/**
 * A1–A3 e A6 — il ripristino da backup convive con lo storico dei collegamenti.
 *
 * ⛔ **Nessuna di queste prove e' SQL isolato.** Export e ripristino passano dai
 *    servizi veri (`TenantBackupExportService`, `TenantBackupImportService`):
 *    e' l'unico modo di verificare che i vincoli differiti, il permesso di riga
 *    e il reinserimento per assenza funzionino DOVE si usano, e non soltanto in
 *    una transazione scritta apposta per farli riuscire.
 *
 * ⚠️ Le sole prove in SQL diretto sono quelle sul PERMESSO (gruppo 4): li' il
 *    bersaglio e' il trigger, e passare dal servizio nasconderebbe cio' che si
 *    vuole vedere.
 */
describe('Ripristino da backup con lo storico dei collegamenti Shopify', () => {
  let prisma: PrismaClient;
  let exporter: TenantBackupExportService;
  let importer: TenantBackupImportService;

  const SHOP = '97000000-0000-4000-8000-000000000001';
  const P_VIVO = '95000000-0000-4000-8000-000000000011';
  const V_VIVO = '96000000-0000-4000-8000-000000000011';
  const P_ESCLUSO = '95000000-0000-4000-8000-000000000012';
  /** Collegato e SENZA varianti: e` l'unico che si puo` togliere da un backup
   *  senza rompere altri riferimenti interni al pacchetto (prova 3c). */
  const P_SOLO = '95000000-0000-4000-8000-000000000013';
  const ID_VIVA = '98000000-0000-4000-8000-000000000001';
  const ID_VARIANTE = '98000000-0000-4000-8000-000000000002';
  const ID_ESCLUSA = '98000000-0000-4000-8000-000000000003';
  const ID_SOLO = '98000000-0000-4000-8000-000000000004';
  const PERIODO = '98000000-0000-4000-8000-000000000011';
  const PERIODO_VARIANTE = '98000000-0000-4000-8000-000000000012';
  const PERIODO_SOLO = '98000000-0000-4000-8000-000000000013';
  const COPPIA = '98000000-0000-4000-8000-000000000021';
  const PERIODO_SEDE = '98000000-0000-4000-8000-000000000022';

  const GID_SHOP = 'gid://shopify/Shop/9900001';
  const GID_PRODOTTO = 'gid://shopify/Product/9900011';
  const GID_VARIANTE = 'gid://shopify/ProductVariant/9900012';
  const GID_INVENTARIO = 'gid://shopify/InventoryItem/9900013';
  const GID_ESCLUSO = 'gid://shopify/Product/9900014';
  const GID_SEDE = 'gid://shopify/Location/9900021';
  const GID_SOLO = 'gid://shopify/Product/9900015';

  beforeAll(() => {
    prisma = creaClientIntegrazione();
    // ⚠️ Nessuno Storage: queste prove non hanno allegati, e il servizio
    //    richiede il client solo quando ce ne sono. Una credenziale finta
    //    tacerebbe un upload dimenticato invece di farlo fallire.
    const config = new ConfigService({ PLATFORM_ADMIN_EMAILS: '' });
    const storage = new SupabaseService(config);
    exporter = new TenantBackupExportService(prisma as never, storage, config);
    importer = new TenantBackupImportService(
      prisma as never,
      storage,
      config,
      new PlatformAdminService(config),
      new AuthProfileCacheService(),
    );
  });

  afterAll(async () => {
    if (prisma) {
      await svuota(prisma);
      await prisma.$disconnect();
    }
  });

  beforeEach(async () => {
    await svuota(prisma);
    await creaDataset(prisma);
    await creaStoricoShopify();
  });

  // ── attrezzi ─────────────────────────────────────────────────────────────

  /**
   * Un tenant con storico REALE: un articolo collegato e vivo, la sua variante,
   * una sede appaiata, e un articolo gia' ESCLUSO — sganciato ed eliminato.
   *
   * ⭐ L'ultimo e' il caso che rende necessario il permesso di riga: la sua
   *    identita' esiste, non punta piu' a niente, e va comunque conservata.
   */
  async function creaStoricoShopify(): Promise<void> {
    await prisma.$executeRawUnsafe(
      `INSERT INTO products (id, tenant_id, name, article_code, updated_at) VALUES
         ($1::uuid, $4::uuid, 'Articolo collegato', 'SH-1', now()),
         ($2::uuid, $4::uuid, 'Articolo escluso', 'SH-2', now()),
         ($3::uuid, $4::uuid, 'Articolo senza varianti', 'SH-3', now())`,
      P_VIVO,
      P_ESCLUSO,
      P_SOLO,
      IDS.tenantA,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO product_variants (id, tenant_id, product_id, sku, selling_price_minor, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'SKU-SH-1', 2500, now())`,
      V_VIVO,
      IDS.tenantA,
      P_VIVO,
    );

    await prisma.shopifyShop.create({
      data: { id: SHOP, tenantId: IDS.tenantA, shopGid: GID_SHOP, myshopifyDomain: 'prova.myshopify.com' },
    });

    await prisma.shopifyProductIdentity.create({
      data: {
        id: ID_VIVA,
        tenantId: IDS.tenantA,
        shopId: SHOP,
        shopifyProductGid: GID_PRODOTTO,
        originalProductId: P_VIVO,
        productId: P_VIVO,
      },
    });
    await prisma.shopifyProductLink.create({
      data: { id: PERIODO, tenantId: IDS.tenantA, identityId: ID_VIVA, originalProductId: P_VIVO },
    });
    await prisma.shopifyVariantIdentity.create({
      data: {
        id: ID_VARIANTE,
        tenantId: IDS.tenantA,
        shopId: SHOP,
        productIdentityId: ID_VIVA,
        shopifyVariantGid: GID_VARIANTE,
        shopifyInventoryItemGid: GID_INVENTARIO,
        originalVariantId: V_VIVO,
        originalProductId: P_VIVO,
        variantId: V_VIVO,
        productId: P_VIVO,
      },
    });
    await prisma.shopifyVariantLink.create({
      data: {
        id: PERIODO_VARIANTE,
        tenantId: IDS.tenantA,
        identityId: ID_VARIANTE,
        originalVariantId: V_VIVO,
        productLinkId: PERIODO,
      },
    });

    await prisma.shopifyLocationPair.create({
      data: {
        id: COPPIA,
        tenantId: IDS.tenantA,
        shopId: SHOP,
        locationId: IDS.locA1,
        shopifyLocationGid: GID_SEDE,
      },
    });
    await prisma.shopifyLocationLink.create({
      data: { id: PERIODO_SEDE, tenantId: IDS.tenantA, pairId: COPPIA },
    });

    // Collegato, vivo, e senza varianti: nessun'altra riga del pacchetto lo
    // nomina, ed e' l'unico che si puo' togliere da un backup senza rompere
    // per primo un riferimento interno al pacchetto stesso (prova 3c).
    await prisma.shopifyProductIdentity.create({
      data: {
        id: ID_SOLO,
        tenantId: IDS.tenantA,
        shopId: SHOP,
        shopifyProductGid: GID_SOLO,
        originalProductId: P_SOLO,
        productId: P_SOLO,
      },
    });
    await prisma.shopifyProductLink.create({
      data: {
        id: PERIODO_SOLO,
        tenantId: IDS.tenantA,
        identityId: ID_SOLO,
        originalProductId: P_SOLO,
      },
    });

    // ── L'articolo ESCLUSO: nasce agganciato, poi viene sganciato ed eliminato ──
    await prisma.shopifyProductIdentity.create({
      data: {
        id: ID_ESCLUSA,
        tenantId: IDS.tenantA,
        shopId: SHOP,
        shopifyProductGid: GID_ESCLUSO,
        originalProductId: P_ESCLUSO,
        productId: P_ESCLUSO,
      },
    });
    await prisma.$executeRawUnsafe(
      `UPDATE shopify_product_identities
          SET product_id = NULL, local_deleted_at = now()
        WHERE id = $1::uuid`,
      ID_ESCLUSA,
    );
    await prisma.$executeRawUnsafe(`DELETE FROM products WHERE id = $1::uuid`, P_ESCLUSO);
  }

  /** Il pacchetto esportato dal servizio VERO. */
  async function esporta(): Promise<Buffer> {
    return readStreamToBuffer((await exporter.createExportStream(IDS.tenantA)).stream);
  }

  /** Lo storico com'e' adesso nel database, riga per riga e ordinato. */
  async function fotografiaStorico(): Promise<Record<string, unknown[]>> {
    const fotografia: Record<string, unknown[]> = {};
    for (const key of TENANT_BACKUP_STORICO_SHOPIFY) {
      const delegato = (prisma as unknown as Record<string, { findMany(args: unknown): Promise<unknown[]> }>)[
        key === 'shopifyShops'
          ? 'shopifyShop'
          : key === 'shopifyProductIdentities'
            ? 'shopifyProductIdentity'
            : key === 'shopifyVariantIdentities'
              ? 'shopifyVariantIdentity'
              : key === 'shopifyProductLinks'
                ? 'shopifyProductLink'
                : key === 'shopifyVariantLinks'
                  ? 'shopifyVariantLink'
                  : key === 'shopifyLocationPairs'
                    ? 'shopifyLocationPair'
                    : 'shopifyLocationLink'
      ]!;
      const righe = await delegato.findMany({ where: { tenantId: IDS.tenantA }, orderBy: { id: 'asc' } });
      // ⚠️ `updatedAt` cambia da se': confrontarlo direbbe «diverso» a ogni
      //    ripristino anche quando non e' cambiato niente di significativo.
      fotografia[key] = righe.map((riga) => {
        const copia = { ...(riga as Record<string, unknown>) };
        delete copia['updatedAt'];
        return copia;
      });
    }
    return fotografia;
  }

  /** Riscrive il pacchetto come se lo avesse prodotto una versione precedente. */
  async function declassaA(archivio: Buffer, versione: 3 | 4): Promise<Buffer> {
    const daTogliere =
      versione === 4
        ? TENANT_BACKUP_STORICO_SHOPIFY.map((key) => `data/${key}.json`)
        : // v3 conosceva molti meno file: si tiene solo cio' che quella lista dichiara.
          null;
    return rewriteTenantBackupZip(archivio, (file) => {
      const manifest = JSON.parse(file.get('manifest.json')!.toString('utf8')) as {
        formatVersion: number;
        entityCounts: Record<string, number>;
      };
      manifest.formatVersion = versione;
      if (daTogliere) {
        for (const percorso of daTogliere) file.delete(percorso);
        for (const key of TENANT_BACKUP_STORICO_SHOPIFY) delete manifest.entityCounts[key];
      } else {
        const tenuti = new Set<string>(TENANT_BACKUP_V3_ENTITY_FILES);
        for (const percorso of [...file.keys()]) {
          const nome = percorso.startsWith('data/') ? percorso.slice(5, -5) : null;
          if (nome && !tenuti.has(nome)) file.delete(percorso);
        }
        // ⚠️ Un v3 non dichiarava i conteggi: il cancello non deve pretenderli.
        manifest.entityCounts = {};
      }
      file.set('manifest.json', Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`));
    });
  }

  // ── 1 · Compatibilita' dei formati ───────────────────────────────────────

  it('1a · l export e` v5 e porta i sette file dello storico, con i conteggi', async () => {
    const manifest = await readZipManifest(await esporta());
    expect(manifest.formatVersion).toBe(5);
    for (const key of TENANT_BACKUP_STORICO_SHOPIFY) {
      expect(manifest.entityCounts[key]).toBeDefined();
    }
    expect(manifest.entityCounts.shopifyShops).toBe(1);
    expect(manifest.entityCounts.shopifyProductIdentities).toBe(3);
    expect(manifest.entityCounts.shopifyVariantIdentities).toBe(1);
    expect(manifest.entityCounts.shopifyProductLinks).toBe(2);
    expect(manifest.entityCounts.shopifyVariantLinks).toBe(1);
    expect(manifest.entityCounts.shopifyLocationPairs).toBe(1);
    expect(manifest.entityCounts.shopifyLocationLinks).toBe(1);
  });

  it('1b · un archivio v4 — senza i sette file NE` i loro conteggi — si ripristina', async () => {
    const v4 = await declassaA(await esporta(), 4);
    const prima = await fotografiaStorico();

    await expect(
      importer.importFromZipBuffer(IDS.tenantA, IDS.utenteA1, v4),
    ).resolves.toBeDefined();

    // ⭐ Lo storico non era nel pacchetto, e non e` andato perduto.
    expect(await fotografiaStorico()).toEqual(prima);
  });

  it('1c · un archivio v3 si ripristina ancora: il minimo non si alza', async () => {
    const v3 = await declassaA(await esporta(), 3);
    await expect(
      importer.importFromZipBuffer(IDS.tenantA, IDS.utenteA1, v3),
    ).resolves.toBeDefined();
  });

  it('1d · export e ripristino v5 su tenant vivo: lo storico resta identico', async () => {
    const archivio = await esporta();
    const prima = await fotografiaStorico();

    await importer.importFromZipBuffer(IDS.tenantA, IDS.utenteA1, archivio);

    expect(await fotografiaStorico()).toEqual(prima);
    // ⭐ E l'anagrafica e` tornata: e` la prova che la purga ha davvero
    //    cancellato e ricreato, invece di non aver fatto niente.
    expect(await prisma.product.count({ where: { id: P_VIVO } })).toBe(1);
  });

  // ── 2 · Recupero e conservazione ─────────────────────────────────────────

  it('2a · RECUPERO SU DATABASE VUOTO: torna anche l identita` gia` esclusa', async () => {
    const archivio = await esporta();
    const prima = await fotografiaStorico();

    // Il database perde tutto: e` il caso del recupero, non del ripristino.
    await svuota(prisma);
    await creaDataset(prisma);
    expect(await prisma.shopifyProductIdentity.count()).toBe(0);

    await importer.importFromZipBuffer(IDS.tenantA, IDS.utenteA1, archivio);

    expect(await fotografiaStorico()).toEqual(prima);
    // ⭐ L'identita` sganciata e` tornata sganciata, con la sua data.
    const esclusa = await prisma.shopifyProductIdentity.findUniqueOrThrow({
      where: { id: ID_ESCLUSA },
    });
    expect(esclusa.productId).toBeNull();
    expect(esclusa.localDeletedAt).not.toBeNull();
    expect(esclusa.shopifyProductGid).toBe(GID_ESCLUSO);
  });

  it('2b · un ESCLUSIONE decisa DOPO il backup non viene sovrascritta', async () => {
    const archivio = await esporta();

    // Dopo il backup l'operatore esclude l'articolo collegato.
    // ⚠️ L'ordine non e` libero, e le FK lo impongono in DUE direzioni: un
    //    periodo attivo esige un'identita` viva, e un'identita` prodotto viva
    //    e` esatta da ogni identita` variante viva. Si chiude prima il periodo,
    //    poi l'identita`; e prima la variante, poi il prodotto.
    await prisma.$executeRawUnsafe(
      `UPDATE shopify_variant_links
          SET status = 'unlinked', closed_at = now(), close_reason = 'local_delete'
        WHERE id = $1::uuid`,
      PERIODO_VARIANTE,
    );
    await prisma.$executeRawUnsafe(
      `UPDATE shopify_variant_identities
          SET variant_id = NULL, product_id = NULL, local_deleted_at = now()
        WHERE id = $1::uuid`,
      ID_VARIANTE,
    );
    await prisma.$executeRawUnsafe(
      `UPDATE shopify_product_links
          SET status = 'unlinked', closed_at = now(), close_reason = 'local_delete'
        WHERE id = $1::uuid`,
      PERIODO,
    );
    await prisma.$executeRawUnsafe(
      `UPDATE shopify_product_identities SET product_id = NULL, local_deleted_at = now()
        WHERE id = $1::uuid`,
      ID_VIVA,
    );

    await importer.importFromZipBuffer(IDS.tenantA, IDS.utenteA1, archivio);

    // ⛔ Il backup diceva «agganciata e attiva». Ha vinto il database.
    const identita = await prisma.shopifyProductIdentity.findUniqueOrThrow({
      where: { id: ID_VIVA },
    });
    expect(identita.productId).toBeNull();
    expect(identita.localDeletedAt).not.toBeNull();
    const periodo = await prisma.shopifyProductLink.findUniqueOrThrow({ where: { id: PERIODO } });
    expect(periodo.status).toBe('unlinked');
    expect(periodo.closeReason).toBe('local_delete');
  });

  it('2c · la purga del ripristino NON tocca lo storico', async () => {
    const archivio = await esporta();
    const identitaPrima = await prisma.shopifyProductIdentity.findUniqueOrThrow({
      where: { id: ID_VIVA },
    });

    await importer.importFromZipBuffer(IDS.tenantA, IDS.utenteA1, archivio);

    const identitaDopo = await prisma.shopifyProductIdentity.findUniqueOrThrow({
      where: { id: ID_VIVA },
    });
    // ⭐ `createdAt` e` quello di PRIMA: la riga non e` stata ricreata, e` la stessa.
    expect(identitaDopo.createdAt.toISOString()).toBe(identitaPrima.createdAt.toISOString());
  });

  // ── 3 · Incongruenze nominate, e i vincoli che restano ───────────────────

  it('3a · stessa riga con GID diverso: rifiutata NOMINANDO il campo, e niente cambia', async () => {
    const guasto = await rewriteTenantBackupZip(await esporta(), (file) => {
      const righe = JSON.parse(
        file.get('data/shopifyProductIdentities.json')!.toString('utf8'),
      ) as Record<string, unknown>[];
      righe.find((riga) => riga['id'] === ID_VIVA)!['shopifyProductGid'] =
        'gid://shopify/Product/9999999';
      file.set('data/shopifyProductIdentities.json', Buffer.from(JSON.stringify(righe)));
    });
    const prima = await fotografiaStorico();
    const prodottiPrima = await prisma.product.count({ where: { tenantId: IDS.tenantA } });

    await expect(importer.importFromZipBuffer(IDS.tenantA, IDS.utenteA1, guasto)).rejects.toThrow(
      /shopifyProductIdentities\.shopifyProductGid/,
    );

    // ⭐ Nessuna modifica parziale: la transazione e` rotolata indietro.
    expect(await fotografiaStorico()).toEqual(prima);
    expect(await prisma.product.count({ where: { tenantId: IDS.tenantA } })).toBe(prodottiPrima);
  });

  it('3b · una riga NUOVA che rivendica un GID gia` preso: rifiutata nominando il GID', async () => {
    const guasto = await rewriteTenantBackupZip(await esporta(), (file) => {
      const righe = JSON.parse(
        file.get('data/shopifyProductIdentities.json')!.toString('utf8'),
      ) as Record<string, unknown>[];
      const clone = { ...righe.find((riga) => riga['id'] === ID_VIVA)! };
      clone['id'] = '98000000-0000-4000-8000-0000000000ff';
      righe.push(clone);
      file.set('data/shopifyProductIdentities.json', Buffer.from(JSON.stringify(righe)));
      const manifest = JSON.parse(file.get('manifest.json')!.toString('utf8')) as {
        entityCounts: Record<string, number>;
      };
      manifest.entityCounts['shopifyProductIdentities'] = righe.length;
      file.set('manifest.json', Buffer.from(JSON.stringify(manifest)));
    });

    await expect(importer.importFromZipBuffer(IDS.tenantA, IDS.utenteA1, guasto)).rejects.toThrow(
      new RegExp(GID_PRODOTTO.replace(/\//g, '\\/')),
    );
  });

  it('3c · un articolo ancora collegato ASSENTE dal backup: rifiutato, e nominato', async () => {
    // ⭐ Il pacchetto e` un **v4**, e non e` un dettaglio: se contenesse anche
    //    lo storico, a rifiutarlo sarebbe la validazione dei riferimenti INTERNI
    //    al backup, che gia` esisteva. Il caso che solo il pre-controllo nuovo
    //    puo` prendere e` questo: lo storico vive nel DATABASE, l'anagrafica a
    //    cui punta manca nel pacchetto, e nel pacchetto non c'e` niente che li
    //    metta in relazione.
    const guasto = await rewriteTenantBackupZip(await declassaA(await esporta(), 4), (file) => {
      const righe = JSON.parse(file.get('data/products.json')!.toString('utf8')) as Record<
        string,
        unknown
      >[];
      const restanti = righe.filter((riga) => riga['id'] !== P_SOLO);
      file.set('data/products.json', Buffer.from(JSON.stringify(restanti)));
      const manifest = JSON.parse(file.get('manifest.json')!.toString('utf8')) as {
        entityCounts: Record<string, number>;
      };
      manifest.entityCounts['products'] = restanti.length;
      file.set('manifest.json', Buffer.from(JSON.stringify(manifest)));
    });

    await expect(importer.importFromZipBuffer(IDS.tenantA, IDS.utenteA1, guasto)).rejects.toThrow(
      new RegExp(P_SOLO),
    );
  });

  it('3d · il pre-controllo NON sostituisce i vincoli: la cancellazione RIESCE, e a rifiutare e` il COMMIT', async () => {
    // ⛔ **Questa prova e` stata riscritta l'08/09/2026, perche` passava per il
    //    motivo sbagliato.** Prima accettava un errore di chiave esterna
    //    QUALUNQUE (`/…_fkey|foreign key/i`) e non guardava se la cancellazione
    //    fosse riuscita: rimessa la FK a `ON DELETE RESTRICT` — cioe` tolto
    //    esattamente cio` che doveva dimostrare — restava VERDE. Misurato.
    //
    // ⭐ Le due variabili qui sotto sono la correzione: restano al loro valore
    //    iniziale se il rifiuto arriva PRIMA della fine del corpo, che e` quel
    //    che fa un vincolo immediato.
    const VINCOLO = 'shopify_product_identities_product_id_tenant_id_fkey';
    let prodottiDentroLaTransazione: number | null = null;
    let corpoConcluso = false;

    await expect(
      prisma.$transaction(async (tx) => {
        // ⚠️ Si differisce SOLO il vincolo atteso, non tutti e quattro:
        //    differirli in blocco renderebbe la prova incapace di dire QUALE
        //    ha rifiutato, che e` metà di quello che deve dimostrare.
        await tx.$executeRawUnsafe(`SET CONSTRAINTS "${VINCOLO}" DEFERRED`);
        // ⭐ `P_SOLO` non ha varianti: una sola cancellazione, e nessun'altra
        //    FK in mezzo che possa rifiutare al posto di quella in esame.
        await tx.$executeRawUnsafe(`DELETE FROM products WHERE id = $1::uuid`, P_SOLO);
        const righe = await (tx as unknown as PrismaClient).$queryRawUnsafe<{ n: number }[]>(
          `SELECT count(*)::int AS n FROM products WHERE id = $1::uuid`,
          P_SOLO,
        );
        prodottiDentroLaTransazione = righe[0]!.n;
        corpoConcluso = true;
      }),
    ).rejects.toThrow(new RegExp(VINCOLO));

    // ⭐ La cancellazione E` RIUSCITA dentro la transazione: e` la finestra che
    //    il differimento apre, e che un vincolo immediato non aprirebbe mai.
    expect(prodottiDentroLaTransazione).toBe(0);
    // ⭐ E il corpo e` arrivato in fondo: il rifiuto e` del COMMIT, non di una
    //    delle istruzioni.
    expect(corpoConcluso).toBe(true);

    // ⛔ E il vincolo ha fatto il proprio mestiere: l'articolo e` ancora li`.
    expect(await prisma.product.count({ where: { id: P_SOLO } })).toBe(1);
    expect(
      await prisma.shopifyProductIdentity.count({ where: { id: ID_SOLO, productId: P_SOLO } }),
    ).toBe(1);
  });

  // ── 4 · Il permesso di riga e` limitato ──────────────────────────────────

  const IDENTITA_SGANCIATA = `
    INSERT INTO shopify_product_identities
      (id, tenant_id, shop_id, shopify_product_gid, original_product_id, product_id, local_deleted_at, updated_at)
    VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3, $4::uuid, NULL, now(), now())`;

  it('4a · SENZA permesso, un identita` sganciata non nasce', async () => {
    await expect(
      prisma.$executeRawUnsafe(
        IDENTITA_SGANCIATA,
        IDS.tenantA,
        SHOP,
        'gid://shopify/Product/9900901',
        P_VIVO,
      ),
    ).rejects.toThrow(/nasce_agganciata/);
  });

  it('4b · permesso acceso su un ALTRO tenant: rifiutata lo stesso', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `SELECT set_config('vestiflow.ripristino_tenant', $1, true)`,
          IDS.tenantB,
        );
        await tx.$executeRawUnsafe(
          IDENTITA_SGANCIATA,
          IDS.tenantA,
          SHOP,
          'gid://shopify/Product/9900902',
          P_VIVO,
        );
      }),
    ).rejects.toThrow(/nasce_agganciata/);
  });

  it('4c · permesso acceso e riga VIVA: il permesso non copre le righe non chiuse', async () => {
    // ⚠️ Il permesso vale solo per uno storico gia` chiuso: una riga senza
    //    `local_deleted_at` resta rifiutata anche a permesso acceso. Lo vieta
    //    comunque il CHECK `stato_coerente`, ed e` giusto che siano due.
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `SELECT set_config('vestiflow.ripristino_tenant', $1, true)`,
          IDS.tenantA,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO shopify_product_identities
             (id, tenant_id, shop_id, shopify_product_gid, original_product_id, product_id, local_deleted_at, updated_at)
           VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3, $4::uuid, NULL, NULL, now())`,
          IDS.tenantA,
          SHOP,
          'gid://shopify/Product/9900903',
          P_VIVO,
        );
      }),
    ).rejects.toThrow(/nasce_agganciata|stato_coerente/);
  });

  it('4d · col permesso GIUSTO riesce, e dopo il COMMIT il permesso non c e` piu`', async () => {
    const gid = 'gid://shopify/Product/9900904';
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('vestiflow.ripristino_tenant', $1, true)`,
        IDS.tenantA,
      );
      await tx.$executeRawUnsafe(IDENTITA_SGANCIATA, IDS.tenantA, SHOP, gid, P_VIVO);
    });
    expect(await prisma.shopifyProductIdentity.count({ where: { shopifyProductGid: gid } })).toBe(1);

    // ⛔ Fuori dalla transazione il permesso e` finito con lei.
    await expect(
      prisma.$executeRawUnsafe(
        IDENTITA_SGANCIATA,
        IDS.tenantA,
        SHOP,
        'gid://shopify/Product/9900905',
        P_VIVO,
      ),
    ).rejects.toThrow(/nasce_agganciata/);
  });

  it('4e · dopo un ROLLBACK il permesso non sopravvive, e la riga nemmeno', async () => {
    const gid = 'gid://shopify/Product/9900906';
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `SELECT set_config('vestiflow.ripristino_tenant', $1, true)`,
          IDS.tenantA,
        );
        await tx.$executeRawUnsafe(IDENTITA_SGANCIATA, IDS.tenantA, SHOP, gid, P_VIVO);
        throw new Error('rollback voluto');
      }),
    ).rejects.toThrow(/rollback voluto/);

    expect(await prisma.shopifyProductIdentity.count({ where: { shopifyProductGid: gid } })).toBe(0);
  });

  it('4f · una connessione RIUSATA dal pool non si porta dietro il permesso', async () => {
    // Si accende il permesso, si legge il backend che lo ha eseguito, e poi si
    // torna finche` non si ricade sulla STESSA connessione fisica.
    let pidUsato = 0;
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('vestiflow.ripristino_tenant', $1, true)`,
        IDS.tenantA,
      );
      const righe = await (tx as unknown as PrismaClient).$queryRawUnsafe<{ pid: number }[]>(
        'SELECT pg_backend_pid() AS pid',
      );
      pidUsato = righe[0]!.pid;
    });

    let ricaduto = false;
    for (let tentativo = 0; tentativo < 40 && !ricaduto; tentativo += 1) {
      const righe = await prisma.$queryRawUnsafe<{ pid: number; permesso: string | null }[]>(
        `SELECT pg_backend_pid() AS pid, current_setting('vestiflow.ripristino_tenant', true) AS permesso`,
      );
      // ⛔ Su QUALUNQUE connessione il permesso deve risultare spento.
      expect(righe[0]!.permesso ?? '').toBe('');
      if (righe[0]!.pid === pidUsato) ricaduto = true;
    }
    // ⚠️ Se non si ricade mai sulla stessa connessione la prova non ha
    //    verificato quello che dichiara, e deve dirlo invece di passare.
    expect(ricaduto).toBe(true);
  });

  // ── 5 · Ripetizione, e chi Shopify non ce l ha ───────────────────────────

  it('5a · ripristinare DUE volte non duplica lo storico', async () => {
    const archivio = await esporta();
    const prima = await fotografiaStorico();

    await importer.importFromZipBuffer(IDS.tenantA, IDS.utenteA1, archivio);
    await importer.importFromZipBuffer(IDS.tenantA, IDS.utenteA1, archivio);

    // ⭐ Confronto riga per riga, non dei soli conteggi: un doppione con un id
    //    diverso passerebbe un conteggio uguale se qualcosa fosse sparito.
    expect(await fotografiaStorico()).toEqual(prima);
  });

  it('5b · un tenant SENZA Shopify: export e ripristino invariati', async () => {
    // Il tenant B non ha ne` negozio ne` identita`.
    const utenteB = randomUUID();
    await prisma.user.create({
      data: {
        id: utenteB,
        tenantId: IDS.tenantB,
        // ⚠️ `authUserId` serve davvero: senza, l'import non riconosce che la
        //    riga del backup e` quella di chi sta ripristinando, prova a
        //    ricrearla e sbatte sul proprio id. E` come sono fatti gli utenti
        //    veri, non un aggiustamento per far passare la prova.
        authUserId: randomUUID(),
        email: `b-${utenteB}@example.test`,
        displayName: 'Titolare B',
        role: 'owner',
      },
    });
    const archivio = await readStreamToBuffer(
      (await exporter.createExportStream(IDS.tenantB)).stream,
    );
    const manifest = await readZipManifest(archivio);
    for (const key of TENANT_BACKUP_STORICO_SHOPIFY) {
      expect(manifest.entityCounts[key]).toBe(0);
    }

    await expect(
      importer.importFromZipBuffer(IDS.tenantB, utenteB, archivio),
    ).resolves.toBeDefined();
    expect(await prisma.shopifyProductIdentity.count({ where: { tenantId: IDS.tenantB } })).toBe(0);
    // ⭐ E lo storico del tenant A non e` stato sfiorato.
    expect(await prisma.shopifyProductIdentity.count({ where: { tenantId: IDS.tenantA } })).toBe(3);
  });

  it('5c · la lista dei file attesi da un v4 non contiene lo storico, quella di oggi si`', () => {
    for (const key of TENANT_BACKUP_STORICO_SHOPIFY) {
      expect(TENANT_BACKUP_V4_ENTITY_FILES).not.toContain(key);
    }
    expect(TENANT_BACKUP_V4_ENTITY_FILES).toContain('products');
  });
});
