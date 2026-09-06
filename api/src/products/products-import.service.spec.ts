import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { TenantPermission } from '../auth/tenant-permission.constants';
import { canViewPurchaseCosts } from '../auth/user-permissions.util';
import type { ChannelSyncFacade } from '../channels/channel-sync.facade';
import type { PrismaService } from '../prisma/prisma.service';
import { testClerkUser, testOwnerUser } from '../test/fixtures/user-profile.fixture';
import { ProductsImportService } from './products-import.service';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';

const CSV_HEADER = `Handle,Title,Body (HTML),Vendor,Type,Tags,Published,Option1 Name,Option1 Value,Option2 Name,Option2 Value,Option3 Name,Option3 Value,Variant SKU,Variant Grams,Variant Inventory Tracker,Variant Inventory Qty,Variant Inventory Policy,Variant Fulfillment Service,Variant Price,Variant Compare-at Price,Variant Requires Shipping,Variant Taxable,Variant Barcode,Image Src,Image Alt Text,Gift Card,SEO Title,SEO Description,Google Shopping / Google Product Category,Google Shopping / Gender,Google Shopping / Age Group,Google Shopping / MPN,Google Shopping / AdWords Grouping,Google Shopping / AdWords Labels,Google Shopping / Condition,Google Shopping / Custom Product,Google Shopping / Custom Label 0,Google Shopping / Custom Label 1,Google Shopping / Custom Label 2,Google Shopping / Custom Label 3,Google Shopping / Custom Label 4,Variant Image,Variant Weight Unit,Variant Tax Code,Cost per item,Status`;

const SAMPLE_CSV = `${CSV_HEADER}
maglietta-test,Maglietta Test,<p>Cotone</p>,Brand,Abbigliamento,,TRUE,Taglia,S,,,,,SKU-E2E-IMPORT,,,1,deny,manual,29.90,,TRUE,TRUE,,,,,,,,,,,,,,,,,,,,,active
`;

const TWO_PRODUCTS_CSV = `${CSV_HEADER}
prod-alpha,Alpha Product,<p>A</p>,Brand,Abbigliamento,,TRUE,Taglia,S,,,,,SKU-ALPHA-001,,,1,deny,manual,19.90,,TRUE,TRUE,,,,,,,,,,,,,,,,,,,,,active
prod-beta,Beta Product,<p>B</p>,Brand,Abbigliamento,,TRUE,Taglia,M,,,,,SKU-BETA-001,,,1,deny,manual,24.90,,TRUE,TRUE,,,,,,,,,,,,,,,,,,,,,active
`;

describe('ProductsImportService', () => {
  function createService(
    existingSkus: string[] = [],
    existingProducts: { name: string; importHandle?: string | null }[] = [],
  ) {
    const channelSync = { enqueueProductPush: vi.fn() };
    const prisma = {
      productVariant: {
        findMany: vi.fn().mockResolvedValue(existingSkus.map((sku) => ({ sku }))),
      },
      product: {
        create: vi.fn(),
        // Serve sia le chiavi anti-duplicato (name/importHandle) sia i codici
        // articolo esistenti (articleCode) del tenant.
        findMany: vi.fn().mockResolvedValue(
          existingProducts.map((product, index) => ({
            name: product.name,
            importHandle: product.importHandle ?? null,
            articleCode: `ART-${index + 1}`,
          })),
        ),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      $transaction: vi.fn(),
    };
    // La create avviene in transazione (generazione codice articolo atomica):
    // la tx condivide le mock del client radice, $queryRaw copre advisory
    // lock + max progressivo (nessun codice numerico esistente).
    prisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
      cb({
        product: prisma.product,
        $queryRaw: vi.fn().mockResolvedValue([]),
      }),
    );
    const service = new ProductsImportService(
      prisma as unknown as PrismaService,
      channelSync as unknown as ChannelSyncFacade,
    );
    return { service, prisma, channelSync };
  }

  it('previewCsv restituisce anteprima prodotti pronti', async () => {
    const { service } = createService();

    const preview = await service.previewCsv('tenant-1', SAMPLE_CSV);

    expect(preview.summary.total).toBe(1);
    expect(preview.products[0]?.handle).toBe('maglietta-test');
  });

  it('previewCsv segnala i prodotti già importati (per handle)', async () => {
    const { service } = createService([], [{ name: 'Altro', importHandle: 'maglietta-test' }]);

    const preview = await service.previewCsv('tenant-1', SAMPLE_CSV);

    expect(preview.summary.alreadyImported).toBe(1);
    expect(preview.products[0]?.alreadyImported).toBe(true);
  });

  it('previewCsv segnala i prodotti già importati (fallback sul nome)', async () => {
    const { service } = createService([], [{ name: 'Maglietta Test' }]);

    const preview = await service.previewCsv('tenant-1', SAMPLE_CSV);

    expect(preview.summary.alreadyImported).toBe(1);
    expect(preview.products[0]?.alreadyImported).toBe(true);
  });

  it('previewCsv rifiuta CSV non valido', async () => {
    const { service } = createService();

    await expect(service.previewCsv('tenant-1', 'not,a,valid,shopify,csv')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('importCsv importa prodotti pronti', async () => {
    const { service, prisma, channelSync } = createService();
    prisma.product.create.mockResolvedValue({
      id: 'prod-1',
      name: 'Maglietta Test',
      variants: [{ sku: 'SKU-E2E-IMPORT' }],
    });

    const result = await service.importCsv('tenant-1', SAMPLE_CSV);

    expect(result.imported).toBe(1);
    expect(result.failed).toBe(0);
    expect(prisma.product.create).toHaveBeenCalledOnce();
    expect(channelSync.enqueueProductPush).toHaveBeenCalledWith('tenant-1', 'prod-1');
    expect(result.products[0]).toMatchObject({ handle: 'maglietta-test', status: 'imported' });
  });

  it('importCsv rispetta filtro handles', async () => {
    const { service, prisma } = createService();
    prisma.product.create.mockResolvedValue({
      id: 'prod-alpha',
      name: 'Alpha Product',
      variants: [],
    });

    const result = await service.importCsv('tenant-1', TWO_PRODUCTS_CSV, {
      handles: ['prod-alpha'],
    });

    expect(result.imported).toBe(1);
    expect(prisma.product.create).toHaveBeenCalledOnce();
    expect(result.products.some((row) => row.handle === 'prod-beta')).toBe(false);
  });

  it('importCsv salta prodotti non pronti in anteprima', async () => {
    const { service, prisma } = createService();
    const preview = await service.previewCsv('tenant-1', TWO_PRODUCTS_CSV);
    const readyCount = preview.products.filter((product) =>
      product.issues.every((issue) => issue.level !== 'error'),
    ).length;

    prisma.product.create.mockResolvedValue({
      id: 'prod-alpha',
      name: 'Alpha Product',
      variants: [],
    });

    const result = await service.importCsv('tenant-1', TWO_PRODUCTS_CSV, {
      handles: ['prod-alpha'],
    });

    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);
    expect(readyCount).toBeGreaterThanOrEqual(1);
    expect(prisma.product.create).toHaveBeenCalledOnce();
  });

  it('importCsv salta prodotti già presenti in catalogo (anti-duplicato per nome)', async () => {
    const { service, prisma } = createService([], [{ name: 'maglietta test' }]);

    const result = await service.importCsv('tenant-1', SAMPLE_CSV);

    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
    expect(prisma.product.create).not.toHaveBeenCalled();
    expect(result.products[0]).toMatchObject({
      handle: 'maglietta-test',
      status: 'skipped',
    });
    expect(result.products[0]?.message).toContain('già presente');
  });

  it('importCsv salta per handle anche se il nome è diverso', async () => {
    const { service, prisma } = createService(
      [],
      [{ name: 'Nome Diverso', importHandle: 'maglietta-test' }],
    );

    const result = await service.importCsv('tenant-1', SAMPLE_CSV);

    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
    expect(prisma.product.create).not.toHaveBeenCalled();
    expect(result.products[0]?.message).toContain('già presente');
  });

  it('importCsv azzera i barcode duplicati nello stesso prodotto', async () => {
    const { service, prisma } = createService();
    const csv = `${CSV_HEADER}
barcode-dup,Prodotto Barcode,<p>A</p>,Brand,Abbigliamento,,TRUE,Taglia,S,,,,,SKU-BC-1,,,1,deny,manual,19.90,,TRUE,TRUE,EAN-DUP,,,,,,,,,,,,,,,,,,,,,active
barcode-dup,Prodotto Barcode,<p>A</p>,Brand,Abbigliamento,,TRUE,Taglia,M,,,,,SKU-BC-2,,,1,deny,manual,24.90,,TRUE,TRUE,EAN-DUP,,,,,,,,,,,,,,,,,,,,,active
`;
    prisma.product.create.mockResolvedValue({
      id: 'prod-bc',
      name: 'Prodotto Barcode',
      variants: [],
    });

    const result = await service.importCsv('tenant-1', csv);

    expect(result.imported).toBe(1);
    const createArg = prisma.product.create.mock.calls[0]?.[0] as {
      data: { variants: { create: { sku: string; barcode: string | null }[] } };
    };
    const barcodes = createArg.data.variants.create.map((variant) => variant.barcode);
    expect(barcodes.filter((barcode) => barcode === 'EAN-DUP')).toHaveLength(1);
    expect(barcodes.filter((barcode) => barcode === null)).toHaveLength(1);
  });

  it('importCsv persiste import_handle del prodotto importato', async () => {
    const { service, prisma } = createService();
    prisma.product.create.mockResolvedValue({
      id: 'prod-1',
      name: 'Maglietta Test',
      variants: [{ sku: 'SKU-E2E-IMPORT' }],
    });

    await service.importCsv('tenant-1', SAMPLE_CSV);

    expect(prisma.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ importHandle: 'maglietta-test' }),
      }),
    );
  });

  it('importCsv non crea duplicati per lo stesso nome nello stesso file', async () => {
    const { service, prisma } = createService();
    const csv = `${CSV_HEADER}
dup-a,Prodotto Doppio,<p>A</p>,Brand,Abbigliamento,,TRUE,Taglia,S,,,,,SKU-DUP-A,,,1,deny,manual,19.90,,TRUE,TRUE,,,,,,,,,,,,,,,,,,,,,active
dup-b,Prodotto Doppio,<p>B</p>,Brand,Abbigliamento,,TRUE,Taglia,M,,,,,SKU-DUP-B,,,1,deny,manual,24.90,,TRUE,TRUE,,,,,,,,,,,,,,,,,,,,,active
`;
    prisma.product.create.mockResolvedValue({
      id: 'prod-dup-a',
      name: 'Prodotto Doppio',
      variants: [],
    });

    const result = await service.importCsv('tenant-1', csv);

    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(1);
    expect(prisma.product.create).toHaveBeenCalledOnce();
  });

  it('importCsv segna fallimento se create lancia errore', async () => {
    const { service, prisma } = createService();
    prisma.product.create.mockRejectedValue(new UnprocessableEntityException('SKU duplicato'));

    const result = await service.importCsv('tenant-1', SAMPLE_CSV);

    expect(result.failed).toBe(1);
    expect(result.imported).toBe(0);
    expect(result.products[0]).toMatchObject({ status: 'failed' });
  });

  /**
   * Costi d'acquisto in import CSV — il ramo NEGATO di
   * `catalog.view_purchase_costs`.
   *
   * PERCHE' QUESTO BLOCCO ESISTE. La regola dichiarata (§permessi, commento in
   * products-import.service.ts sopra `canWriteCosts`) e' «chi non vede i costi
   * non li scrive, nemmeno da CSV»: la guardia forza `purchasePriceMinor` a
   * `null` sull'articolo e su OGNI variante prima che il payload arrivi a
   * Prisma. Nessun altro test di questo file guarda quel campo — le asserzioni
   * esistenti contano righe importate, saltate e fallite. Bastava quindi
   * togliere il ternario, o aggiungere un campo costo alla `create`, perche' un
   * commesso importasse i listini d'acquisto del fornitore con la suite tutta
   * verde: il permesso smetteva di funzionare in silenzio.
   *
   * PERIMETRO. Per questa via si CREA soltanto: i prodotti gia' a catalogo
   * vengono saltati (mai aggiornati), quindi l'import CSV non puo' azzerare un
   * costo preesistente. La difesa che serve davvero e' che il valore del file
   * non entri, ed e' quella che i test qui sotto fissano.
   */
  describe("costi d'acquisto in import CSV (permesso catalog.view_purchase_costs)", () => {
    /**
     * Riga CSV larga quanto l'header, con «Cost per item» valorizzato: e' lo
     * scenario della regola — un file fornitore che porta i costi dentro un
     * import fatto da chi non puo' vederli. Le colonne si indirizzano per nome
     * (non per posizione) cosi' una colonna aggiunta all'header non sposta in
     * silenzio il costo su un'altra cella.
     */
    function csvWithCost(costPerItem: string): string {
      const columns = CSV_HEADER.split(',');
      const cells = columns.map(() => '');
      const set = (header: string, value: string): void => {
        const index = columns.indexOf(header);
        if (index < 0) {
          throw new Error(`Colonna assente nell'header di test: ${header}`);
        }
        cells[index] = value;
      };
      set('Handle', 'costo-test');
      set('Title', 'Prodotto Con Costo');
      set('Published', 'TRUE');
      set('Option1 Name', 'Taglia');
      set('Option1 Value', 'S');
      set('Variant SKU', 'SKU-COSTO-1');
      set('Variant Price', '29.90');
      set('Cost per item', costPerItem);
      set('Status', 'active');
      return `${CSV_HEADER}\n${cells.join(',')}\n`;
    }

    /** Solo i campi costo del payload passato a `product.create`. */
    interface CreateCostPayload {
      readonly purchasePriceMinor: number | null | undefined;
      readonly variants: {
        readonly create: readonly { readonly purchasePriceMinor: number | null | undefined }[];
      };
    }

    async function importWithCost(
      user: UserProfileDto | undefined,
      costPerItem = '12.50',
    ): Promise<CreateCostPayload> {
      const { service, prisma } = createService();
      prisma.product.create.mockResolvedValue({
        id: 'prod-costo',
        name: 'Prodotto Con Costo',
        variants: [{ sku: 'SKU-COSTO-1' }],
      });

      const result = await service.importCsv('tenant-1', csvWithCost(costPerItem), {}, user);
      // Se il prodotto non venisse importato il resto non proverebbe nulla.
      expect(result.imported).toBe(1);

      const call = prisma.product.create.mock.calls[0]?.[0] as
        { data: CreateCostPayload } | undefined;
      if (!call) {
        throw new Error('product.create non chiamato: nessun payload da ispezionare.');
      }
      return call.data;
    }

    it('senza il permesso il costo del CSV non entra nella create: articolo e varianti restano a ZERO', async () => {
      const commesso = testClerkUser();
      // Presidio della fixture: se un giorno il preset commesso includesse il
      // permesso, questo test smetterebbe di provare qualcosa senza dirlo.
      expect(canViewPurchaseCosts(commesso)).toBe(false);

      const data = await importWithCost(commesso);

      // ⛔ Qui l'atteso era `null`. Il costo canonico non è più nullable: chi non
      // ha il permesso non SCRIVE il costo, e l'articolo nasce a zero.
      expect(data.variants.create.length).toBeGreaterThan(0);
      for (const variant of data.variants.create) {
        expect(variant.purchasePriceMinor).toBe(0);
      }
      // Sull'articolo la guardia scrive zero. L'asserzione fissa il contratto
      // osservabile — «nessun costo dichiarato» — e diventerà discriminante il
      // giorno in cui la colonna verrà mappata.
      expect(data.purchasePriceMinor).toBe(0);
    });

    it('con il permesso la guardia non azzera il costo delle varianti', async () => {
      const commesso = testClerkUser({ permissions: [TenantPermission.CatalogViewPurchaseCosts] });
      expect(canViewPurchaseCosts(commesso)).toBe(true);

      const data = await importWithCost(commesso);

      // Con il permesso il costo del file passa intatto. Il contraltare — lo
      // stesso file importato da chi il permesso non ce l'ha — e' il test
      // «senza il permesso il costo del CSV non entra nella create»: la
      // differenza fra i due e' tutta la regola.
      expect(data.variants.create.length).toBeGreaterThan(0);
      for (const variant of data.variants.create) {
        expect(variant.purchasePriceMinor).toBe(1250);
      }
    });

    it("il titolare non e' mai mascherato: scrive i costi anche con l'elenco permessi vuoto", async () => {
      // hasFullTenantAccess: per il titolare l'array salvato e' ignorato.
      const titolare = testOwnerUser({ permissions: [] });
      expect(canViewPurchaseCosts(titolare)).toBe(true);

      const data = await importWithCost(titolare);

      expect(data.variants.create.length).toBeGreaterThan(0);
      for (const variant of data.variants.create) {
        expect(variant.purchasePriceMinor).toBe(1250);
      }
    });

    it("una chiamata senza profilo utente vale come «non puo'»: nessun costo nel payload", async () => {
      // `user` e' opzionale nella firma: il default deve essere il diniego, non
      // il permesso. Tutte le altre prove di questo file chiamano cosi'.
      const data = await importWithCost(undefined);

      expect(data.purchasePriceMinor).toBe(0);
      for (const variant of data.variants.create) {
        expect(variant.purchasePriceMinor).toBe(0);
      }
    });

    /**
     * Il verso positivo della regola.
     *
     * Fino a poco fa questo test non poteva esistere: la colonna «Cost per
     * item» non veniva letta da nessuno — nessun alias di intestazione, nessun
     * campo nella riga — e il costo dichiarato nel file si perdeva prima ancora
     * di incontrare il permesso. Un catalogo importato da Shopify nasceva con
     * tutti i costi vuoti, senza un errore che lo dicesse: niente margini,
     * niente valorizzazione di magazzino.
     *
     * Ora la colonna arriva fino in fondo, e questo test è ciò che tiene
     * insieme le tre parti: alias, campo di riga e mappatura della variante.
     * Toglierne una qualsiasi lo fa cadere.
     */
    it('con il permesso il costo dichiarato nel CSV arriva fino al payload', async () => {
      const data = await importWithCost(testOwnerUser(), '12.50');

      expect(data.variants.create.length).toBeGreaterThan(0);
      for (const variant of data.variants.create) {
        expect(variant.purchasePriceMinor).toBe(1250);
      }
    });

    // ⛔ Qui c'era «una colonna costo vuota non diventa zero: resta assente», con
    // la motivazione «uno zero implicito sarebbe un dato inventato». È la regola
    // che il proprietario ha ribaltato il 22/08/2026: per il dominio costo,
    // «non valorizzato» e «zero» sono lo stesso caso, e il valore persistito è 0.
    it('una colonna costo vuota vale zero, che è un costo', async () => {
      const data = await importWithCost(testOwnerUser(), '');

      for (const variant of data.variants.create) {
        expect(variant.purchasePriceMinor).toBe(0);
      }
    });
  });
});
