import { NotFoundException } from '@nestjs/common';
import {
  DocumentStatus,
  DocumentType,
  MovementOrigin,
  StockMovementType,
  UserRole,
} from '@prisma/client';
import { describe, expect, it } from 'vitest';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import type { ChannelSyncFacade } from '../channels/channel-sync.facade';
import type { DocumentSettingsService } from '../documents/document-settings.service';
import type { PrismaService } from '../prisma/prisma.service';

import { StoreSalesService } from './store-sales.service';

/**
 * Test cassa negozio: movimenti collegati per riga senza doppi scarichi,
 * reso collegato con carico solo per la merce vendibile e rollback
 * transazionale senza saldi parziali. Policy post-audit §3: la quantità
 * insufficiente NON blocca mai la vendita — Giacenza e Disponibile possono
 * diventare negative e l'operazione viene sempre registrata.
 *
 * Fake Prisma in-memory con snapshot/restore nella $transaction, così i test
 * verificano i saldi finali reali (Giacenza, Impegnata, Disponibile) e i
 * collegamenti documento → movimento, non solo le chiamate.
 */

const TENANT = 't1';
const LOCATION = 'loc-1';
const VARIANT_A = 'var-a';
const VARIANT_B = 'var-b';

interface FakeLevel {
  tenantId: string;
  variantId: string;
  locationId: string;
  onHand: number;
  committed: number;
  available: number;
}

interface FakeDocumentLine {
  id: string;
  tenantId: string;
  lineNumber: number;
  variantId: string | null;
  sku: string | null;
  description: string;
  quantity: number;
  unitPriceMinor: number;
  loadsStock: boolean;
  [key: string]: unknown;
}

interface FakeDocument {
  id: string;
  tenantId: string;
  type: DocumentType;
  status: DocumentStatus;
  reference: string | null;
  documentDate: Date;
  totalMinor: number;
  currency: string;
  customerName: string | null;
  locationId: string | null;
  paymentMethod: string | null;
  sourceDocumentId: string | null;
  internalComment: string | null;
  createdAt: Date;
  lines: FakeDocumentLine[];
  [key: string]: unknown;
}

interface FakeMovement {
  tenantId: string;
  type: StockMovementType;
  origin: MovementOrigin;
  variantId: string;
  sku: string;
  locationId: string;
  quantity: number;
  reason: string;
  sourceDocumentType: DocumentType | null;
  sourceDocumentId: string | null;
  sourceLineId: string | null;
  createdByName: string;
}

interface FakeDb {
  levels: FakeLevel[];
  documents: FakeDocument[];
  movements: FakeMovement[];
  sequences: Map<string, number>;
  idCounter: number;
  failNextMovementCreate: boolean;
}

function createDb(): FakeDb {
  return {
    levels: [
      {
        tenantId: TENANT,
        variantId: VARIANT_A,
        locationId: LOCATION,
        onHand: 10,
        committed: 2,
        available: 8,
      },
      {
        tenantId: TENANT,
        variantId: VARIANT_B,
        locationId: LOCATION,
        onHand: 3,
        committed: 3,
        available: 0,
      },
    ],
    documents: [],
    movements: [],
    sequences: new Map(),
    idCounter: 0,
    failNextMovementCreate: false,
  };
}

function levelOf(db: FakeDb, variantId: string): FakeLevel {
  const level = db.levels.find(
    (entry) => entry.variantId === variantId && entry.locationId === LOCATION,
  );
  if (!level) {
    throw new Error(`Livello mancante per ${variantId}`);
  }
  return level;
}

const VARIANTS: Record<string, { sku: string; productName: string }> = {
  [VARIANT_A]: { sku: 'SKU-A', productName: 'T-shirt' },
  [VARIANT_B]: { sku: 'SKU-B', productName: 'Felpa' },
};

function createFakePrisma(db: FakeDb): PrismaService {
  const client = {
    location: {
      findFirst: ({ where }: { where: { id: string } }) =>
        Promise.resolve(where.id === LOCATION ? { id: LOCATION } : null),
    },
    productVariant: {
      findMany: ({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(
          where.id.in
            .filter((id) => VARIANTS[id])
            .map((id) => ({
              id,
              sku: VARIANTS[id]!.sku,
              barcode: null,
              optionValues: [],
              product: {
                name: VARIANTS[id]!.productName,
                defaultVatCodeId: null,
              },
            })),
        ),
    },
    customer: {
      findFirst: () => Promise.resolve(null),
    },
    inventoryLevel: {
      findMany: ({
        where,
      }: {
        where: { variantId: { in: string[] }; locationId: string };
      }) =>
        Promise.resolve(
          db.levels
            .filter(
              (level) =>
                level.locationId === where.locationId &&
                where.variantId.in.includes(level.variantId),
            )
            .map((level) => ({ ...level })),
        ),
      findUnique: ({
        where,
      }: {
        where: { variantId_locationId: { variantId: string; locationId: string } };
      }) => {
        const found = db.levels.find(
          (level) =>
            level.variantId === where.variantId_locationId.variantId &&
            level.locationId === where.variantId_locationId.locationId,
        );
        return Promise.resolve(found ? { ...found } : null);
      },
      updateMany: ({
        where,
        data,
      }: {
        where: {
          variantId: string;
          locationId: string;
          available?: { gte: number };
        };
        data: {
          onHand: { increment: number };
          available: { increment: number };
        };
      }) => {
        const matches = db.levels.filter(
          (level) =>
            level.variantId === where.variantId &&
            level.locationId === where.locationId &&
            (where.available === undefined || level.available >= where.available.gte),
        );
        for (const level of matches) {
          level.onHand += data.onHand.increment;
          level.available += data.available.increment;
        }
        return Promise.resolve({ count: matches.length });
      },
      upsert: ({
        where,
        create,
        update,
      }: {
        where: { variantId_locationId: { variantId: string; locationId: string } };
        create: Partial<FakeLevel> & { tenantId: string; variantId: string; locationId: string };
        update: { onHand?: { increment: number }; available?: { increment: number } };
      }) => {
        const found = db.levels.find(
          (level) =>
            level.variantId === where.variantId_locationId.variantId &&
            level.locationId === where.variantId_locationId.locationId,
        );
        if (found) {
          found.onHand += update.onHand?.increment ?? 0;
          found.available += update.available?.increment ?? 0;
          return Promise.resolve({ ...found });
        }
        const created: FakeLevel = {
          onHand: 0,
          committed: 0,
          available: 0,
          ...create,
        };
        db.levels.push(created);
        return Promise.resolve({ ...created });
      },
    },
    documentSequence: {
      upsert: ({
        where,
      }: {
        where: {
          tenantId_type_series_year: {
            type: DocumentType;
            series: string;
            year: number;
          };
        };
      }) => {
        const key = `${where.tenantId_type_series_year.type}:${where.tenantId_type_series_year.series}:${where.tenantId_type_series_year.year}`;
        const next = (db.sequences.get(key) ?? 0) + 1;
        db.sequences.set(key, next);
        return Promise.resolve({ lastNumber: next });
      },
    },
    document: {
      create: ({
        data,
      }: {
        data: Record<string, unknown> & {
          lines: { create: Record<string, unknown>[] };
        };
      }) => {
        db.idCounter += 1;
        const docId = `doc-${db.idCounter}`;
        const lines: FakeDocumentLine[] = data.lines.create.map((line) => {
          db.idCounter += 1;
          return {
            ...line,
            id: `line-${db.idCounter}`,
            loadsStock: (line['loadsStock'] as boolean | undefined) ?? true,
          } as FakeDocumentLine;
        });
        const doc: FakeDocument = {
          ...(data as unknown as FakeDocument),
          id: docId,
          createdAt: new Date(),
          lines,
        };
        db.documents.push(doc);
        return Promise.resolve({ ...doc, lines: lines.map((line) => ({ ...line })) });
      },
      findFirst: ({
        where,
      }: {
        where: { id: string; tenantId: string; type: DocumentType };
      }) => {
        const found = db.documents.find(
          (doc) =>
            doc.id === where.id && doc.tenantId === where.tenantId && doc.type === where.type,
        );
        return Promise.resolve(found ? { reference: found.reference } : null);
      },
      findMany: () => Promise.resolve([]),
    },
    stockMovement: {
      create: ({ data }: { data: FakeMovement }) => {
        if (db.failNextMovementCreate) {
          db.failNextMovementCreate = false;
          return Promise.reject(new Error('Errore simulato in stockMovement.create'));
        }
        db.movements.push({ ...data });
        return Promise.resolve({ ...data });
      },
    },
    tenantFeatureSettings: {
      findUnique: () => Promise.resolve({ defaultVatCodeId: null }),
    },
    vatCode: {
      findMany: () => Promise.resolve([]),
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const snapshot = structuredClone({
        levels: db.levels,
        documents: db.documents,
        movements: db.movements,
        sequences: [...db.sequences.entries()],
      });
      try {
        return await fn(client);
      } catch (error) {
        db.levels = snapshot.levels;
        db.documents = snapshot.documents;
        db.movements = snapshot.movements;
        db.sequences = new Map(snapshot.sequences);
        throw error;
      }
    },
  };
  return client as unknown as PrismaService;
}

function createSettings(): DocumentSettingsService {
  return {
    getResolved: (_tenantId: string, type: DocumentType) =>
      Promise.resolve({
        type,
        enabled: true,
        printTitle:
          type === DocumentType.store_sale ? 'Vendita in negozio' : 'Reso vendita negozio',
        autoNumbering: true,
        numberPrefix: type === DocumentType.store_sale ? 'VN' : 'RN',
        defaultSeries: 'A',
        blockAfterConfirm: true,
        pricesIncludeVat: true,
        defaultNotes: null,
      }),
  } as unknown as DocumentSettingsService;
}

function createChannelSync(pushed: string[]): ChannelSyncFacade {
  return {
    pushInventoryLevels: (_tenantId: string, variantId: string) => {
      pushed.push(variantId);
      return Promise.resolve();
    },
  } as unknown as ChannelSyncFacade;
}

const user: UserProfileDto = {
  id: 'u1',
  tenantId: TENANT,
  tenantName: 'Test',
  tenantChannelProfile: 'shopify',
  email: 'a@test.it',
  displayName: 'Mario Rossi',
  avatarUrl: null,
  role: UserRole.owner,
  storeIds: [],
  isActive: true,
  isPlatformAdmin: false,
  assignedLocationId: null,
  assignedLocationName: null,
  permissions: [],
  createdAt: '',
  updatedAt: '',
} as unknown as UserProfileDto;

function createService(db: FakeDb): { service: StoreSalesService; pushed: string[] } {
  const pushed: string[] = [];
  const service = new StoreSalesService(
    createFakePrisma(db),
    createSettings(),
    createChannelSync(pushed),
  );
  return { service, pushed };
}

describe('StoreSalesService (fase 3 §12)', () => {
  it('Concludi vendita: documento confermato, un movimento sale per riga, Giacenza e Disponibile diminuite, Impegnata invariata', async () => {
    const db = createDb();
    const { service } = createService(db);

    const result = await service.createSale(
      TENANT,
      {
        locationId: LOCATION,
        paymentMethod: 'cash',
        lines: [{ variantId: VARIANT_A, quantity: 2, unitPriceMinor: 2990 }],
      },
      user,
    );

    expect(result.reference).toBe('VN-' + String(new Date().getFullYear()) + '-0001');
    expect(result.totalMinor).toBe(5980);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]!.remainingAvailable).toBe(6);

    const level = levelOf(db, VARIANT_A);
    expect(level.onHand).toBe(8);
    expect(level.committed).toBe(2);
    expect(level.available).toBe(6);

    const doc = db.documents[0]!;
    expect(doc.type).toBe(DocumentType.store_sale);
    expect(doc.status).toBe(DocumentStatus.confirmed);
    expect(doc.paymentMethod).toBe('cash');
    expect(doc.locationId).toBe(LOCATION);

    // Un solo movimento, collegato a documento e riga (niente doppi scarichi).
    expect(db.movements).toHaveLength(1);
    const movement = db.movements[0]!;
    expect(movement.type).toBe(StockMovementType.sale);
    expect(movement.origin).toBe(MovementOrigin.vestiflow_pos);
    expect(movement.quantity).toBe(2);
    expect(movement.sourceDocumentType).toBe(DocumentType.store_sale);
    expect(movement.sourceDocumentId).toBe(doc.id);
    expect(movement.sourceLineId).toBe(doc.lines[0]!.id);
    expect(movement.createdByName).toBe('Mario Rossi');
  });

  it('Policy §3: Disponibile 0 NON blocca la vendita — registrata con Disponibile negativa', async () => {
    const db = createDb();
    const { service } = createService(db);

    // VARIANT_B: giacenza 3, impegnata 3, disponibile 0 → la vendita passa comunque.
    const result = await service.createSale(
      TENANT,
      {
        locationId: LOCATION,
        paymentMethod: 'card',
        lines: [{ variantId: VARIANT_B, quantity: 1, unitPriceMinor: 4990 }],
      },
      user,
    );

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]!.remainingAvailable).toBe(-1);

    const level = levelOf(db, VARIANT_B);
    expect(level.onHand).toBe(2);
    expect(level.committed).toBe(3);
    expect(level.available).toBe(-1);
    // Documento e movimento registrati normalmente (nessun 409/422).
    expect(db.documents).toHaveLength(1);
    expect(db.movements).toHaveLength(1);
    expect(db.movements[0]!.quantity).toBe(1);
  });

  it('Policy §3: vendita oltre la Disponibile con giacenza positiva registrata (Disponibile può superare in negativo la Impegnata)', async () => {
    const db = createDb();
    const { service } = createService(db);

    // VARIANT_A: giacenza 10, impegnata 2, disponibile 8 → 9 pezzi venduti comunque.
    await service.createSale(
      TENANT,
      {
        locationId: LOCATION,
        paymentMethod: 'cash',
        lines: [{ variantId: VARIANT_A, quantity: 9, unitPriceMinor: 2990 }],
      },
      user,
    );

    const level = levelOf(db, VARIANT_A);
    expect(level.onHand).toBe(1);
    expect(level.committed).toBe(2);
    expect(level.available).toBe(-1);
    expect(db.documents).toHaveLength(1);
    expect(db.movements).toHaveLength(1);
  });

  it('Test B §23: vendita oltre la Giacenza registrata — Giacenza e Disponibile negative, Impegnata invariata', async () => {
    const db = createDb();
    const { service } = createService(db);

    // VARIANT_B: giacenza 3 → vendita di 5 pezzi: onHand -2, available -5.
    const result = await service.createSale(
      TENANT,
      {
        locationId: LOCATION,
        paymentMethod: 'cash',
        lines: [{ variantId: VARIANT_B, quantity: 5, unitPriceMinor: 4990 }],
      },
      user,
    );

    expect(result.lines[0]!.remainingAvailable).toBe(-5);

    const level = levelOf(db, VARIANT_B);
    expect(level.onHand).toBe(-2);
    expect(level.committed).toBe(3);
    expect(level.available).toBe(-5);
    expect(db.movements).toHaveLength(1);
  });

  it('Reso collegato: carico solo per le righe vendibili, merce non vendibile documentata senza movimento', async () => {
    const db = createDb();
    const { service } = createService(db);

    const sale = await service.createSale(
      TENANT,
      {
        locationId: LOCATION,
        paymentMethod: 'cash',
        lines: [
          { variantId: VARIANT_A, quantity: 2, unitPriceMinor: 2990 },
          { variantId: VARIANT_B, quantity: 0, unitPriceMinor: 0 },
        ].filter((line) => line.quantity > 0),
      },
      user,
    );
    expect(levelOf(db, VARIANT_A).onHand).toBe(8);
    const movementsAfterSale = db.movements.length;

    const returnResult = await service.createReturn(
      TENANT,
      {
        locationId: LOCATION,
        saleDocumentId: sale.id,
        reason: 'Taglia errata',
        lines: [
          { variantId: VARIANT_A, quantity: 1, restockable: true, unitPriceMinor: 2990 },
          { variantId: VARIANT_A, quantity: 1, restockable: false, unitPriceMinor: 2990 },
        ],
      },
      user,
    );

    expect(returnResult.reference).toBe('RN-' + String(new Date().getFullYear()) + '-0001');

    // Solo il pezzo vendibile rientra in Giacenza/Disponibile.
    const level = levelOf(db, VARIANT_A);
    expect(level.onHand).toBe(9);
    expect(level.committed).toBe(2);
    expect(level.available).toBe(7);

    const returnMovements = db.movements.slice(movementsAfterSale);
    expect(returnMovements).toHaveLength(1);
    expect(returnMovements[0]!.type).toBe(StockMovementType.return);
    expect(returnMovements[0]!.quantity).toBe(1);
    expect(returnMovements[0]!.reason).toContain(sale.reference);
    expect(returnMovements[0]!.reason).toContain('Taglia errata');

    const returnDoc = db.documents.find((doc) => doc.type === DocumentType.store_return)!;
    expect(returnDoc.sourceDocumentId).toBe(sale.id);
    expect(returnDoc.status).toBe(DocumentStatus.confirmed);
    // La riga non vendibile resta documentata (con descrizione dedicata).
    expect(returnDoc.lines).toHaveLength(2);
    expect(returnDoc.lines.some((line) => line.description.includes('non vendibile'))).toBe(true);
  });

  it('Reso con vendita origine inesistente: NotFoundException e nessun effetto', async () => {
    const db = createDb();
    const { service } = createService(db);

    await expect(
      service.createReturn(
        TENANT,
        {
          locationId: LOCATION,
          saleDocumentId: 'doc-mancante',
          reason: 'Difettoso',
          lines: [{ variantId: VARIANT_A, quantity: 1, restockable: true }],
        },
        user,
      ),
    ).rejects.toThrowError(NotFoundException);

    expect(db.documents).toHaveLength(0);
    expect(db.movements).toHaveLength(0);
    expect(levelOf(db, VARIANT_A).onHand).toBe(10);
  });

  it('Fallimento transazionale: errore sul movimento ⇒ rollback completo, nessun saldo parziale né documento', async () => {
    const db = createDb();
    const { service } = createService(db);
    db.failNextMovementCreate = true;

    await expect(
      service.createSale(
        TENANT,
        {
          locationId: LOCATION,
          paymentMethod: 'cash',
          lines: [{ variantId: VARIANT_A, quantity: 2, unitPriceMinor: 2990 }],
        },
        user,
      ),
    ).rejects.toThrowError('Errore simulato in stockMovement.create');

    const level = levelOf(db, VARIANT_A);
    expect(level.onHand).toBe(10);
    expect(level.committed).toBe(2);
    expect(level.available).toBe(8);
    expect(db.documents).toHaveLength(0);
    expect(db.movements).toHaveLength(0);
  });

  it('Push inventario canali dopo la vendita (solo varianti movimentate)', async () => {
    const db = createDb();
    const { service, pushed } = createService(db);

    await service.createSale(
      TENANT,
      {
        locationId: LOCATION,
        paymentMethod: 'other',
        lines: [{ variantId: VARIANT_A, quantity: 1, unitPriceMinor: 2990 }],
      },
      user,
    );

    // Push asincrono: attende il microtask successivo.
    await Promise.resolve();
    expect(pushed).toEqual([VARIANT_A]);
  });
});
