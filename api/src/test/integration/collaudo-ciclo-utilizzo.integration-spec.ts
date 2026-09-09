import { ConfigService } from '@nestjs/config';
import {
  DocumentStatus,
  DocumentType,
  PlatformAuditActor,
  UserRole,
  type PrismaClient,
} from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AdminTenantsService } from '../../admin/admin-tenants.service';
import { AuthProfileCacheService } from '../../auth/auth-profile-cache.service';
import { SupabaseService } from '../../auth/supabase.service';
import { PlatformAuditService } from '../../common/audit/platform-audit.service';
import type { AttoreRegistro } from '../../common/audit/platform-audit.types';
import { PlatformAdminService } from '../../common/platform-admin/platform-admin.service';
import { ProductsService } from '../../products/products.service';
import { ShopifyLinkHistoryService } from '../../shopify/shopify-link-history.service';
import { shopifyDecimalToMinor } from '../../shopify/shopify-money.util';
import { ShopifyProductPullService } from '../../shopify/shopify-product-pull.service';
import { ShopifyProductPushService } from '../../shopify/shopify-product-push.service';
import { TenantBackupExportService } from '../../tenant/tenant-backup/tenant-backup-export.service';
import { TenantBackupImportService } from '../../tenant/tenant-backup/tenant-backup-import.service';
import {
  AZIENDE_CICLO,
  catalogoLocale,
  catalogoRemoto,
  type ArticoloLocale,
  type DimensioneCollaudo,
} from '../fixtures/collaudo-ciclo-utilizzo.dataset';
import { readStreamToBuffer } from '../fixtures/tenant-backup.fixture';
import { ambienteIntegrazione } from './env';
import { creaDataset, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';
import { NegozioSimulato, type SpecProdottoRemoto } from './shopify-simulato.util';

/**
 * Campagna del CICLO DI UTILIZZO — scenario M del piano di collaudo.
 *
 * ⭐ **Servizi applicativi veri, PostgreSQL vero, Shopify simulato con stato.** Tre
 *    aziende: Alfa e Beta collegate a due negozi simulati distinti, Gamma senza
 *    Shopify ma con catalogo e documenti. Dentro ogni scenario i dati si conservano
 *    fra un passaggio e l'altro: non si azzera il database dopo ogni passo.
 *
 * ⭐ **Ogni scenario gira DUE volte dalla stessa situazione iniziale**, e i due esiti
 *    devono coincidere. È la ripetibilità del piano (§1), e va tenuta distinta
 *    dall'idempotenza di una richiesta ripetuta sugli stessi dati — che S1 e S2
 *    provano DENTRO l'esecuzione (reimportazione, ripetizione del push).
 *
 * ⛔ **Gli attesi sono quelli della matrice canonica (`docs/24` §9.2) e delle regole
 *    approvate**, e non si ammorbidiscono per far passare il comportamento attuale: un
 *    rosso qui è un risultato. Il caso D5 (barcode duplicato in arrivo) sta in una
 *    prova a sé proprio per questo.
 *
 * ⚠️ **Le misure (durata, chiamate simulate) descrivono la PROVA**, non Shopify né la
 *    produzione: 50 e 500 sono dimensioni di prova, non soglie.
 */
describe('Collaudo del ciclo di utilizzo — tre aziende, due negozi simulati (scenario M)', () => {
  let prisma: PrismaClient;

  interface Misura {
    readonly scenario: string;
    readonly esecuzione: number;
    readonly durataMs: number;
    readonly completate: number;
    readonly scartate: number;
    readonly fallite: number;
    readonly chiamate: number;
  }
  const misure: Misura[] = [];
  const esitiStampabili: string[] = [];

  beforeAll(() => {
    ambienteIntegrazione();
    prisma = creaClientIntegrazione();
  });

  afterAll(async () => {
    if (prisma) {
      await svuota(prisma);
      await prisma.$disconnect();
    }
    // ⭐ Le misure e gli esiti, in forma da rapporto: si copiano nel documento, non si
    //    deducono.
    const righe = misure.map(
      (m) =>
        `| ${m.scenario} | ${m.esecuzione} | ${m.durataMs} | ${m.completate} | ${m.scartate} | ${m.fallite} | ${m.chiamate} |`,
    );
    console.log(
      ['| scenario | esecuzione | durata ms | completate | scartate | fallite | chiamate simulate |', '| --- | --- | --- | --- | --- | --- | --- |', ...righe].join('\n'),
    );
    console.log(['ESITI PER SCENARIO', ...esitiStampabili].join('\n'));
  });

  // ── impianto ─────────────────────────────────────────────────────────────

  interface Azienda {
    readonly id: string;
    readonly negozio: NegozioSimulato | null;
    readonly pull: ShopifyProductPullService | null;
    readonly push: ShopifyProductPushService | null;
    readonly products: ProductsService;
    /** Le chiamate ricevute dalla facciata del canale (finta): un'operazione locale le annota, e non deve fare altro. */
    readonly facciata: string[];
  }

  let alfa: Azienda;
  let beta: Azienda;
  let gamma: Azienda;
  let storico: ShopifyLinkHistoryService;
  let audit: PlatformAuditService;
  let exporter: TenantBackupExportService;
  let importer: TenantBackupImportService;
  let admin: AdminTenantsService;

  const operatore = (utente: string): AttoreRegistro => ({
    tipo: PlatformAuditActor.utente,
    userId: utente,
    name: 'Operatore di collaudo',
    email: 'collaudo@vestiflow.test',
  });

  function creaProducts(facciata: string[], conStorico: ShopifyLinkHistoryService): ProductsService {
    return new ProductsService(
      prisma as never,
      {
        enqueueProductPush: (t: string, p: string) => facciata.push(`enqueueProductPush ${t} ${p}`),
        enqueueInventoryPush: () => facciata.push('enqueueInventoryPush'),
        pushInventoryLevels: async () => facciata.push('pushInventoryLevels'),
        pushProductNow: async () => {
          facciata.push('pushProductNow');
          return { pushed: false, reason: 'not_connected' };
        },
        archiveProductOnSyncDisabled: async () => {
          facciata.push('archiveProductOnSyncDisabled');
          return { pushed: false, reason: 'not_linked' };
        },
        invalidateProfile: () => undefined,
      } as never,
      {
        prepareProductLocalization: async () => undefined,
        localizeProductForResponseSync: (riga: unknown) => riga,
      } as never,
      audit,
      conStorico,
    );
  }

  function creaPull(negozio: NegozioSimulato, conStorico: unknown = storico): ShopifyProductPullService {
    return new ShopifyProductPullService(
      prisma as never,
      negozio.oauth() as never,
      { requestedScopes: ['read_products', 'write_products'] } as never,
      negozio.admin() as never,
      {
        healStaleErrorStatus: vi.fn(),
        touchSync: vi.fn(),
        recordApiFailure: vi.fn(),
        markSynced: vi.fn(),
        markError: vi.fn(),
      } as never,
      negozio.enrichment() as never,
      conStorico as never,
      // §10.3 · il registro vero: S6 ne legge le righe di rifiuto.
      audit,
    );
  }

  function creaPush(negozio: NegozioSimulato): ShopifyProductPushService {
    return new ShopifyProductPushService(
      prisma as never,
      negozio.oauth() as never,
      negozio.admin() as never,
      { markSynced: vi.fn(), markError: vi.fn(), touchSync: vi.fn() } as never,
      { resolveCategoryId: vi.fn().mockResolvedValue(null) } as never,
      { buildMetafields: vi.fn().mockResolvedValue([]) } as never,
      negozio.graphql() as never,
      storico as never,
      audit,
    );
  }

  async function creaAzienda(
    dati: { readonly id: string; readonly nome: string; readonly utente: string; readonly sede: string },
    profilo: 'gestionale' | null,
  ): Promise<void> {
    await prisma.tenant.create({
      data: { id: dati.id, name: dati.nome, ...(profilo ? { channelProfile: profilo } : {}) },
    });
    await prisma.location.create({
      data: { id: dati.sede, tenantId: dati.id, name: `${dati.nome} — sede`, licensedInVf: true },
    });
    await prisma.user.create({
      data: {
        id: dati.utente,
        tenantId: dati.id,
        authUserId: dati.utente.replace(/^c1/, 'a1'),
        email: `${dati.nome.split(' ')[1]!.toLowerCase()}@collaudo.test`,
        displayName: `Utente ${dati.nome}`,
        role: UserRole.clerk,
        isActive: true,
        hasAllLocationsAccess: true,
        permissions: ['section.products', 'products.manage'],
      },
    });
  }

  async function collegaNegozio(
    dati: { readonly id: string; readonly dominio: string; readonly shopGid: string },
  ): Promise<void> {
    const negozio = await prisma.shopifyShop.create({
      data: { tenantId: dati.id, shopGid: dati.shopGid, myshopifyDomain: dati.dominio },
    });
    await prisma.shopifyConnection.create({
      data: {
        tenantId: dati.id,
        status: 'connected',
        shopDomain: dati.dominio,
        shopId: negozio.id,
        scopes: ['read_products', 'write_products'],
      },
    });
    await prisma.shopifyCredential.create({
      data: {
        tenantId: dati.id,
        shopDomain: dati.dominio,
        accessTokenEnc: 'cifrato',
        scopes: ['read_products', 'write_products'],
      },
    });
  }

  /**
   * La situazione iniziale, IDENTICA a ogni esecuzione: tre aziende, due negozi
   * simulati appena nati (stessi id di partenza), Gamma col suo catalogo e un documento.
   */
  async function situazioneIniziale(): Promise<void> {
    await svuota(prisma);
    await creaDataset(prisma);
    await prisma.platformAuditLog.deleteMany({});

    storico = new ShopifyLinkHistoryService();
    audit = new PlatformAuditService(prisma as never, prisma as never);
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
    admin = new AdminTenantsService(
      prisma as never,
      storage,
      new PlatformAdminService(config),
      config,
      {} as never,
      {} as never,
      new AuthProfileCacheService(),
      audit,
    );

    await creaAzienda(AZIENDE_CICLO.alfa, null);
    await creaAzienda(AZIENDE_CICLO.beta, null);
    await creaAzienda(AZIENDE_CICLO.gamma, 'gestionale');
    await collegaNegozio(AZIENDE_CICLO.alfa);
    await collegaNegozio(AZIENDE_CICLO.beta);

    const negozioAlfa = new NegozioSimulato(AZIENDE_CICLO.alfa.dominio, AZIENDE_CICLO.alfa.primoId);
    const negozioBeta = new NegozioSimulato(AZIENDE_CICLO.beta.dominio, AZIENDE_CICLO.beta.primoId);
    const facciataAlfa: string[] = [];
    const facciataBeta: string[] = [];
    const facciataGamma: string[] = [];
    alfa = {
      id: AZIENDE_CICLO.alfa.id,
      negozio: negozioAlfa,
      pull: creaPull(negozioAlfa),
      push: creaPush(negozioAlfa),
      products: creaProducts(facciataAlfa, storico),
      facciata: facciataAlfa,
    };
    beta = {
      id: AZIENDE_CICLO.beta.id,
      negozio: negozioBeta,
      pull: creaPull(negozioBeta),
      push: creaPush(negozioBeta),
      products: creaProducts(facciataBeta, storico),
      facciata: facciataBeta,
    };
    gamma = {
      id: AZIENDE_CICLO.gamma.id,
      negozio: null,
      pull: null,
      push: null,
      products: creaProducts(facciataGamma, storico),
      facciata: facciataGamma,
    };

    // Gamma: catalogo e un documento. Un tenant vuoto non distingue «funziona senza
    // Shopify» da «non fa niente».
    for (const articolo of catalogoLocale(5, 'CG')) {
      await gamma.products.create(gamma.id, dtoDa(articolo) as never);
    }
    await prisma.document.create({
      data: {
        id: AZIENDE_CICLO.gamma.documento,
        tenantId: gamma.id,
        locationId: AZIENDE_CICLO.gamma.sede,
        type: DocumentType.invoice,
        status: DocumentStatus.draft,
        year: 2026,
        number: 1,
        documentDate: new Date('2026-09-01'),
        createdByName: 'Collaudo',
      },
    });
  }

  /** Il DTO di creazione dal dataset: la forma che il form manda all'API. */
  function dtoDa(articolo: ArticoloLocale) {
    return {
      name: articolo.name,
      articleCode: articolo.articleCode,
      brand: articolo.brand,
      category: articolo.category,
      tags: [...articolo.tags],
      status: 'active',
      shopifySyncEnabled: true,
      sellingPrice: { amountMinor: articolo.variants[0]!.sellingPriceMinor, currency: 'EUR' },
      options: articolo.options.map((o) => ({ name: o.name, values: [...o.values] })),
      variants: articolo.variants.map((v) => ({
        ...(v.sku ? { sku: v.sku } : {}),
        ...(v.barcode ? { barcode: v.barcode } : {}),
        optionValues: v.optionValues.map((o) => ({ name: o.name, value: o.value })),
        sellingPrice: { amountMinor: v.sellingPriceMinor, currency: 'EUR' },
      })),
    };
  }

  // ── fotografie e confronti ───────────────────────────────────────────────

  /**
   * Lo stato di UN tenant, senza uuid né date: prodotti, varianti, identità, periodi.
   * È ciò che si confronta fra le due esecuzioni e fra prima/dopo un'operazione.
   */
  async function fotografiaTenant(tenantId: string) {
    const prodotti = await prisma.product.findMany({
      where: { tenantId },
      orderBy: { articleCode: 'asc' },
      include: { variants: { orderBy: { sku: 'asc' } } },
    });
    const identitaProdotto = await prisma.shopifyProductIdentity.findMany({
      where: { tenantId },
      orderBy: { shopifyProductGid: 'asc' },
      include: { periodi: { orderBy: { linkedAt: 'asc' } } },
    });
    const identitaVariante = await prisma.shopifyVariantIdentity.findMany({
      where: { tenantId },
      orderBy: { shopifyVariantGid: 'asc' },
      include: { periodi: { orderBy: { linkedAt: 'asc' } } },
    });
    const perId = new Map(prodotti.map((p) => [p.id, p.articleCode]));
    return {
      prodotti: prodotti.map((p) => ({
        codice: p.articleCode,
        nome: p.name,
        titoloShopify: p.shopifyTitle,
        marca: p.brand,
        categoria: p.category,
        tag: [...p.tags].sort(),
        stato: p.status,
        remoto: p.shopifyProductId,
        sync: p.shopifySyncStatus,
        errore: p.shopifyLastError,
        origine: p.catalogOrigin,
        cestino: p.deletedAt !== null,
        varianti: p.variants.map((v) => ({
          sku: v.sku,
          barcode: v.barcode,
          remota: v.shopifyVariantId,
          inventario: v.shopifyInventoryItemId,
          prezzoShopify: Number(v.shopifyPriceMinor),
          prezzo: Number(v.sellingPriceMinor),
          cestino: v.deletedAt !== null,
        })),
      })),
      identitaProdotto: identitaProdotto.map((i) => ({
        gid: i.shopifyProductGid,
        articolo: i.productId ? (perId.get(i.productId) ?? '?') : null,
        eliminata: i.localDeletedAt !== null,
        periodi: i.periodi.map((l) => ({ stato: l.status, motivo: l.closeReason })),
      })),
      identitaVariante: identitaVariante.map((i) => ({
        gid: i.shopifyVariantGid,
        agganciata: i.variantId !== null,
        eliminata: i.localDeletedAt !== null,
        periodi: i.periodi.map((l) => ({ stato: l.status, motivo: l.closeReason })),
      })),
      documenti: await prisma.document.count({ where: { tenantId } }),
      movimenti: await prisma.stockMovement.count({ where: { tenantId } }),
    };
  }

  /** Gli identificativi remoti che compaiono su PIÙ righe locali del tenant: deve essere vuoto. */
  async function doppioniRemoti(tenantId: string): Promise<string[]> {
    const righe = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT shopify_product_id AS id FROM products
        WHERE tenant_id = $1::uuid AND shopify_product_id IS NOT NULL
        GROUP BY shopify_product_id HAVING count(*) > 1
       UNION ALL
       SELECT shopify_variant_id AS id FROM product_variants
        WHERE tenant_id = $1::uuid AND shopify_variant_id IS NOT NULL
        GROUP BY shopify_variant_id HAVING count(*) > 1`,
      tenantId,
    );
    return righe.map((r) => r.id);
  }

  /**
   * Confronta lo stato LOCALE di un prodotto importato con quello REMOTO, campo per
   * campo, secondo la matrice §9.2: titolo Shopify, vendor→brand, product_type→categoria,
   * tag, e per ogni variante barcode, prezzo Shopify e identificativi.
   *
   * ⚠️ Lo SKU segue la regola dell'import: uguale se libero, altrimenti con suffisso
   *    `-<id remoto>` o `SHOPIFY-<id remoto>` se assente (`resolveImportSku`).
   */
  async function confrontaImportato(tenantId: string, negozio: NegozioSimulato, remotoId: number) {
    const remoto = negozio.prodotto(remotoId);
    const locale = await prisma.product.findFirstOrThrow({
      where: { tenantId, shopifyProductId: String(remotoId) },
      include: { variants: true },
    });
    expect(locale.shopifyTitle).toBe(remoto.title);
    expect(locale.brand).toBe(remoto.vendor);
    expect(locale.category).toBe(remoto.product_type);
    expect([...locale.tags].sort()).toEqual(
      remoto.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .sort(),
    );
    expect(locale.variants).toHaveLength(remoto.variants.length);
    for (const varianteRemota of remoto.variants) {
      const variante = locale.variants.find((v) => v.shopifyVariantId === String(varianteRemota.id));
      expect(variante, `variante remota ${varianteRemota.id} assente in locale`).toBeDefined();
      expect(variante!.barcode).toBe(varianteRemota.barcode);
      expect(Number(variante!.shopifyPriceMinor)).toBe(shopifyDecimalToMinor(varianteRemota.price));
      expect(variante!.shopifyInventoryItemId).toBe(String(varianteRemota.inventory_item_id));
      if (varianteRemota.sku) {
        expect([varianteRemota.sku, `${varianteRemota.sku}-${varianteRemota.id}`]).toContain(variante!.sku);
      } else {
        expect(variante!.sku).toBe(`SHOPIFY-${varianteRemota.id}`);
      }
    }
    // Lo storico: un'identità viva per il prodotto e per ogni variante abbinata.
    const identita = await prisma.shopifyProductIdentity.findFirstOrThrow({
      where: { tenantId, shopifyProductGid: `gid://shopify/Product/${remotoId}` },
      include: { periodi: true },
    });
    expect(identita.productId).toBe(locale.id);
    expect(identita.periodi.filter((l) => l.status === 'active')).toHaveLength(1);
    return locale;
  }

  /** Confronta un prodotto PUBBLICATO con la sua copia remota, sui campi che il push manda. */
  async function confrontaPubblicato(tenantId: string, negozio: NegozioSimulato, productId: string) {
    const locale = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
      include: { variants: { orderBy: { sku: 'asc' } } },
    });
    expect(locale.shopifyProductId).not.toBeNull();
    const remoto = negozio.prodotto(Number(locale.shopifyProductId));
    expect(remoto.title).toBe(locale.shopifyTitle ?? locale.name);
    expect(remoto.vendor).toBe(locale.brand);
    expect(remoto.product_type).toBe(locale.category);
    expect(
      remoto.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .sort(),
    ).toEqual([...locale.tags].sort());
    for (const variante of locale.variants) {
      if (!variante.sku) {
        // ⚠️ Comportamento di OGGI, dichiarato nel codice e non dalla matrice: una
        //    variante senza SKU non è abbinabile al risultato della creazione e resta
        //    scollegata finché non riceve uno SKU.
        expect(variante.shopifyVariantId).toBeNull();
        continue;
      }
      expect(variante.shopifyVariantId, `variante ${variante.sku} non collegata`).not.toBeNull();
      const remota = remoto.variants.find((v) => v.id === Number(variante.shopifyVariantId));
      expect(remota, `variante remota di ${variante.sku} assente`).toBeDefined();
      expect(remota!.sku).toBe(variante.sku);
      expect(remota!.barcode).toBe(variante.barcode);
      expect(shopifyDecimalToMinor(remota!.price)).toBe(Number(variante.shopifyPriceMinor));
    }
    return { locale, remoto };
  }

  /** Esegue lo scenario DUE volte dalla stessa situazione iniziale e pretende lo stesso esito. */
  async function dueEsecuzioni<T>(
    nome: string,
    corpo: (esecuzione: number) => Promise<{ esito: T; completate: number; scartate: number; fallite: number }>,
  ): Promise<void> {
    const esiti: T[] = [];
    for (const esecuzione of [1, 2]) {
      await situazioneIniziale();
      const inizio = Date.now();
      const risultato = await corpo(esecuzione);
      misure.push({
        scenario: nome,
        esecuzione,
        durataMs: Date.now() - inizio,
        completate: risultato.completate,
        scartate: risultato.scartate,
        fallite: risultato.fallite,
        chiamate: (alfa.negozio?.totaleChiamate() ?? 0) + (beta.negozio?.totaleChiamate() ?? 0),
      });
      esiti.push(risultato.esito);
      // ⭐ L'esito, in chiaro, stampato in coda con le misure: il rapporto lo
      //    riporta, non lo deduce. (Un `console.log` dentro la prova non arriva
      //    a video in questa configurazione; quello di `afterAll` sì.)
      esitiStampabili.push(`${nome} · esecuzione ${esecuzione} → ${JSON.stringify(risultato.esito)}`);
    }
    // ⭐ Ripetibilità: la seconda esecuzione dà lo stesso esito della prima.
    expect(esiti[1]).toEqual(esiti[0]);
  }

  /** L'isolamento: Beta e Gamma come alla situazione iniziale, prima di un'azione su Alfa. */
  async function fotografieAltrui() {
    return { beta: await fotografiaTenant(beta.id), gamma: await fotografiaTenant(gamma.id) };
  }

  const remotoPiccolo = (): SpecProdottoRemoto[] => catalogoRemoto(5).slice(0, 4);

  // ── S1 · importazione → reimportazione → modifica consentita → nuovo import ─

  for (const dimensione of [5, 50, 500] as DimensioneCollaudo[]) {
    it(
      `S1/${dimensione} · importazione, reimportazione, modifica consentita, nuovo import`,
      async () => {
        await dueEsecuzioni(`S1/${dimensione}`, async () => {
          const altrui = await fotografieAltrui();
          const negozio = alfa.negozio!;
          const seminati = catalogoRemoto(dimensione).map((spec) => negozio.semina(spec));
          const d5 = dimensione === 5 ? seminati[4]! : seminati[16]!;

          // 1 · importazione
          const primo = await alfa.pull!.pullCatalog(alfa.id);
          expect(primo.remoteProductCount).toBe(dimensione);
          expect(primo.skipped).toBe(0);
          expect(primo.imported + primo.failed.length).toBe(dimensione);
          // ⚠️ Il solo fallimento AMMESSO qui è il caso D5, che ha la sua prova a sé:
          //    qualunque altro prodotto fallito è un difetto.
          expect(primo.failed.map((f) => f.shopifyProductId).filter((id) => id !== String(d5.id))).toEqual([]);
          for (const p of seminati) {
            if (p.id === d5.id && primo.failed.some((f) => f.shopifyProductId === String(d5.id))) continue;
            await confrontaImportato(alfa.id, negozio, p.id);
          }
          expect(await doppioniRemoti(alfa.id)).toEqual([]);
          const dopoPrimo = await fotografiaTenant(alfa.id);

          // 2 · reimportazione: idempotente sugli stessi dati
          const secondo = await alfa.pull!.pullCatalog(alfa.id);
          expect(secondo.updated).toBe(primo.imported);
          expect(secondo.imported).toBe(0);
          expect(secondo.failed.map((f) => f.shopifyProductId)).toEqual(primo.failed.map((f) => f.shopifyProductId));
          const dopoSecondo = await fotografiaTenant(alfa.id);
          expect(dopoSecondo.identitaProdotto).toEqual(dopoPrimo.identitaProdotto);
          expect(dopoSecondo.identitaVariante).toEqual(dopoPrimo.identitaVariante);
          expect(dopoSecondo.prodotti.map((p) => p.codice)).toEqual(dopoPrimo.prodotti.map((p) => p.codice));
          expect(await doppioniRemoti(alfa.id)).toEqual([]);

          // 3 · modifica consentita: il NOME INTERNO in VestiFlow (solo VestiFlow), il
          //     TITOLO e un BARCODE su Shopify (bidirezionali)
          const p1 = await prisma.product.findFirstOrThrow({
            where: { tenantId: alfa.id, shopifyProductId: String(seminati[0]!.id) },
          });
          await alfa.products.update(alfa.id, p1.id, { name: 'Nome interno cambiato' } as never);
          const secondoRemoto = seminati[1]!;
          negozio.modifica(secondoRemoto.id, {
            title: 'Titolo remoto cambiato',
            variante: { id: secondoRemoto.variants[0]!.id, barcode: '8009999999991' },
          });

          // 4 · nuovo import: webhook sul modificato, poi il lotto intero
          expect(await alfa.pull!.importProductFromWebhook(alfa.id, negozio.webhook(secondoRemoto.id))).toBe('updated');
          const terzo = await alfa.pull!.pullCatalog(alfa.id);
          expect(terzo.updated).toBe(primo.imported);

          const p1Dopo = await prisma.product.findUniqueOrThrow({ where: { id: p1.id } });
          // ⭐ Matrice §9.2: `Product.name` è SOLO VestiFlow — l'import non lo tocca.
          expect(p1Dopo.name).toBe('Nome interno cambiato');
          expect(p1Dopo.shopifyTitle).toBe(seminati[0]!.title);
          const p2Dopo = await confrontaImportato(alfa.id, negozio, secondoRemoto.id);
          // ⭐ Titolo Shopify e barcode: bidirezionali, arrivati.
          expect(p2Dopo.shopifyTitle).toBe('Titolo remoto cambiato');
          expect(p2Dopo.variants.find((v) => v.shopifyVariantId === String(secondoRemoto.variants[0]!.id))!.barcode).toBe('8009999999991');
          expect(await doppioniRemoti(alfa.id)).toEqual([]);

          // isolamento
          expect(await fotografieAltrui()).toEqual(altrui);
          expect(beta.negozio!.totaleChiamate()).toBe(0);

          const finale = await fotografiaTenant(alfa.id);
          return {
            esito: {
              importati: primo.imported,
              falliti: primo.failed.map((f) => f.shopifyProductId),
              d5: primo.failed.find((f) => f.shopifyProductId === String(d5.id))?.message.slice(0, 60) ?? 'importato',
              prodotti: finale.prodotti.length,
              varianti: finale.prodotti.reduce((n, p) => n + p.varianti.length, 0),
              identita: finale.identitaProdotto.length,
              identitaVarianti: finale.identitaVariante.length,
            },
            completate: primo.imported + secondo.updated + terzo.updated + 1,
            scartate: primo.skipped + secondo.skipped + terzo.skipped,
            fallite: primo.failed.length + secondo.failed.length + terzo.failed.length,
          };
        });
      },
      900_000,
    );
  }

  // ── D5 · barcode duplicato in arrivo: l'atteso del piano, in una prova a sé ─

  it('D5 · un barcode DUPLICATO in arrivo da Shopify non rompe l import (atteso del piano)', async () => {
    await dueEsecuzioni('D5', async () => {
      const negozio = alfa.negozio!;
      const [quarto, quinto] = catalogoRemoto(5).slice(3, 5);
      negozio.semina(quarto!);
      const remotoD5 = negozio.semina(quinto!);
      const esito = await alfa.pull!.pullCatalog(alfa.id);
      // ⛔ `regole-gestionale`, clausola di realtà, e piano D5: importato e SEGNALATO,
      //    non rifiutato. Se questa riga è rossa, il risultato è «fallito» — e resta tale.
      expect(esito.failed).toEqual([]);
      expect(await prisma.product.count({ where: { tenantId: alfa.id, shopifyProductId: String(remotoD5.id) } })).toBe(1);
      return { esito: { importati: esito.imported, falliti: esito.failed.length }, completate: esito.imported, scartate: 0, fallite: esito.failed.length };
    });
  }, 120_000);

  // ── S2 · pubblicazione esplicita → aggiornamento → ripetizione ───────────

  for (const dimensione of [5, 50, 500] as DimensioneCollaudo[]) {
    it(
      `S2/${dimensione} · pubblicazione esplicita, aggiornamento, ripetizione — locale e remoto a confronto`,
      async () => {
        await dueEsecuzioni(`S2/${dimensione}`, async () => {
          const altrui = await fotografieAltrui();
          const negozio = alfa.negozio!;
          const creati: string[] = [];
          for (const articolo of catalogoLocale(dimensione)) {
            const creato = await alfa.products.create(alfa.id, dtoDa(articolo) as never);
            creati.push(creato.id);
          }

          // 1 · pubblicazione esplicita di ogni articolo
          let pubblicati = 0;
          let falliti = 0;
          for (const id of creati) {
            const esito = await alfa.push!.pushProduct(alfa.id, id);
            if (esito.pushed) pubblicati += 1;
            else falliti += 1;
          }
          expect(falliti).toBe(0);
          for (const id of creati) {
            await confrontaPubblicato(alfa.id, negozio, id);
          }
          expect(negozio.prodotti.size).toBe(dimensione);
          expect(await doppioniRemoti(alfa.id)).toEqual([]);
          const dopoPrimo = await fotografiaTenant(alfa.id);
          expect(dopoPrimo.identitaProdotto).toHaveLength(dimensione);

          // 2 · aggiornamento locale (titolo Shopify e prezzo Shopify) → nuovo push
          const primoId = creati[0]!;
          const primo = await prisma.product.findUniqueOrThrow({ where: { id: primoId }, include: { variants: true } });
          await alfa.products.update(alfa.id, primoId, {
            shopifyTitle: 'Titolo vetrina aggiornato',
            variants: primo.variants.map((v) => ({
              id: v.id,
              ...(v.sku ? { sku: v.sku } : {}),
              barcode: v.barcode ?? undefined,
              sellingPrice: { amountMinor: Number(v.sellingPriceMinor), currency: 'EUR' },
              shopifyPrice: { amountMinor: Number(v.shopifyPriceMinor) + 100, currency: 'EUR' },
            })),
          } as never);
          const aggiornamento = await alfa.push!.pushProduct(alfa.id, primoId);
          expect(aggiornamento.pushed).toBe(true);
          const { remoto } = await confrontaPubblicato(alfa.id, negozio, primoId);
          expect(remoto.title).toBe('Titolo vetrina aggiornato');
          const primoDopo = await prisma.product.findUniqueOrThrow({ where: { id: primoId }, include: { variants: true } });
          for (const v of primoDopo.variants) {
            if (v.shopifyVariantId) {
              expect(Number(v.shopifyPriceMinor)).toBe(Number(primo.variants.find((x) => x.id === v.id)!.shopifyPriceMinor) + 100);
            }
          }

          // 3 · ripetizione senza modifiche: nessuna duplicazione, remoto invariato
          const remotoPrima = negozio.prodotto(remoto.id);
          const ripetizione = await alfa.push!.pushProduct(alfa.id, primoId);
          expect(ripetizione.pushed).toBe(true);
          expect(negozio.prodotto(remoto.id)).toEqual(remotoPrima);
          expect(negozio.prodotti.size).toBe(dimensione);
          const finale = await fotografiaTenant(alfa.id);
          expect(finale.identitaProdotto).toEqual(dopoPrimo.identitaProdotto);
          expect(finale.identitaVariante).toEqual(dopoPrimo.identitaVariante);
          expect(await doppioniRemoti(alfa.id)).toEqual([]);

          expect(await fotografieAltrui()).toEqual(altrui);
          expect(beta.negozio!.totaleChiamate()).toBe(0);

          return {
            esito: {
              pubblicati,
              remoti: negozio.prodotti.size,
              identita: finale.identitaProdotto.length,
              identitaVarianti: finale.identitaVariante.length,
              scollegateSenzaSku: finale.prodotti.reduce((n, p) => n + p.varianti.filter((v) => v.sku === null && v.remota === null).length, 0),
            },
            completate: pubblicati + 2,
            scartate: 0,
            fallite: falliti,
          };
        });
      },
      900_000,
    );
  }

  // ── S3 · eventi duplicati e richieste concorrenti ────────────────────────

  it('S3 · webhook duplicato, richieste identiche concorrenti, modifiche valide diverse concorrenti', async () => {
    await dueEsecuzioni('S3', async () => {
      const altrui = await fotografieAltrui();
      const negozio = alfa.negozio!;
      const [specP, specQ, specR] = remotoPiccolo();
      const P = negozio.semina(specP!);
      const Q = negozio.semina(specQ!);
      const R = negozio.semina(specR!);

      // a · lo STESSO webhook due volte, in sequenza: un solo effetto
      expect(await alfa.pull!.importProductFromWebhook(alfa.id, negozio.webhook(P.id))).toBe('imported');
      expect(await alfa.pull!.importProductFromWebhook(alfa.id, negozio.webhook(P.id))).toBe('updated');
      await confrontaImportato(alfa.id, negozio, P.id);

      // b · richieste IDENTICHE concorrenti su un prodotto nuovo
      const identiche = await Promise.allSettled([
        alfa.pull!.importProductFromWebhook(alfa.id, negozio.webhook(Q.id)),
        alfa.pull!.importProductFromWebhook(alfa.id, negozio.webhook(Q.id)),
      ]);
      expect(identiche.map((e) => e.status)).toEqual(['fulfilled', 'fulfilled']);
      expect(identiche.map((e) => (e as PromiseFulfilledResult<string>).value).sort()).toEqual(['imported', 'updated']);
      await confrontaImportato(alfa.id, negozio, Q.id);
      expect(await prisma.product.count({ where: { tenantId: alfa.id, shopifyProductId: String(Q.id) } })).toBe(1);

      // c · modifiche VALIDE DIVERSE concorrenti sullo stesso prodotto: nessuno stato misto
      await alfa.pull!.importProductFromWebhook(alfa.id, negozio.webhook(R.id));
      const eventoA = { ...negozio.webhook(R.id), title: 'Titolo A' } as Record<string, unknown>;
      (eventoA['variants'] as Record<string, unknown>[])[0]!['barcode'] = '8001111111111';
      const eventoB = { ...negozio.webhook(R.id), title: 'Titolo B' } as Record<string, unknown>;
      (eventoB['variants'] as Record<string, unknown>[])[0]!['barcode'] = '8002222222222';
      const diverse = await Promise.allSettled([
        alfa.pull!.importProductFromWebhook(alfa.id, eventoA),
        alfa.pull!.importProductFromWebhook(alfa.id, eventoB),
      ]);
      expect(diverse.map((e) => e.status)).toEqual(['fulfilled', 'fulfilled']);
      const rDopo = await prisma.product.findFirstOrThrow({
        where: { tenantId: alfa.id, shopifyProductId: String(R.id) },
        include: { variants: true },
      });
      const prima = rDopo.variants.find((v) => v.shopifyVariantId === String(R.variants[0]!.id))!;
      // ⭐ I due campi vengono dallo STESSO evento: chi ha scritto per ultimo ha scritto tutto.
      expect([
        ['Titolo A', '8001111111111'],
        ['Titolo B', '8002222222222'],
      ]).toContainEqual([rDopo.shopifyTitle, prima.barcode]);
      expect(await prisma.product.count({ where: { tenantId: alfa.id, shopifyProductId: String(R.id) } })).toBe(1);
      expect(await doppioniRemoti(alfa.id)).toEqual([]);

      const finale = await fotografiaTenant(alfa.id);
      expect(finale.identitaProdotto).toHaveLength(3);
      expect(finale.identitaProdotto.every((i) => i.periodi.length === 1)).toBe(true);
      expect(await fotografieAltrui()).toEqual(altrui);
      return {
        esito: {
          prodotti: finale.prodotti.length,
          identita: finale.identitaProdotto.length,
          identitaVarianti: finale.identitaVariante.length,
          esitiIdentiche: identiche.map((e) => (e as PromiseFulfilledResult<string>).value).sort(),
        },
        completate: 7,
        scartate: 0,
        fallite: 0,
      };
    });
  }, 120_000);

  // ── S4 · eliminazione consentita di una variante → import e webhook ──────

  it('S4 · una variante eliminata dal percorso applicativo NON ricompare ai webhook e agli import successivi', async () => {
    await dueEsecuzioni('S4', async () => {
      const altrui = await fotografieAltrui();
      const negozio = alfa.negozio!;
      // Un prodotto a TRE varianti: il secondo del catalogo piccolo (la prima variante
      // è senza SKU, ed è proprio quella che si elimina).
      const P = negozio.semina(remotoPiccolo()[1]!);
      expect(await alfa.pull!.importProductFromWebhook(alfa.id, negozio.webhook(P.id))).toBe('imported');
      const prodotto = await prisma.product.findFirstOrThrow({
        where: { tenantId: alfa.id, shopifyProductId: String(P.id) },
        include: { variants: true },
      });
      expect(prodotto.variants).toHaveLength(3);
      const daEliminare = prodotto.variants.find((v) => v.shopifyVariantId === String(P.variants[0]!.id))!;

      // 1 · eliminazione consentita: il salvataggio del prodotto SENZA quella variante
      await alfa.products.update(alfa.id, prodotto.id, {
        name: prodotto.name,
        variants: prodotto.variants
          .filter((v) => v.id !== daEliminare.id)
          .map((v) => ({ id: v.id, sku: v.sku, barcode: v.barcode ?? undefined, sellingPrice: { amountMinor: Number(v.sellingPriceMinor), currency: 'EUR' } })),
      } as never);
      expect(await prisma.productVariant.count({ where: { id: daEliminare.id } })).toBe(0);
      const identitaEliminata = await prisma.shopifyVariantIdentity.findFirstOrThrow({
        where: { shopifyVariantGid: `gid://shopify/ProductVariant/${P.variants[0]!.id}` },
        include: { periodi: true },
      });
      expect(identitaEliminata.variantId).toBeNull();
      expect(identitaEliminata.localDeletedAt).not.toBeNull();
      expect(identitaEliminata.periodi.map((l) => [l.status, l.closeReason])).toEqual([['unlinked', 'local_delete']]);

      // 2 · Shopify continua a mandarla, con una modifica valida su un'altra variante
      negozio.modifica(P.id, { variante: { id: P.variants[1]!.id, barcode: '8003333333333' } });
      expect(await alfa.pull!.importProductFromWebhook(alfa.id, negozio.webhook(P.id))).toBe('updated');
      const lotto = await alfa.pull!.pullCatalog(alfa.id);
      expect(lotto.updated).toBe(1);
      expect(lotto.failed).toEqual([]);

      const dopo = await prisma.product.findUniqueOrThrow({ where: { id: prodotto.id }, include: { variants: true } });
      // ⛔ Non è tornata, e le altre si aggiornano come sempre.
      expect(dopo.variants).toHaveLength(2);
      expect(dopo.variants.some((v) => v.shopifyVariantId === String(P.variants[0]!.id))).toBe(false);
      expect(dopo.variants.find((v) => v.shopifyVariantId === String(P.variants[1]!.id))!.barcode).toBe('8003333333333');
      const identitaDopo = await prisma.shopifyVariantIdentity.findUniqueOrThrow({
        where: { id: identitaEliminata.id },
        include: { periodi: true },
      });
      expect(identitaDopo.periodi).toHaveLength(1);
      expect(identitaDopo.localDeletedAt).not.toBeNull();
      expect(await doppioniRemoti(alfa.id)).toEqual([]);
      expect(await fotografieAltrui()).toEqual(altrui);

      const finale = await fotografiaTenant(alfa.id);
      return {
        esito: { varianti: dopo.variants.length, identitaVarianti: finale.identitaVariante.length, eliminate: finale.identitaVariante.filter((i) => i.eliminata).length },
        completate: 3,
        scartate: 0,
        fallite: 0,
      };
    });
  }, 120_000);

  // ── S5 · collegamento chiuso → eventi successivi: nessuna riapertura ─────

  it('S5 · un collegamento CHIUSO con anagrafica viva non si riapre ai webhook successivi', async () => {
    await dueEsecuzioni('S5', async () => {
      const altrui = await fotografieAltrui();
      const negozio = alfa.negozio!;
      const P = negozio.semina(remotoPiccolo()[0]!);
      // ⚠️ Il titolo PRIMA della modifica remota: `P` è l'oggetto vivo del simulatore.
      const titoloOriginale = P.title;
      expect(await alfa.pull!.importProductFromWebhook(alfa.id, negozio.webhook(P.id))).toBe('imported');
      const prodotto = await prisma.product.findFirstOrThrow({ where: { tenantId: alfa.id, shopifyProductId: String(P.id) } });

      // ⚠️ SITUAZIONE COSTRUITA, come in B5a: oggi nessun percorso applicativo chiude un
      //    collegamento senza eliminare l'anagrafica (E2/E6 del piano non sono
      //    verificabili). Si chiudono i periodi — figlie prima — e si azzera la cache.
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `UPDATE shopify_variant_links SET status = 'unlinked', close_reason = 'local_delete', closed_at = GREATEST(now(), linked_at) WHERE tenant_id = $1::uuid AND status = 'active'`,
          alfa.id,
        );
        await tx.$executeRawUnsafe(
          `UPDATE shopify_product_links SET status = 'unlinked', close_reason = 'local_delete', closed_at = GREATEST(now(), linked_at) WHERE tenant_id = $1::uuid AND status = 'active'`,
          alfa.id,
        );
        await tx.productVariant.updateMany({ where: { productId: prodotto.id }, data: { shopifyVariantId: null, shopifyInventoryItemId: null } });
        await tx.product.update({ where: { id: prodotto.id }, data: { shopifyProductId: null } });
      });
      const chiuso = await fotografiaTenant(alfa.id);

      // Eventi successivi: un webhook con titolo nuovo, e il lotto intero.
      negozio.modifica(P.id, { title: 'Titolo dopo la chiusura' });
      const webhook = await alfa.pull!.importProductFromWebhook(alfa.id, negozio.webhook(P.id));
      const lotto = await alfa.pull!.pullCatalog(alfa.id);

      const dopo = await fotografiaTenant(alfa.id);
      // ⛔ Nessuna riapertura: i periodi restano quelli, chiusi, e nessuno nuovo.
      expect(dopo.identitaProdotto).toEqual(chiuso.identitaProdotto);
      expect(dopo.identitaVariante).toEqual(chiuso.identitaVariante);
      // ⛔ E nessun doppione: l'anagrafica resta una, non torna collegata da sola, e il
      //    webhook viene SALTATO (B5a): il titolo nuovo non arriva perché il
      //    collegamento è chiuso, non perché si è perso.
      expect(webhook).toBe('skipped');
      expect(dopo.prodotti).toHaveLength(1);
      expect(dopo.prodotti[0]!.remoto).toBeNull();
      expect(dopo.prodotti[0]!.titoloShopify).toBe(titoloOriginale);
      expect(await fotografieAltrui()).toEqual(altrui);
      return {
        esito: { webhook, lotto: [lotto.imported, lotto.updated, lotto.skipped, lotto.failed.length], prodotti: dopo.prodotti.length },
        completate: 1,
        scartate: (webhook === 'skipped' ? 1 : 0) + lotto.skipped,
        fallite: lotto.failed.length,
      };
    });
  }, 120_000);

  // ── S6 · lotto con articoli validi ed esclusi ────────────────────────────

  it('S6 · in un lotto con esclusi, gli esclusi restano esclusi e gli altri completano — due volte', async () => {
    await dueEsecuzioni('S6', async () => {
      const altrui = await fotografieAltrui();
      const negozio = alfa.negozio!;
      const seminati = remotoPiccolo().map((s) => negozio.semina(s));
      // ⚠️ I titoli PRIMA delle modifiche remote: gli oggetti del simulatore sono vivi.
      const titoli = seminati.map((p) => p.title);
      expect((await alfa.pull!.pullCatalog(alfa.id)).imported).toBe(4);

      // Esclusi: il prodotto 2 eliminato DEFINITIVAMENTE (situazione costruita come in B6:
      // `delete()` rifiuta un articolo collegato, quindi nessun percorso applicativo ci
      // arriva); la variante S del prodotto 1 — che ne ha due — eliminata dal percorso
      // applicativo.
      const p2 = await prisma.product.findFirstOrThrow({ where: { tenantId: alfa.id, shopifyProductId: String(seminati[1]!.id) } });
      await prisma.$transaction(async (tx) => {
        await storico.sganciaProdotto(tx, { tenantId: alfa.id, productId: p2.id });
        await tx.inventoryLevel.deleteMany({ where: { variant: { productId: p2.id } } });
        await tx.productVariant.deleteMany({ where: { productId: p2.id } });
        await tx.product.delete({ where: { id: p2.id } });
      });
      const p3 = await prisma.product.findFirstOrThrow({
        where: { tenantId: alfa.id, shopifyProductId: String(seminati[0]!.id) },
        include: { variants: true },
      });
      const daTogliere = p3.variants.find((v) => v.shopifyVariantId === String(seminati[0]!.variants[0]!.id))!;
      await alfa.products.update(alfa.id, p3.id, {
        name: p3.name,
        variants: p3.variants
          .filter((v) => v.id !== daTogliere.id)
          .map((v) => ({ id: v.id, sku: v.sku, barcode: v.barcode ?? undefined, sellingPrice: { amountMinor: Number(v.sellingPriceMinor), currency: 'EUR' } })),
      } as never);

      // Shopify intanto aggiorna tutti i titoli.
      for (const p of seminati) {
        negozio.modifica(p.id, { title: `${p.title} — rivisto` });
      }

      const esiti: number[][] = [];
      for (const giro of [1, 2]) {
        const lotto = await alfa.pull!.pullCatalog(alfa.id);
        esiti.push([lotto.imported, lotto.updated, lotto.skipped, lotto.failed.length]);
        // ⭐ Gli esclusi restano esclusi; gli altri completano; il lotto non si ferma.
        expect(lotto.imported).toBe(0);
        expect(lotto.updated).toBe(3);
        expect(lotto.skipped).toBe(1);
        expect(lotto.failed).toEqual([]);
        expect(await prisma.product.count({ where: { tenantId: alfa.id, shopifyProductId: String(seminati[1]!.id) } })).toBe(0);
        const p3Dopo = await prisma.product.findUniqueOrThrow({ where: { id: p3.id }, include: { variants: true } });
        expect(p3Dopo.variants).toHaveLength(p3.variants.length - 1);
        expect(p3Dopo.shopifyTitle).toBe(`${titoli[0]} — rivisto`);
        // ⭐ I MOTIVI PERSISTONO (§10.3, dal 09/09/2026): a ogni giro del lotto il
        //    rifiuto lascia una riga `rifiutata` nel registro, con attore `pull`,
        //    il GID remoto e la regola per nome — non solo una riga di log.
        const identitaP2 = await prisma.shopifyProductIdentity.findFirstOrThrow({
          where: { shopifyProductGid: `gid://shopify/Product/${seminati[1]!.id}` },
          include: { periodi: true },
        });
        expect(identitaP2.localDeletedAt).not.toBeNull();
        expect(identitaP2.periodi.map((l) => l.status)).toEqual(['unlinked']);
        const rifiuti = await prisma.platformAuditLog.findMany({
          where: { tenantId: alfa.id, operation: 'import_prodotto_rifiutato' },
          orderBy: { createdAt: 'asc' },
        });
        expect(rifiuti).toHaveLength(giro);
        expect(rifiuti.every((r) => r.outcome === 'rifiutata' && r.actor === 'pull')).toBe(true);
        expect(rifiuti.every((r) => r.remoteGid === `gid://shopify/Product/${seminati[1]!.id}`)).toBe(true);
        expect(rifiuti[giro - 1]!.detail).toMatch(/^eliminato_definitivamente: /);
        // ⭐ E anche la variante eliminata dal percorso applicativo lascia la sua
        //    riga a ogni giro: la guardia della variante la rifiuta, PER variante,
        //    mentre il prodotto intorno si aggiorna.
        expect(
          await prisma.platformAuditLog.count({
            where: { tenantId: alfa.id, operation: 'import_variante_rifiutata' },
          }),
        ).toBe(giro);
        // ⭐ E la CORRELAZIONE è quella del lotto: le due righe di uno stesso giro
        //    (prodotto escluso, variante esclusa) la condividono, e un giro non
        //    condivide la sua con l'altro.
        const tutte = await prisma.platformAuditLog.findMany({
          where: { tenantId: alfa.id, outcome: 'rifiutata' },
          select: { correlationId: true },
        });
        const perCorrelazione = new Map<string, number>();
        for (const r of tutte) perCorrelazione.set(r.correlationId, (perCorrelazione.get(r.correlationId) ?? 0) + 1);
        expect(perCorrelazione.size).toBe(giro);
        expect([...perCorrelazione.values()].every((n) => n === 2)).toBe(true);
      }
      expect(await doppioniRemoti(alfa.id)).toEqual([]);
      expect(await fotografieAltrui()).toEqual(altrui);
      const finale = await fotografiaTenant(alfa.id);
      return {
        esito: { giri: esiti, prodotti: finale.prodotti.length, identita: finale.identitaProdotto.length, eliminate: finale.identitaProdotto.filter((i) => i.eliminata).length },
        completate: 4 + 6,
        scartate: 2,
        fallite: 0,
      };
    });
  }, 120_000);

  // ── S7 · errore in un punto preciso → rollback → nuovo tentativo ─────────

  it('S7 · un errore iniettato in un punto preciso rotola indietro tutto, e il tentativo dopo riesce', async () => {
    await dueEsecuzioni('S7', async () => {
      const altrui = await fotografieAltrui();
      const negozio = alfa.negozio!;

      // a · IMPORT: lo storico fallisce alla scrittura dell'identità, dentro la transazione
      const P = negozio.semina(remotoPiccolo()[0]!);
      let guasti = 1;
      const storicoGuasto = new Proxy(storico, {
        get(bersaglio, proprieta, ricevente) {
          if (proprieta === 'registraProdotto' && guasti > 0) {
            return async () => {
              guasti -= 1;
              throw new Error('guasto iniettato: storico non disponibile');
            };
          }
          return Reflect.get(bersaglio, proprieta, ricevente);
        },
      });
      const pullGuasto = creaPull(negozio, storicoGuasto);
      await expect(pullGuasto.importProductFromWebhook(alfa.id, negozio.webhook(P.id))).rejects.toThrow(/guasto iniettato/);
      // ⭐ ROLLBACK: né prodotto, né varianti, né identità.
      expect(await prisma.product.count({ where: { tenantId: alfa.id, shopifyProductId: String(P.id) } })).toBe(0);
      expect(await prisma.productVariant.count({ where: { tenantId: alfa.id } })).toBe(0);
      expect(await prisma.shopifyProductIdentity.count({ where: { tenantId: alfa.id } })).toBe(0);
      // ⭐ NUOVO TENTATIVO, con lo stesso servizio: riesce, e completo.
      expect(await pullGuasto.importProductFromWebhook(alfa.id, negozio.webhook(P.id))).toBe('imported');
      await confrontaImportato(alfa.id, negozio, P.id);

      // b · PUSH: Shopify fallisce l'aggiornamento delle varianti di un prodotto collegato
      const creato = await alfa.products.create(alfa.id, dtoDa(catalogoLocale(5)[0]!) as never);
      expect((await alfa.push!.pushProduct(alfa.id, creato.id)).pushed).toBe(true);
      const remotoId = Number((await prisma.product.findUniqueOrThrow({ where: { id: creato.id } })).shopifyProductId);
      await alfa.products.update(alfa.id, creato.id, {
        shopifyTitle: 'Titolo con guasto',
        variants: creato.variants.map((v) => ({ id: v.id, sku: v.sku, barcode: v.barcode ?? undefined, sellingPrice: { amountMinor: Number(v.sellingPriceMinor), currency: 'EUR' }, shopifyPrice: { amountMinor: 9990, currency: 'EUR' } })),
      } as never);
      negozio.guastaProssima('bulkUpdateVariants');
      const fallito = await alfa.push!.pushProduct(alfa.id, creato.id);
      const inErrore = await prisma.product.findUniqueOrThrow({ where: { id: creato.id } });
      // ⭐ L'atteso approvato (`docs/24` §8.9.4): fallita CON MOTIVO VISIBILE e
      //    possibilità di recupero. Su un prodotto già collegato lo stato è
      //    `out_of_sync` (`markPushFailed`), col messaggio.
      expect(['error', 'out_of_sync']).toContain(inErrore.shopifySyncStatus);
      expect(inErrore.shopifyLastError).toMatch(/guasto iniettato/);
      // ⛔ **Comportamento SUPERATO il 09/09/2026 (26.2).** Qui c'era scritto,
      //    e misurato: «`pushProduct` DICHIARA `pushed: true` anche quando
      //    l'aggiornamento remoto è fallito, perché legge `pushed: false` solo
      //    dallo stato `error` — e su un prodotto collegato lo stato è
      //    `out_of_sync`». Il motivo era visibile sul prodotto, il risultato
      //    dichiarato dall'operazione no, e la prova si limitava a registrare.
      //
      // ⭐ Ora l'esito lo dichiara il LAVORO, non una rilettura dello stato: si
      //    asserisce, e questa riga è la falsificazione del rimedio.
      expect(fallito.pushed).toBe(false);
      expect(fallito.outcome).toBe('fallito');
      expect(fallito.detail).toMatch(/guasto iniettato/);
      const dichiaratoDuranteGuasto = fallito.pushed;
      // ⚠️ Misurato, non deciso: il titolo era già arrivato sul remoto quando le varianti
      //    hanno fallito. Il push non è una transazione remota.
      const remotoDopoGuasto = negozio.prodotto(remotoId);
      // ⭐ Nuovo tentativo: riesce, e locale e remoto tornano allineati.
      const ritentato = await alfa.push!.pushProduct(alfa.id, creato.id);
      expect(ritentato.pushed).toBe(true);
      const { locale } = await confrontaPubblicato(alfa.id, negozio, creato.id);
      expect(locale.shopifySyncStatus).toBe('synced');
      expect(negozio.prodotto(remotoId).variants.every((v) => v.price === '99.90')).toBe(true);
      expect(await fotografieAltrui()).toEqual(altrui);
      const finale = await fotografiaTenant(alfa.id);
      return {
        esito: {
          prodotti: finale.prodotti.length,
          identita: finale.identitaProdotto.length,
          titoloRemotoDuranteGuasto: remotoDopoGuasto.title,
          statoDuranteGuasto: inErrore.shopifySyncStatus,
          dichiaratoDuranteGuasto,
        },
        completate: 4,
        scartate: 0,
        fallite: 2,
      };
    });
  }, 120_000);

  // ── S8 · backup → operazioni → ripristino ────────────────────────────────

  it('S8 · backup, operazioni successive, ripristino: le regole approvate sullo storico reggono', async () => {
    await dueEsecuzioni('S8', async () => {
      const altrui = await fotografieAltrui();
      const negozio = alfa.negozio!;
      const seminati = remotoPiccolo().map((s) => negozio.semina(s));
      expect((await alfa.pull!.pullCatalog(alfa.id)).imported).toBe(4);
      const esporta = async () => readStreamToBuffer((await exporter.createExportStream(alfa.id)).stream);

      // 1 · backup, poi un'ESCLUSIONE (variante eliminata dal percorso applicativo)
      const backup1 = await esporta();
      const p3 = await prisma.product.findFirstOrThrow({
        where: { tenantId: alfa.id, shopifyProductId: String(seminati[2]!.id) },
        include: { variants: true },
      });
      const eliminata = p3.variants.find((v) => v.shopifyVariantId === String(seminati[2]!.variants[0]!.id))!;
      await alfa.products.update(alfa.id, p3.id, {
        name: p3.name,
        variants: p3.variants.filter((v) => v.id !== eliminata.id).map((v) => ({ id: v.id, sku: v.sku, barcode: v.barcode ?? undefined, sellingPrice: { amountMinor: Number(v.sellingPriceMinor), currency: 'EUR' } })),
      } as never);
      await importer.importFromZipBuffer(alfa.id, AZIENDE_CICLO.alfa.utente, backup1);
      // ⭐ Regola 2b: l'esclusione decisa DOPO il backup non viene sovrascritta.
      const identitaEliminata = await prisma.shopifyVariantIdentity.findFirstOrThrow({
        where: { shopifyVariantGid: `gid://shopify/ProductVariant/${seminati[2]!.variants[0]!.id}` },
        include: { periodi: true },
      });
      expect(identitaEliminata.variantId).toBeNull();
      expect(identitaEliminata.localDeletedAt).not.toBeNull();
      expect(identitaEliminata.periodi.map((l) => [l.status, l.closeReason])).toEqual([['unlinked', 'local_delete']]);
      // ⭐ **DECISO il 09/09/2026, e ora ASSERITO** — era la dimostrazione di
      //    `DA-FARE` §26.7, misurata e non decisa. Le due cose da distinguere
      //    restano «l'esclusione resta SCRITTA» (lo storico) e «l'esclusione
      //    viene RISPETTATA dai percorsi operativi»: la seconda era il difetto,
      //    ed è quella che le righe qui sotto ora tengono ferma.
      const rigaTornata = await prisma.productVariant.findUnique({ where: { id: eliminata.id } });
      negozio.modifica(seminati[2]!.id, {
        variante: { id: seminati[2]!.variants[0]!.id, barcode: '8007777777770' },
      });
      expect(await alfa.pull!.importProductFromWebhook(alfa.id, negozio.webhook(seminati[2]!.id))).toBe('updated');
      const rigaDopoWebhook = await prisma.productVariant.findUnique({ where: { id: eliminata.id } });
      const identitaDopoWebhook = await prisma.shopifyVariantIdentity.findUniqueOrThrow({
        where: { id: identitaEliminata.id },
        include: { periodi: true },
      });
      // ⭐ Si contano ENTRAMBE le forme del rifiuto per quel GID: «import rifiutato»
      //    (la variante non c'è e non si ricrea) e «riaggancio rifiutato» (la riga
      //    c'è per cache, lo storico non la riaggancia).
      const rifiutiVariante = await prisma.platformAuditLog.findMany({
        where: {
          tenantId: alfa.id,
          remoteGid: `gid://shopify/ProductVariant/${seminati[2]!.variants[0]!.id}`,
          outcome: 'rifiutata',
        },
        select: { operation: true, detail: true },
      });
      // ⭐ Ciò che le regole approvate decidono, e che si ASSERISCE: lo storico resta
      //    scritto — identità esclusa, periodo chiuso, nessun periodo nuovo.
      expect(identitaDopoWebhook.variantId).toBeNull();
      expect(identitaDopoWebhook.localDeletedAt).not.toBeNull();
      expect(identitaDopoWebhook.periodi.map((l) => [l.status, l.closeReason])).toEqual([['unlinked', 'local_delete']]);
      // ⛔ **26.7 · l'aggiornamento NON passa dalla cache.** Il ripristino
      //    rimette la riga con `shopify_variant_id` valorizzato, ma il webhook
      //    che modifica quella variante non la tocca: il barcode nuovo non
      //    arriva, e il rifiuto è registrato. Fino al 09/09/2026 il barcode
      //    arrivava, e questa prova si limitava a registrarlo.
      expect(rigaTornata).not.toBeNull();
      // ⭐ **La cache torna dal backup ma il ripristino la ALLINEA**: quel GID
      //    ha l'identità eliminata, quindi la colonna si azzera. È la pulizia,
      //    non la protezione — che sta nelle guardie, e regge anche senza.
      expect(rigaTornata!.shopifyVariantId).toBeNull();
      expect(rigaDopoWebhook!.barcode).not.toBe('8007777777770');
      expect(rigaDopoWebhook!.barcode).toBe(rigaTornata!.barcode);
      // ⚠️ **Quale delle due forme dipende dall'allineamento**: con la cache
      //    azzerata dal ripristino la variante non è più «agganciata per
      //    colonna», quindi il webhook prova a RICREARLA e il rifiuto è
      //    `import_variante_rifiutata`. Con la cache presente sarebbe
      //    `riaggancio_rifiutato` — quel caso lo tiene fermo `E3`, dove il
      //    ripristino non c'è. Ciò che qui conta è che un rifiuto ci sia.
      expect(rifiutiVariante.length).toBeGreaterThan(0);
      expect(['import_variante_rifiutata', 'riaggancio_rifiutato']).toContain(
        rifiutiVariante[0]!.operation,
      );
      // ⚠️ I valori restano nell'esito: `dueEsecuzioni` li confronta fra due giri,
      //    ed è così che si vede se il comportamento è deterministico.
      const osservato26_7 = {
        rigaTornataDalBackup: rigaTornata !== null,
        cacheDopoRipristino: rigaTornata?.shopifyVariantId ?? null,
        barcodeDopoWebhook: rigaDopoWebhook?.barcode ?? null,
        cacheDopoWebhook: rigaDopoWebhook?.shopifyVariantId ?? null,
        rifiutiRegistratiPerLaVariante: rifiutiVariante.map(
          (r) => `${r.operation} (${r.detail?.split(':')[0] ?? '-'})`,
        ),
      };
      expect(await doppioniRemoti(alfa.id)).toEqual([]);

      // ── ripristino → PUSH: la seconda sequenza di §26.7, ora ASSERITA ──────
      //
      // (a) con la cache com'è tornata dal backup: una modifica locale riconoscibile
      //     sulla riga esclusa (prezzo Shopify 123,45) → il push NON la porta sul
      //     GID vietato, e le sorelle arrivano lo stesso.
      const righeP3 = await prisma.productVariant.findMany({ where: { productId: p3.id } });
      await alfa.products.update(alfa.id, p3.id, {
        variants: righeP3.map((v) => ({
          id: v.id,
          sku: v.sku,
          barcode: v.barcode ?? undefined,
          sellingPrice: { amountMinor: Number(v.sellingPriceMinor), currency: 'EUR' },
          shopifyPrice: {
            amountMinor: v.id === eliminata.id ? 12345 : Number(v.shopifyPriceMinor),
            currency: 'EUR',
          },
        })),
      } as never);
      const gidVietato = seminati[2]!.variants[0]!.id;
      const pushConCache = await alfa.push!.pushProduct(alfa.id, p3.id);
      const remotaConCache = negozio.prodotto(seminati[2]!.id).variants.find((v) => v.id === gidVietato)!;
      // ⛔ 26.7 · il prezzo modificato NON è arrivato sul GID vietato, e 26.2 ·
      //    l'esito lo dice: parziale, non «tutto sincronizzato».
      expect(remotaConCache.price).not.toBe('123.45');
      expect(pushConCache.pushed).toBe(false);
      expect(pushConCache.outcome).toBe('parziale');
      expect(pushConCache.reason).toBe('collegamento_escluso');
      // (b) cache azzerata sulla variante esclusa — è ciò che il ripristino
      //     allinea, ed era il «rimedio minimo» che da solo NON bastava: il push
      //     cerca corrispondenze per le varianti senza identificativo, e
      //     rimetteva la cache sul GID vietato. Ora non più.
      await prisma.productVariant.update({
        where: { id: eliminata.id },
        data: { shopifyVariantId: null, shopifyInventoryItemId: null },
      });
      const pushSenzaCache = await alfa.push!.pushProduct(alfa.id, p3.id);
      const rigaDopoPushSenzaCache = await prisma.productVariant.findUniqueOrThrow({ where: { id: eliminata.id } });
      const identitaDopoPush = await prisma.shopifyVariantIdentity.findUniqueOrThrow({
        where: { id: identitaEliminata.id },
        include: { periodi: true },
      });
      // ⛔ 26.7 · la cache NON viene rimessa sul GID vietato, e lo storico
      //    resta com'era: nessun periodo nuovo, nessun riaggancio.
      expect(rigaDopoPushSenzaCache.shopifyVariantId).toBeNull();
      expect(identitaDopoPush.variantId).toBeNull();
      expect(identitaDopoPush.periodi.map((l) => l.status)).toEqual(['unlinked']);
      // (c) PRODOTTO con collegamento CHIUSO e cache azzerata (situazione costruita
      //     sul quarto articolo): il push NON crea un prodotto remoto nuovo.
      const p4 = await prisma.product.findFirstOrThrow({
        where: { tenantId: alfa.id, shopifyProductId: String(seminati[3]!.id) },
      });
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `UPDATE shopify_variant_links l SET status = 'unlinked', close_reason = 'operator', closed_at = GREATEST(now(), linked_at), updated_at = now()
             FROM shopify_variant_identities i WHERE l.identity_id = i.id AND i.product_id = $1::uuid AND l.status = 'active'`,
          p4.id,
        );
        await tx.$executeRawUnsafe(
          `UPDATE shopify_product_links l SET status = 'unlinked', close_reason = 'operator', closed_at = GREATEST(now(), linked_at), updated_at = now()
             FROM shopify_product_identities i WHERE l.identity_id = i.id AND i.product_id = $1::uuid AND l.status = 'active'`,
          p4.id,
        );
        await tx.productVariant.updateMany({ where: { productId: p4.id }, data: { shopifyVariantId: null, shopifyInventoryItemId: null } });
        await tx.product.update({ where: { id: p4.id }, data: { shopifyProductId: null } });
      });
      const remotiPrima = negozio.prodotti.size;
      const pushProdottoChiuso = await alfa.push!.pushProduct(alfa.id, p4.id);
      const p4Dopo = await prisma.product.findUniqueOrThrow({ where: { id: p4.id } });
      // ⛔ 26.7 · nessuna ripubblicazione: «Sincronizza» non è il comando che la
      //    autorizza (§11.9), e il motivo è leggibile sul prodotto.
      expect(negozio.prodotti.size).toBe(remotiPrima);
      expect(p4Dopo.shopifyProductId).toBeNull();
      expect(pushProdottoChiuso.pushed).toBe(false);
      expect(pushProdottoChiuso.outcome).toBe('rifiutato');
      expect(p4Dopo.shopifyLastError).toMatch(/collegamento chiuso/i);
      const osservatoPush = {
        conCache: {
          pushed: pushConCache.pushed,
          prezzoRemotoSulGidVietato: remotaConCache.price,
        },
        senzaCache: {
          pushed: pushSenzaCache.pushed,
          cacheRimessaDalPush: rigaDopoPushSenzaCache.shopifyVariantId,
          identitaRiagganciata: identitaDopoPush.variantId !== null,
          periodi: identitaDopoPush.periodi.map((l) => l.status),
        },
        prodottoChiusoSenzaCache: {
          pushed: pushProdottoChiuso.pushed,
          prodottiRemotiCreati: negozio.prodotti.size - remotiPrima,
          nuovaCacheDiversaDalGidChiuso:
            p4Dopo.shopifyProductId !== null && p4Dopo.shopifyProductId !== String(seminati[3]!.id),
          identitaDelProdotto: await prisma.shopifyProductIdentity.count({ where: { originalProductId: p4.id } }),
          periodiAttiviDelProdotto: await prisma.shopifyProductLink.count({ where: { originalProductId: p4.id, status: 'active' } }),
        },
      };

      // 2 · backup, poi un articolo NUOVO collegato: il ripristino di quel backup va RIFIUTATO
      const backup2 = await esporta();
      // ⚠️ Un prodotto DAVVERO nuovo, senza anomalie e con codici propri: il decimo del
      //    catalogo da 50 (i quattro già seminati sono quelli del catalogo da 5).
      const nuovo = negozio.semina(catalogoRemoto(50)[9]!);
      expect(await alfa.pull!.importProductFromWebhook(alfa.id, negozio.webhook(nuovo.id))).toBe('imported');
      const nuovoLocale = await prisma.product.findFirstOrThrow({ where: { tenantId: alfa.id, shopifyProductId: String(nuovo.id) } });
      const primaDelRifiuto = await fotografiaTenant(alfa.id);
      // ⭐ Regola 3c: un articolo ancora collegato ASSENTE dal backup: rifiutato e nominato.
      await expect(importer.importFromZipBuffer(alfa.id, AZIENDE_CICLO.alfa.utente, backup2)).rejects.toThrow(new RegExp(nuovoLocale.id));
      expect(await fotografiaTenant(alfa.id)).toEqual(primaDelRifiuto);

      expect(await fotografieAltrui()).toEqual(altrui);
      const finale = await fotografiaTenant(alfa.id);
      return {
        esito: {
          prodotti: finale.prodotti.length,
          identita: finale.identitaProdotto.length,
          identitaVarianti: finale.identitaVariante.length,
          osservato26_7,
          osservatoPush,
        },
        completate: 4 + 1 + 1 + 1,
        scartate: 0,
        fallite: 1,
      };
    });
  }, 180_000);

  // ── S9 · cancellazione di un'azienda di prova ────────────────────────────

  it('S9 · cancellare Alfa non altera Beta né Gamma, e lascia la traccia prevista', async () => {
    await dueEsecuzioni('S9', async () => {
      // Entrambe le aziende collegate hanno un catalogo importato.
      for (const spec of remotoPiccolo()) alfa.negozio!.semina(spec);
      for (const spec of catalogoRemoto(5, 'CB').slice(0, 3)) beta.negozio!.semina(spec);
      expect((await alfa.pull!.pullCatalog(alfa.id)).imported).toBe(4);
      expect((await beta.pull!.pullCatalog(beta.id)).imported).toBe(3);
      const altrui = await fotografieAltrui();
      expect(altrui.beta.prodotti).toHaveLength(3);
      expect(altrui.gamma.prodotti).toHaveLength(5);

      await admin.deleteTenant(alfa.id, operatore(AZIENDE_CICLO.alfa.utente));

      expect(await prisma.tenant.count({ where: { id: alfa.id } })).toBe(0);
      expect(await prisma.product.count({ where: { tenantId: alfa.id } })).toBe(0);
      expect(await prisma.shopifyProductIdentity.count({ where: { tenantId: alfa.id } })).toBe(0);
      // ⭐ Gli altri due: identici a prima.
      expect(await fotografieAltrui()).toEqual(altrui);
      // ⭐ La traccia prevista: tentativo e riuscita, col tenant come testo.
      const traccia = await prisma.platformAuditLog.findMany({ where: { tenantId: alfa.id }, orderBy: { createdAt: 'asc' } });
      expect(traccia.map((r) => r.outcome)).toEqual(['tentativo', 'riuscita']);
      expect(traccia[1]!.operation).toBe('cancellazione_tenant');
      expect(traccia[1]!.entityLabel).toBe(AZIENDE_CICLO.alfa.nome);
      // E Beta continua a lavorare col proprio negozio.
      beta.negozio!.modifica([...beta.negozio!.prodotti.keys()][0]!, { title: 'Beta dopo la cancellazione di Alfa' });
      expect((await beta.pull!.pullCatalog(beta.id)).updated).toBe(3);
      return {
        esito: { alfaProdotti: 0, betaProdotti: (await fotografiaTenant(beta.id)).prodotti.length, traccia: traccia.map((r) => r.outcome) },
        completate: 4 + 3 + 1 + 3,
        scartate: 0,
        fallite: 0,
      };
    });
  }, 180_000);

  // ── S10 · l'azienda senza Shopify ────────────────────────────────────────

  it('S10 · Gamma lavora senza Shopify: nessuna chiamata remota, nessuna riga di canale, nessuna dipendenza', async () => {
    await dueEsecuzioni('S10', async () => {
      const prima = await fotografiaTenant(gamma.id);
      expect(prima.prodotti).toHaveLength(5);
      expect(prima.documenti).toBe(1);
      const chiamatePrima = alfa.negozio!.totaleChiamate() + beta.negozio!.totaleChiamate();

      // Creazione, modifica, cestino e ripristino, duplicazione: il giro ordinario.
      const nuovo = await gamma.products.create(
        gamma.id,
        dtoDa({
          ...catalogoLocale(5, 'CG')[0]!,
          name: 'Gamma nuovo',
          articleCode: 'CG-NUOVO',
          options: [{ name: 'Taglia', values: ['S'] }],
          variants: [
            {
              sku: 'CG-NUOVO-S',
              barcode: '8199999999990',
              optionValues: [{ name: 'Taglia', value: 'S' }],
              sellingPriceMinor: 1000,
            },
          ],
        }) as never,
      );
      await gamma.products.update(gamma.id, nuovo.id, { name: 'Gamma nuovo rinominato', brand: 'Marca locale' } as never);
      await gamma.products.moveToTrash(gamma.id, nuovo.id, operatore(AZIENDE_CICLO.gamma.utente), 'prova');
      expect((await prisma.product.findUniqueOrThrow({ where: { id: nuovo.id } })).deletedAt).not.toBeNull();
      await gamma.products.restoreFromTrash(gamma.id, nuovo.id, operatore(AZIENDE_CICLO.gamma.utente));
      expect((await prisma.product.findUniqueOrThrow({ where: { id: nuovo.id } })).deletedAt).toBeNull();
      const duplicato = await gamma.products.duplicateProduct(gamma.id, nuovo.id);
      expect(duplicato.id).not.toBe(nuovo.id);
      // H3 · eliminazione DEFINITIVA consentita: articolo locale, senza movimenti.
      await gamma.products.delete(gamma.id, duplicato.id);
      expect(await prisma.product.count({ where: { id: duplicato.id } })).toBe(0);

      const dopo = await fotografiaTenant(gamma.id);
      expect(dopo.prodotti).toHaveLength(6);
      expect(dopo.documenti).toBe(1);
      // ⛔ Nessuna riga di canale, nessuna chiamata ai negozi simulati.
      expect(dopo.identitaProdotto).toEqual([]);
      expect(dopo.identitaVariante).toEqual([]);
      expect(await prisma.shopifyShop.count({ where: { tenantId: gamma.id } })).toBe(0);
      expect(await prisma.shopifyConnection.count({ where: { tenantId: gamma.id } })).toBe(0);
      expect(alfa.negozio!.totaleChiamate() + beta.negozio!.totaleChiamate()).toBe(chiamatePrima);
      // Alfa e Beta: intatte.
      expect((await fotografiaTenant(alfa.id)).prodotti).toEqual([]);
      expect((await fotografiaTenant(beta.id)).prodotti).toEqual([]);
      return {
        esito: { prodotti: dopo.prodotti.length, documenti: dopo.documenti, facciata: gamma.facciata.map((c) => c.split(' ')[0]).sort() },
        completate: 5,
        scartate: 0,
        fallite: 0,
      };
    });
  }, 120_000);
});
