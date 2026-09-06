import {
  DocumentType,
  MovementOrigin,
  StockMovementType,
  TenantChannelProfile,
} from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TenantPermission } from '../auth/tenant-permission.constants';
import { testClerkUser, testOwnerUser } from '../test/fixtures/user-profile.fixture';
import { BusinessAnalyticsService } from './business-analytics.service';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import type { PrismaService } from '../prisma/prisma.service';
import type { BusinessAnalyticsQueryDto } from './dto/business-analytics-query.dto';
import type { BusinessAnalyticsSummaryDto } from './dto/business-analytics-summary.dto';

/**
 * «Visualizza costi d'acquisto» applicato AL REPORT — il cablaggio, non la
 * maschera.
 *
 * `maskCostSensitiveSummary` ha già il suo spec come funzione pura: quello
 * dimostra che la maschera azzera i campi giusti, non che qualcuno la chiami.
 * Il punto scoperto era l'unica riga che le dà valore — `return
 * showPurchaseCosts ? summary : maskCostSensitiveSummary(summary)` in
 * `business-analytics.service.ts` — e senza un test lì la maschera può restare
 * perfetta mentre smette di essere applicata: cancellare il ternario, invertire
 * la condizione, o aggiungere al DTO un campo derivato dal costo che la
 * maschera non conosce. Nessuno di questi tre casi rompe una compilazione né
 * arrossa un test della funzione pura, e il costo d'acquisto torna in chiaro
 * nella risposta HTTP — dove non basta nasconderlo nella UI.
 *
 * Per questo i test qui sotto guardano SOLO ciò che esce da `getSummary()`, con
 * lo stesso scenario e due utenti che differiscono per una chiave sola.
 */
describe('BusinessAnalyticsService — il permesso sui costi decide cosa esce dalla risposta', () => {
  const tenantId = 'tenant-1';

  /** Periodo fisso: il report non deve dipendere dal giorno in cui gira il test. */
  const query: BusinessAnalyticsQueryDto = {
    period: 'custom',
    from: '2026-07-01',
    to: '2026-07-31',
  };

  // Valori scelti perché IRRIPETIBILI altrove nel payload: se uno di questi
  // numeri compare nella risposta dell'utente senza permesso, è arrivato dal
  // costo d'acquisto e da nient'altro.
  const COSTO_MOVIMENTO_MINOR = 4_001;
  const COSTO_VARIANTE_MINOR = 2_003;
  const RICAVO_RIGA_MINOR = 10_000;
  const PREZZO_VENDITA_MINOR = 5_000;
  const GIACENZA_DISPONIBILE = 10;

  // Derivati attesi quando il costo è visibile.
  const MARGINE_LORDO_MINOR = RICAVO_RIGA_MINOR - COSTO_MOVIMENTO_MINOR; // 5.999
  const VALORE_MAGAZZINO_MINOR = GIACENZA_DISPONIBILE * PREZZO_VENDITA_MINOR; // 50.000
  const COSTO_MAGAZZINO_MINOR = GIACENZA_DISPONIBILE * COSTO_VARIANTE_MINOR; // 20.030
  const MARGINE_MAGAZZINO_MINOR = VALORE_MAGAZZINO_MINOR - COSTO_MAGAZZINO_MINOR; // 29.970

  const movimentoVendita = {
    type: StockMovementType.sale,
    origin: MovementOrigin.vestiflow_pos,
    quantity: 2,
    sku: 'SKU-1',
    variantId: 'var-1',
    totalCostMinor: COSTO_MOVIMENTO_MINOR,
    sourceDocumentType: DocumentType.store_sale,
    sourceDocumentId: 'doc-1',
    sourceLineId: 'line-1',
    createdAt: new Date('2026-07-15T10:00:00.000Z'),
    variant: { product: { name: 'Maglietta test' } },
  };

  let prisma: {
    tenant: { findUnique: ReturnType<typeof vi.fn> };
    location: { findMany: ReturnType<typeof vi.fn> };
    stockMovement: { findMany: ReturnType<typeof vi.fn> };
    inventoryLevel: {
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      fields: { minThreshold: string };
    };
    documentLine: { findMany: ReturnType<typeof vi.fn> };
    onlineSaleLine: { findMany: ReturnType<typeof vi.fn> };
  };
  let service: BusinessAnalyticsService;

  /**
   * I due utenti differiscono per UNA chiave: tutto il resto (ruolo, sedi,
   * sezione report) è identico, così l'unica spiegazione possibile di una
   * differenza nella risposta è il permesso sui costi.
   */
  const PERMESSI_BASE = [TenantPermission.SectionReports];
  const clerkSenzaCosti = (): UserProfileDto =>
    testClerkUser({ hasAllLocationsAccess: true, permissions: [...PERMESSI_BASE] });
  const clerkConCosti = (): UserProfileDto =>
    testClerkUser({
      hasAllLocationsAccess: true,
      permissions: [...PERMESSI_BASE, TenantPermission.CatalogViewPurchaseCosts],
    });

  beforeEach(() => {
    // `daysInCurrentMonth()` legge l'orologio: senza data fissa la previsione
    // cambierebbe di mese in mese e il confronto fra le due risposte
    // diventerebbe una lotteria.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-11T09:00:00.000Z'));

    prisma = {
      tenant: {
        findUnique: vi.fn().mockResolvedValue({ channelProfile: TenantChannelProfile.gestionale }),
      },
      location: { findMany: vi.fn().mockResolvedValue([{ id: 'loc-1' }]) },
      stockMovement: {
        // Il servizio interroga due volte lo stesso modello (periodo corrente e
        // precedente): il finto filtra per data invece di contare le chiamate,
        // così il test non dipende dall'ordine interno delle Promise.
        findMany: vi.fn(({ where }: { where: { createdAt: { gte: Date; lte: Date } } }) =>
          Promise.resolve(
            [movimentoVendita].filter(
              (row) => row.createdAt >= where.createdAt.gte && row.createdAt <= where.createdAt.lte,
            ),
          ),
        ),
      },
      inventoryLevel: {
        findMany: vi.fn().mockResolvedValue([
          {
            available: GIACENZA_DISPONIBILE,
            variant: {
              sellingPriceMinor: PREZZO_VENDITA_MINOR,
              purchasePriceMinor: COSTO_VARIANTE_MINOR,
            },
          },
        ]),
        count: vi.fn().mockResolvedValue(1),
        // Il servizio confronta `available` con il campo `minThreshold` via
        // `prisma.inventoryLevel.fields`: al finto basta esporlo.
        fields: { minThreshold: 'minThreshold' },
      },
      documentLine: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: 'line-1', lineGrossTotalMinor: RICAVO_RIGA_MINOR }]),
      },
      onlineSaleLine: { findMany: vi.fn().mockResolvedValue([]) },
    };

    service = new BusinessAnalyticsService(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Tutti i numeri del payload, a qualsiasi profondità. */
  function numeriIn(value: unknown, acc: number[] = []): number[] {
    if (typeof value === 'number') {
      acc.push(value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        numeriIn(item, acc);
      }
    } else if (value !== null && typeof value === 'object') {
      for (const item of Object.values(value)) {
        numeriIn(item, acc);
      }
    }
    return acc;
  }

  it('con il permesso il report porta margini e valorizzazione al costo reali', async () => {
    const summary = await service.getSummary(tenantId, query, clerkConCosti());

    expect(summary.margin).toEqual({
      grossMinor: MARGINE_LORDO_MINOR,
      grossPercent: 60,
    });
    expect(summary.inventory.stockCostMinor).toBe(COSTO_MAGAZZINO_MINOR);
    expect(summary.inventory.stockMarginMinor).toBe(MARGINE_MAGAZZINO_MINOR);
    expect(summary.inventory.stockMarginPercent).toBe(59.9);
  });

  it('senza il permesso i costi non entrano nella risposta', async () => {
    const summary = await service.getSummary(tenantId, query, clerkSenzaCosti());

    // Non «assenti» e non «zero»: il codice azzera il margine a `null` e la
    // copertura costi a 0 — l'asserzione ricalca quello, non un'intuizione.
    expect(summary.margin).toEqual({
      grossMinor: null,
      grossPercent: null,
    });
    expect(summary.inventory.stockCostMinor).toBeNull();
    expect(summary.inventory.stockMarginMinor).toBeNull();
    expect(summary.inventory.stockMarginPercent).toBeNull();
  });

  it('senza il permesso nessun numero del costo sopravvive in nessun campo del payload', async () => {
    const summary = await service.getSummary(tenantId, query, clerkSenzaCosti());
    const numeri = numeriIn(summary);

    // È la rete contro il campo NUOVO: se domani il report esporrà un altro
    // dato derivato dal costo e la maschera non lo coprirà, il valore comparirà
    // qui e questo test diventerà rosso — al posto del cliente che se ne accorge
    // guardando il traffico di rete.
    for (const vietato of [
      COSTO_MOVIMENTO_MINOR,
      COSTO_VARIANTE_MINOR,
      COSTO_MAGAZZINO_MINOR,
      MARGINE_LORDO_MINOR,
      MARGINE_MAGAZZINO_MINOR,
      59.9,
    ]) {
      expect(numeri).not.toContain(vietato);
    }
  });

  it('il mascheramento tocca i costi e nient’altro: il resto del report resta identico', async () => {
    const conCosti = await service.getSummary(tenantId, query, clerkConCosti());
    const senzaCosti = await service.getSummary(tenantId, query, clerkSenzaCosti());

    // Se qualcuno «mascherasse» restituendo il report vuoto, o si fermasse
    // prima dei calcoli, queste uguaglianze cadrebbero: il dipendente perde i
    // costi, non il report.
    expect(senzaCosti.revenue).toEqual(conCosti.revenue);
    expect(senzaCosti.sales).toEqual(conCosti.sales);
    expect(senzaCosti.forecast).toEqual(conCosti.forecast);
    expect(senzaCosti.channels).toEqual(conCosti.channels);
    expect(senzaCosti.topProducts).toEqual(conCosti.topProducts);
    expect(senzaCosti.dailyRevenue).toEqual(conCosti.dailyRevenue);
    expect(senzaCosti.inventory.stockValueMinor).toBe(VALORE_MAGAZZINO_MINOR);
    expect(senzaCosti.inventory.availableUnits).toBe(GIACENZA_DISPONIBILE);
    expect(senzaCosti.inventory.lowStockCount).toBe(1);
    expect(senzaCosti.revenue.totalMinor).toBe(RICAVO_RIGA_MINOR);
  });

  it('il titolare vede i costi anche con l’elenco permessi vuoto', async () => {
    const owner = testOwnerUser();
    expect(owner.permissions).toEqual([]);

    const summary = await service.getSummary(tenantId, query, owner);

    expect(summary.margin.grossMinor).toBe(MARGINE_LORDO_MINOR);
    expect(summary.inventory.stockCostMinor).toBe(COSTO_MAGAZZINO_MINOR);
    expect(summary.inventory.stockMarginMinor).toBe(MARGINE_MAGAZZINO_MINOR);
  });

  it('senza utente il servizio maschera comunque: l’assenza di profilo non è un permesso', async () => {
    // Documenta il comportamento reale di `canViewPurchaseCosts(undefined)`:
    // nessun utente = nessun permesso = maschera attiva. Vale per i consumatori
    // interni che chiamano il servizio senza profilo.
    const summary: BusinessAnalyticsSummaryDto = await service.getSummary(tenantId, query);

    expect(summary.margin.grossMinor).toBeNull();
    expect(summary.inventory.stockCostMinor).toBeNull();
  });
});
