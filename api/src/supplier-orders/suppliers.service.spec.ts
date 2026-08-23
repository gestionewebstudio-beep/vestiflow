import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { docManagePermission, TenantPermission } from '../auth/tenant-permission.constants';
import { testClerkUser, testOwnerUser } from '../test/fixtures/user-profile.fixture';
import { SuppliersService } from './suppliers.service';

describe('SuppliersService', () => {
  const tenantId = 'tenant-1';

  function supplierRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'sup-1',
      tenantId,
      partyId: 'party-1',
      code: '0001',
      isActive: true,
      paymentMethod: null,
      paymentTerms: null,
      supplierDiscount: null,
      defaultVatCodeId: null,
      transportResponsible: null,
      freightTerms: null,
      documentCreationAlert: null,
      documentCreationNote: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      party: {
        id: 'party-1',
        tenantId,
        companyName: 'Fornitore',
        firstName: null,
        lastName: null,
        vatNumber: null,
        taxCode: null,
        email: null,
        pec: null,
        phone: null,
        website: null,
        contactName: null,
        addressLine1: null,
        addressLine2: null,
        city: null,
        province: null,
        postalCode: null,
        countryCode: null,
        notes: null,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        customerRole: null,
      },
      ...overrides,
    };
  }

  const prisma = {
    supplier: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    customer: {
      findFirst: vi.fn(),
    },
    party: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    vatCode: { findFirst: vi.fn() },
    supplierOrder: { count: vi.fn() },
    document: { count: vi.fn() },
    productVariant: { findFirst: vi.fn() },
    supplierVariantLink: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
    product: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  };

  const customers = {
    setCustomerRoleForSupplier: vi.fn(),
  };

  let service: SuppliersService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.customer.findFirst.mockResolvedValue(null);
    prisma.$transaction.mockImplementation(async (arg: unknown) => {
      if (typeof arg === 'function') {
        return arg(prisma);
      }
      return Promise.all(arg as Promise<unknown>[]);
    });
    service = new SuppliersService(prisma as never, customers as never);
  });

  it('getById lancia NotFoundException se assente', async () => {
    prisma.supplier.findFirst.mockResolvedValue(null);
    await expect(service.getById(tenantId, 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getById appiattisce il soggetto (nome = ragione sociale)', async () => {
    prisma.supplier.findFirst.mockResolvedValue(
      supplierRow({
        party: { ...supplierRow().party, customerRole: { id: 'cust-3', isActive: false } },
      }),
    );
    const supplier = await service.getById(tenantId, 'sup-1');
    expect(supplier.name).toBe('Fornitore');
    expect(supplier.linkedCustomerId).toBe('cust-3');
    expect(supplier.linkedCustomerActive).toBe(false);
  });

  it('create normalizza il nome nel soggetto (ragione sociale)', async () => {
    prisma.supplier.findMany.mockResolvedValue([]);
    prisma.supplier.findFirst.mockResolvedValue(supplierRow());
    prisma.party.create.mockResolvedValue({ id: 'party-1' });
    prisma.supplier.create.mockResolvedValue({ id: 'sup-1' });
    await service.create(tenantId, { name: '  Fornitore  ' });
    expect(prisma.party.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ companyName: 'Fornitore' }),
      }),
    );
    expect(prisma.supplier.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ code: '0001', partyId: 'party-1' }),
      }),
    );
  });

  it('create assegna codice progressivo se assente', async () => {
    prisma.supplier.findMany.mockResolvedValue([{ code: '0002' }, { code: 'FORN-X' }]);
    prisma.supplier.findFirst.mockResolvedValue(supplierRow({ id: 'sup-2', code: '0003' }));
    prisma.party.create.mockResolvedValue({ id: 'party-2' });
    prisma.supplier.create.mockResolvedValue({ id: 'sup-2' });
    await service.create(tenantId, { name: 'Nuovo' });
    expect(prisma.supplier.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ code: '0003' }),
      }),
    );
  });

  it('delete blocca se ci sono ordini collegati', async () => {
    prisma.supplier.findFirst.mockResolvedValue(supplierRow());
    prisma.supplierOrder.count.mockResolvedValue(1);
    prisma.document.count.mockResolvedValue(0);
    await expect(service.delete(tenantId, 'sup-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('delete di un ruolo senza ruolo cliente elimina anche il soggetto', async () => {
    prisma.supplier.findFirst.mockResolvedValue(supplierRow());
    prisma.supplierOrder.count.mockResolvedValue(0);
    prisma.document.count.mockResolvedValue(0);
    await service.delete(tenantId, 'sup-1');
    expect(prisma.supplier.delete).toHaveBeenCalledWith({ where: { id: 'sup-1' } });
    expect(prisma.party.delete).toHaveBeenCalledWith({ where: { id: 'party-1' } });
  });

  it('delete conserva il soggetto se esiste il ruolo cliente', async () => {
    prisma.supplier.findFirst.mockResolvedValue(
      supplierRow({
        party: { ...supplierRow().party, customerRole: { id: 'cust-3', isActive: true } },
      }),
    );
    prisma.supplierOrder.count.mockResolvedValue(0);
    prisma.document.count.mockResolvedValue(0);
    await service.delete(tenantId, 'sup-1');
    expect(prisma.supplier.delete).toHaveBeenCalledWith({ where: { id: 'sup-1' } });
    expect(prisma.party.delete).not.toHaveBeenCalled();
  });

  /**
   * Perché questo blocco esiste — la rotta `POST/PATCH /suppliers` chiede
   * `doc.supplier_order.manage`, ma il corpo porta `alsoCustomer`, e quella
   * spunta non tocca il fornitore: crea o disattiva un'anagrafica CLIENTE.
   * Il gate della rotta non copre ciò che l'endpoint fa davvero, e a valle
   * nessuno ricontrolla — chi gestisce gli ordini fornitore si ritrovava a
   * scrivere nell'anagrafica clienti senza `customers.manage`.
   */
  describe('il permesso segue il ruolo gemello, non la rotta', () => {
    // Passa il gate della rotta fornitori, ma non gestisce i clienti: è
    // esattamente il profilo che il difetto lasciava passare.
    const soloFornitori = testClerkUser({
      permissions: [...testClerkUser().permissions, docManagePermission('supplier_order')],
    });
    const ancheClienti = testClerkUser({
      permissions: [
        ...testClerkUser().permissions,
        docManagePermission('supplier_order'),
        TenantPermission.CustomersManage,
      ],
    });
    // Titolare con l'elenco permessi VUOTO: passa per ruolo, non per array.
    const titolare = testOwnerUser({ permissions: [] });

    /** Creazione riuscita: codice progressivo, soggetto e ruolo fornitore. */
    function arrangeCreazione(): void {
      prisma.supplier.findMany.mockResolvedValue([]);
      prisma.supplier.findFirst.mockResolvedValue(supplierRow());
      prisma.party.create.mockResolvedValue({ id: 'party-1' });
      prisma.supplier.create.mockResolvedValue({ id: 'sup-1' });
    }

    /** Modifica di un fornitore che è ANCHE cliente attivo (spunta accesa). */
    function arrangeModificaConRuoloCliente(): void {
      prisma.supplier.findFirst.mockResolvedValue(
        supplierRow({
          party: { ...supplierRow().party, customerRole: { id: 'cust-3', isActive: true } },
        }),
      );
    }

    function nessunaScrittura(): void {
      expect(prisma.party.create).not.toHaveBeenCalled();
      expect(prisma.supplier.create).not.toHaveBeenCalled();
      expect(prisma.supplier.update).not.toHaveBeenCalled();
      expect(prisma.party.update).not.toHaveBeenCalled();
      expect(customers.setCustomerRoleForSupplier).not.toHaveBeenCalled();
    }

    it('crea: senza «Gestire clienti» la spunta «È anche cliente» è negata e nulla viene scritto', async () => {
      arrangeCreazione();
      await expect(
        service.create(tenantId, { name: 'Fornitore', alsoCustomer: true }, soloFornitori),
      ).rejects.toBeInstanceOf(ForbiddenException);
      nessunaScrittura();
    });

    it('crea: con «Gestire clienti» il ruolo cliente viene agganciato come prima', async () => {
      arrangeCreazione();
      await service.create(tenantId, { name: 'Fornitore', alsoCustomer: true }, ancheClienti);
      expect(customers.setCustomerRoleForSupplier).toHaveBeenCalledWith(tenantId, 'sup-1', true);
    });

    it("crea: il titolare passa anche con l'elenco permessi vuoto", async () => {
      arrangeCreazione();
      await service.create(tenantId, { name: 'Fornitore', alsoCustomer: true }, titolare);
      expect(titolare.permissions).toEqual([]);
      expect(customers.setCustomerRoleForSupplier).toHaveBeenCalledWith(tenantId, 'sup-1', true);
    });

    it('crea: senza la spunta il fornitore si salva anche senza «Gestire clienti»', async () => {
      arrangeCreazione();
      await service.create(tenantId, { name: 'Fornitore', alsoCustomer: false }, soloFornitori);
      expect(prisma.supplier.create).toHaveBeenCalled();
      expect(customers.setCustomerRoleForSupplier).not.toHaveBeenCalled();
    });

    it('modifica: accendere la spunta senza «Gestire clienti» è negato e nulla viene scritto', async () => {
      prisma.supplier.findFirst.mockResolvedValue(supplierRow());
      await expect(
        service.update(tenantId, 'sup-1', { alsoCustomer: true }, soloFornitori),
      ).rejects.toBeInstanceOf(ForbiddenException);
      nessunaScrittura();
    });

    it('modifica: SPEGNERE la spunta è negato quanto accenderla (disattivare un cliente è una scrittura)', async () => {
      arrangeModificaConRuoloCliente();
      await expect(
        service.update(tenantId, 'sup-1', { alsoCustomer: false }, soloFornitori),
      ).rejects.toBeInstanceOf(ForbiddenException);
      nessunaScrittura();
    });

    it('modifica: la spunta invariata non chiede nulla — la maschera la manda a ogni salvataggio', async () => {
      arrangeModificaConRuoloCliente();
      await service.update(
        tenantId,
        'sup-1',
        { paymentTerms: '60 gg', alsoCustomer: true },
        soloFornitori,
      );
      expect(prisma.supplier.update).toHaveBeenCalled();
      // Riallineamento idempotente dello stesso stato: nessun cambio di ruolo.
      expect(customers.setCustomerRoleForSupplier).toHaveBeenCalledWith(tenantId, 'sup-1', true);
    });

    it('modifica: con «Gestire clienti» la disattivazione del ruolo passa', async () => {
      arrangeModificaConRuoloCliente();
      await service.update(tenantId, 'sup-1', { alsoCustomer: false }, ancheClienti);
      expect(customers.setCustomerRoleForSupplier).toHaveBeenCalledWith(tenantId, 'sup-1', false);
    });

    it('senza utente in contesto non si decide: le chiamate interne restano intatte', async () => {
      arrangeCreazione();
      const chiamataInterna: UserProfileDto | undefined = undefined;
      await service.create(tenantId, { name: 'Fornitore', alsoCustomer: true }, chiamataInterna);
      expect(customers.setCustomerRoleForSupplier).toHaveBeenCalledWith(tenantId, 'sup-1', true);
    });
  });

  /**
   * Perché questo blocco esiste — «Visualizza costi d'acquisto»
   * (`catalog.view_purchase_costs`, §permessi) non è un mascheramento
   * cosmetico: l'ultimo prezzo d'acquisto non deve PROPRIO entrare nella
   * risposta dell'API, perché toglierlo solo dalla UI lo lascerebbe leggibile
   * nel traffico di rete. E sono due strade distinte verso lo stesso dato — la
   * scheda fornitore e la scheda articolo — cioè esattamente la coppia in cui
   * una `include` allargata, un campo aggiunto o un `map` riscritto in UNA sola
   * delle due rimette il costo nel payload senza far diventare rosso niente: il
   * permesso smetterebbe di funzionare in silenzio, e il titolare lo scoprirebbe
   * solo quando un dipendente gli racconta quanto paga la merce.
   */
  describe("costi d'acquisto nei collegamenti variante-fornitore", () => {
    const PREZZO_ACQUISTO_LINK_1 = 1234;
    const PREZZO_ACQUISTO_LINK_2 = 5600;

    // Stesso scenario, stesso ruolo: i due utenti differiscono per UNA sola
    // chiave, così il test dimostra che è il permesso a decidere, non il ruolo.
    const permessiCommesso = testClerkUser().permissions;
    const senzaPermesso = testClerkUser();
    const conPermesso = testClerkUser({
      permissions: [...permessiCommesso, TenantPermission.CatalogViewPurchaseCosts],
    });
    // Titolare con l'elenco permessi VUOTO: l'accesso pieno viene dal ruolo
    // (`hasFullTenantAccess`), non dall'array — che per lui resta vuoto apposta.
    const titolare = testOwnerUser({ permissions: [] });

    function variantLinkRawRow(overrides: Record<string, unknown> = {}) {
      return {
        id: 'link-1',
        tenantId,
        supplierId: 'sup-1',
        variantId: 'var-1',
        supplierSku: 'FORN-AB-01',
        isPreferred: true,
        lastPurchasePriceMinor: PREZZO_ACQUISTO_LINK_1,
        minOrderQuantity: 6,
        currency: 'EUR',
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        supplier: {
          id: 'sup-1',
          code: '0001',
          party: { companyName: 'Fornitore', firstName: null, lastName: null },
        },
        variant: {
          id: 'var-1',
          sku: 'SKU-1',
          product: { id: 'prod-1', name: 'Maglietta' },
        },
        ...overrides,
      };
    }

    /** Due righe: una maschera applicata solo alla prima non deve passare. */
    function arrangeDueCollegamenti(): void {
      prisma.product.findFirst.mockResolvedValue({ id: 'prod-1' });
      prisma.supplierVariantLink.findMany.mockResolvedValue([
        variantLinkRawRow(),
        variantLinkRawRow({
          id: 'link-2',
          supplierId: 'sup-2',
          variantId: 'var-2',
          lastPurchasePriceMinor: PREZZO_ACQUISTO_LINK_2,
          supplier: {
            id: 'sup-2',
            code: '0002',
            party: { companyName: 'Altro Fornitore', firstName: null, lastName: null },
          },
          variant: { id: 'var-2', sku: 'SKU-2', product: { id: 'prod-1', name: 'Maglietta' } },
        }),
      ]);
    }

    function costi(rows: readonly { lastPurchasePriceMinor: unknown }[]): unknown[] {
      return rows.map((row) => row.lastPurchasePriceMinor);
    }

    it("con il permesso l'ultimo prezzo d'acquisto arriva col suo valore (scheda fornitore)", async () => {
      arrangeDueCollegamenti();
      const rows = await service.listVariantLinksBySupplier(tenantId, 'sup-1', conPermesso);
      expect(costi(rows)).toEqual([PREZZO_ACQUISTO_LINK_1, PREZZO_ACQUISTO_LINK_2]);
    });

    it("senza il permesso i costi d'acquisto non entrano nella risposta (scheda fornitore)", async () => {
      arrangeDueCollegamenti();
      const rows = await service.listVariantLinksBySupplier(tenantId, 'sup-1', senzaPermesso);
      // null, non 0: uno zero sarebbe un costo DICHIARATO, e mentirebbe.
      expect(costi(rows)).toEqual([null, null]);
      expect(rows[0]!.lastPurchasePriceMinor).toBeNull();
      // Il campo resta nel payload (nullo), non sparisce: è il contratto attuale.
      expect(Object.hasOwn(rows[0]!, 'lastPurchasePriceMinor')).toBe(true);
    });

    it("con il permesso l'ultimo prezzo d'acquisto arriva col suo valore (scheda articolo)", async () => {
      arrangeDueCollegamenti();
      const rows = await service.listVariantLinksByProduct(tenantId, 'prod-1', conPermesso);
      expect(costi(rows)).toEqual([PREZZO_ACQUISTO_LINK_1, PREZZO_ACQUISTO_LINK_2]);
    });

    it("senza il permesso i costi d'acquisto non entrano nella risposta (scheda articolo)", async () => {
      arrangeDueCollegamenti();
      const rows = await service.listVariantLinksByProduct(tenantId, 'prod-1', senzaPermesso);
      expect(costi(rows)).toEqual([null, null]);
      expect(rows[0]!.lastPurchasePriceMinor).toBeNull();
      expect(Object.hasOwn(rows[0]!, 'lastPurchasePriceMinor')).toBe(true);
    });

    it('la maschera azzera solo il costo: il resto del collegamento resta intatto', async () => {
      arrangeDueCollegamenti();
      const rows = await service.listVariantLinksBySupplier(tenantId, 'sup-1', senzaPermesso);
      expect(rows[0]).toMatchObject({
        id: 'link-1',
        supplierSku: 'FORN-AB-01',
        isPreferred: true,
        minOrderQuantity: 6,
        currency: 'EUR',
        lastPurchasePriceMinor: null,
        supplier: { id: 'sup-1', name: 'Fornitore', code: '0001' },
        variant: { id: 'var-1', sku: 'SKU-1', product: { id: 'prod-1', name: 'Maglietta' } },
      });
    });

    it("il titolare vede i costi d'acquisto anche con l'elenco permessi vuoto", async () => {
      arrangeDueCollegamenti();
      const perFornitore = await service.listVariantLinksBySupplier(tenantId, 'sup-1', titolare);
      const perArticolo = await service.listVariantLinksByProduct(tenantId, 'prod-1', titolare);
      expect(titolare.permissions).toEqual([]);
      expect(costi(perFornitore)).toEqual([PREZZO_ACQUISTO_LINK_1, PREZZO_ACQUISTO_LINK_2]);
      expect(costi(perArticolo)).toEqual([PREZZO_ACQUISTO_LINK_1, PREZZO_ACQUISTO_LINK_2]);
    });

    it('senza utente i costi restano fuori da entrambe le strade (si nega per difetto)', async () => {
      arrangeDueCollegamenti();
      const chiamanteAnonimo: UserProfileDto | undefined = undefined;
      const perFornitore = await service.listVariantLinksBySupplier(
        tenantId,
        'sup-1',
        chiamanteAnonimo,
      );
      const perArticolo = await service.listVariantLinksByProduct(
        tenantId,
        'prod-1',
        chiamanteAnonimo,
      );
      expect(costi(perFornitore)).toEqual([null, null]);
      expect(costi(perArticolo)).toEqual([null, null]);
    });

    /*
     * TERZA STRADA, non coperta dalla maschera — segnalata, NON corretta (la
     * decisione è di prodotto). `upsertVariantLink` non riceve affatto l'utente,
     * quindi non può mascherare nulla, e nella risposta rimanda il collegamento
     * intero. Siccome `lastPurchasePriceMinor` nel DTO è opzionale, un POST che
     * tocca solo il codice fornitore lascia il prezzo memorizzato com'è e lo
     * RESTITUISCE: chi ha `doc.supplier_order.manage` ma non
     * `catalog.view_purchase_costs` legge dalla scrittura il costo che la GET
     * gemella (`SUPPLIERS_LOOKUP_PERMISSIONS`, stesso utente) gli nega.
     *
     * Il test qui sotto è stato eseguito e PASSA così com'è: è la prova del
     * difetto, non un test rosso da sistemare. Va riattivato quando si decide
     * se quella risposta debba essere mascherata (allora il metodo deve
     * ricevere l'utente) oppure se l'accesso sia voluto per chi gestisce gli
     * ordini fornitore — nel qual caso l'asserzione resta questa, ma diventa
     * una regola dichiarata invece di una dimenticanza.
     *
     * it("la scrittura di un collegamento rimanda il costo memorizzato anche a chi non può vederlo", async () => {
     *   prisma.supplier.findFirst.mockResolvedValue(supplierRow());
     *   prisma.productVariant.findFirst.mockResolvedValue({ id: 'var-1' });
     *   prisma.supplierVariantLink.upsert.mockResolvedValue(variantLinkRawRow());
     *   const link = await service.upsertVariantLink(tenantId, {
     *     supplierId: 'sup-1',
     *     variantId: 'var-1',
     *   });
     *   expect(link.lastPurchasePriceMinor).toBe(PREZZO_ACQUISTO_LINK_1);
     * });
     */
  });
});
