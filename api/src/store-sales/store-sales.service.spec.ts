import { ForbiddenException } from '@nestjs/common';
import {
  DocumentStatus,
  DocumentType,
  MovementOrigin,
  StockMovementType,
  UserRole,
} from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { TenantPermission } from '../auth/tenant-permission.constants';
import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import type { ChannelSyncFacade } from '../channels/channel-sync.facade';
import type { DocumentSettingsService } from '../documents/document-settings.service';
import type { PrismaService } from '../prisma/prisma.service';

import { StoreSalesService } from './store-sales.service';

/**
 * Test vendita al banco: movimenti collegati per riga senza doppi scarichi,
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
/** Seconda sede, SOLO per i test T6 di autorizzazione: nessun altro test la usa. */
const LOCATION_B = 'loc-2';
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
  /** La riconciliazione aggiorna ed elimina PER ID: senza, il finto non regge. */
  id: string;
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
  externalRef?: string | null;
  unitCostMinor?: number | null;
  totalCostMinor?: number | null;
  createdAt?: Date;
}

/** I soli filtri che il codice sotto test usa sui movimenti. */
function matchMovement(m: FakeMovement, where: Record<string, unknown>): boolean {
  for (const [chiave, atteso] of Object.entries(where)) {
    const valore = (m as unknown as Record<string, unknown>)[chiave];
    if (atteso === null) {
      if (valore != null) return false;
      continue;
    }
    if (atteso && typeof atteso === 'object' && 'in' in atteso) {
      const ammessi = (atteso as { in: unknown[] }).in;
      if (!ammessi.includes(valore)) return false;
      continue;
    }
    if (valore !== atteso) return false;
  }
  return true;
}

interface FakeDb {
  levels: FakeLevel[];
  documents: FakeDocument[];
  movements: FakeMovement[];
  sequences: Map<string, number>;
  idCounter: number;
  failNextMovementCreate: boolean;
  /** Codice IVA aziendale predefinito (null = nessuna imposta sulle righe). */
  defaultVatCodeId: string | null;
  vatCodes: FakeVatCode[];
}

/** Codice IVA nella forma che serve al calcolo (aliquota + natura esposta). */
interface FakeVatCode {
  id: string;
  code: string;
  ratePercent: number;
  nonDeductiblePercent: number;
  calculationMode: 'standard';
  vatAffectsSupplierTotal: boolean;
  usageScope: 'sales';
  description: string;
  notes: null;
  nature: { key: string; label: string; officialCode: null };
}

const VAT_22: FakeVatCode = {
  id: 'vat-22',
  code: '22',
  ratePercent: 22,
  nonDeductiblePercent: 0,
  calculationMode: 'standard',
  vatAffectsSupplierTotal: true,
  usageScope: 'sales',
  description: 'Aliquota ordinaria',
  notes: null,
  nature: { key: 'ordinary', label: 'Ordinaria', officialCode: null },
};

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
    defaultVatCodeId: null,
    vatCodes: [],
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

/**
 * Costo d'acquisto della variante, DIVERSO dal prezzo di vendita usato nei
 * test: e' cio' che rende visibile se un costo viene derivato dal prezzo di
 * riga invece che congelato dall'anagrafica.
 */
const VARIANT_COSTS: Record<string, number> = {
  [VARIANT_A]: 1200,
  [VARIANT_B]: 400,
};

function createFakePrisma(db: FakeDb): PrismaService {
  const client = {
    location: {
      // LOCATION_B esiste SOLO per i test T6: attiva/licenziata come LOCATION,
      // nessun altro test la interroga.
      findFirst: ({ where }: { where: { id: string } }) =>
        Promise.resolve(where.id === LOCATION || where.id === LOCATION_B ? { id: where.id } : null),
      findMany: () => Promise.resolve([{ id: LOCATION }, { id: LOCATION_B }]),
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
              purchasePriceMinor: VARIANT_COSTS[id] ?? null,
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
      findMany: ({ where }: { where: { variantId: { in: string[] }; locationId: string } }) =>
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
    documentCounter: {
      findFirst: () => Promise.resolve(null),
      findMany: () => Promise.resolve([]),
    },
    document: {
      // Numerazione «massimo esistente + 1» (nessun documento nel fake db).
      aggregate: () => Promise.resolve({ _max: { number: null } }),
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
      findFirst: ({ where }: { where: { id: string; tenantId: string; type: DocumentType } }) => {
        const found = db.documents.find(
          (doc) =>
            doc.id === where.id && doc.tenantId === where.tenantId && doc.type === where.type,
        );
        // Il documento INTERO: il risalvataggio legge numero, serie, data e le
        // righe persistite per conservarle.
        return Promise.resolve(
          found ? { ...found, lines: found.lines.map((line) => ({ ...line })) } : null,
        );
      },
      update: ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const doc = db.documents.find((d) => d.id === where.id)!;
        Object.assign(doc, data);
        return Promise.resolve({ ...doc, lines: doc.lines.map((line) => ({ ...line })) });
      },
      findMany: ({
        where,
      }: {
        where: {
          tenantId: string;
          type: DocumentType;
          locationId?: string | { in: string[] };
        };
      }) =>
        Promise.resolve(
          db.documents.filter((doc) => {
            if (doc.tenantId !== where.tenantId || doc.type !== where.type) {
              return false;
            }
            if (where.locationId === undefined) {
              return true;
            }
            if (typeof where.locationId === 'string') {
              return doc.locationId === where.locationId;
            }
            return doc.locationId != null && where.locationId.in.includes(doc.locationId);
          }),
        ),
    },
    // L'upsert righe per id (`persistDocumentLinesByIdTx`) aggiorna, crea ed
    // elimina una riga per volta: il finto deve saperlo fare.
    documentLine: {
      updateMany: ({
        where,
        data,
      }: {
        where: { id: string; documentId: string; tenantId: string };
        data: Record<string, unknown>;
      }) => {
        const doc = db.documents.find((d) => d.id === where.documentId);
        const riga = doc?.lines.find((l) => l.id === where.id && l.tenantId === where.tenantId);
        if (!riga) {
          return Promise.resolve({ count: 0 });
        }
        Object.assign(riga, data);
        return Promise.resolve({ count: 1 });
      },
      create: ({ data }: { data: Record<string, unknown> }) => {
        const doc = db.documents.find((d) => d.id === data['documentId'])!;
        db.idCounter += 1;
        const riga = { ...data, id: `line-${db.idCounter}` } as unknown as FakeDocumentLine;
        doc.lines.push(riga);
        return Promise.resolve({ ...riga });
      },
      deleteMany: ({
        where,
      }: {
        where: { documentId: string; tenantId: string; id: { in: string[] } };
      }) => {
        const doc = db.documents.find((d) => d.id === where.documentId)!;
        const restano = doc.lines.filter((l) => !where.id.in.includes(l.id));
        const tolte = doc.lines.length - restano.length;
        doc.lines.splice(0, doc.lines.length, ...restano);
        return Promise.resolve({ count: tolte });
      },
    },
    stockMovement: {
      create: ({ data }: { data: FakeMovement }) => {
        if (db.failNextMovementCreate) {
          db.failNextMovementCreate = false;
          return Promise.reject(new Error('Errore simulato in stockMovement.create'));
        }
        const riga = { ...data, id: data.id ?? `mov-${db.movements.length + 1}` };
        db.movements.push(riga);
        return Promise.resolve({ ...riga });
      },
      // I tre metodi che la riconciliazione per differenza usa: legge i
      // movimenti gia' collegati, aggiorna in posto quello della riga cambiata,
      // elimina quello della riga sparita.
      findMany: ({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(db.movements.filter((m) => matchMovement(m, where)).map((m) => ({ ...m }))),
      update: ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const riga = db.movements.find((m) => m.id === where.id);
        if (!riga) {
          return Promise.reject(new Error('movimento inesistente: ' + where.id));
        }
        Object.assign(riga, data);
        return Promise.resolve({ ...riga });
      },
      delete: ({ where }: { where: { id: string } }) => {
        const i = db.movements.findIndex((m) => m.id === where.id);
        const [tolto] = db.movements.splice(i, 1);
        return Promise.resolve(tolto);
      },
      deleteMany: ({ where }: { where: Record<string, unknown> }) => {
        const restano = db.movements.filter((m) => !matchMovement(m, where));
        const tolti = db.movements.length - restano.length;
        db.movements.splice(0, db.movements.length, ...restano);
        return Promise.resolve({ count: tolti });
      },
      // Usato dal reso per leggere il costo congelato sulla vendita originale.
      findFirst: ({ where }: { where: Record<string, unknown> }) => {
        const type = where['type'] as { in?: string[] } | undefined;
        const match = db.movements.find(
          (movement) =>
            movement.tenantId === where['tenantId'] &&
            movement.sourceDocumentId === where['sourceDocumentId'] &&
            movement.variantId === where['variantId'] &&
            (type?.in ? type.in.includes(movement.type as string) : true),
        );
        return Promise.resolve(match ? { ...match } : null);
      },
    },
    tenantFeatureSettings: {
      findUnique: () => Promise.resolve({ defaultVatCodeId: db.defaultVatCodeId }),
    },
    vatCode: {
      findMany: ({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(db.vatCodes.filter((vatCode) => where.id.in.includes(vatCode.id))),
    },
    // Advisory lock sul contatore del documento: nel fake non serializza
    // niente, ma senza la mock la chiamata romperebbe vendita e reso.
    $queryRaw: () => Promise.resolve([]),
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
        printTitle: type === DocumentType.store_sale ? 'Vendita al banco' : 'Reso al banco',
        autoNumbering: true,
        numberPrefix: type === DocumentType.store_sale ? 'VN' : 'RN',
        defaultSeries: 'A',
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
  hasAllLocationsAccess: false,
  assignedLocationIds: [],
  assignedLocations: [],
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

    expect(result.reference).toBe('VN-0001');
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

  // Il prezzo che arriva dalla cassa è NETTO come ogni prezzo del gestionale:
  // l'IVA la calcola il server, non si scorpora da un lordo memorizzato.
  it('Il prezzo di riga è netto: IVA calcolata sopra, totale = netto + imposta', async () => {
    const db = createDb();
    db.defaultVatCodeId = VAT_22.id;
    db.vatCodes = [VAT_22];
    const { service } = createService(db);

    const result = await service.createSale(
      TENANT,
      {
        locationId: LOCATION,
        paymentMethod: 'cash',
        // 29,90 netti × 2 = 59,80 di imponibile; IVA 22% = 13,16; totale 72,96.
        lines: [{ variantId: VARIANT_A, quantity: 2, unitPriceMinor: 2990 }],
      },
      user,
    );

    expect(result.totalMinor).toBe(7296);

    const doc = db.documents[0]!;
    expect(doc['subtotalMinor']).toBe(5980);
    expect(doc['taxMinor']).toBe(1316);
    expect(doc['totalMinor']).toBe(7296);

    const line = doc.lines[0]!;
    // La riga conserva il netto digitato e porta imponibile, imposta e lordo.
    expect(line.unitPriceMinor).toBe(2990);
    expect(line['lineTotalMinor']).toBe(5980);
    expect(line['lineVatTotalMinor']).toBe(1316);
    expect(line['lineGrossTotalMinor']).toBe(7296);
  });

  it('Il reso restituisce imponibile e imposta della vendita, non un totale senza IVA', async () => {
    const db = createDb();
    db.defaultVatCodeId = VAT_22.id;
    db.vatCodes = [VAT_22];
    const { service } = createService(db);

    await service.createReturn(
      TENANT,
      {
        locationId: LOCATION,
        reason: 'Taglia errata',
        lines: [{ variantId: VARIANT_A, quantity: 1, restockable: true, unitPriceMinor: 2990 }],
      },
      user,
    );

    const doc = db.documents[0]!;
    expect(doc['subtotalMinor']).toBe(2990);
    expect(doc['taxMinor']).toBe(658);
    expect(doc['totalMinor']).toBe(3648);
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

  it('Reso: carico solo per le righe con la spunta attiva, le altre documentate senza movimento', async () => {
    const db = createDb();
    const { service } = createService(db);
    const movimentiPrima = db.movements.length;

    const returnResult = await service.createReturn(
      TENANT,
      {
        locationId: LOCATION,
        reason: 'Taglia errata',
        lines: [
          { variantId: VARIANT_A, quantity: 1, restockable: true, unitPriceMinor: 2990 },
          { variantId: VARIANT_A, quantity: 1, restockable: false, unitPriceMinor: 2990 },
        ],
      },
      user,
    );

    expect(returnResult.reference).toBe('RN-0001');

    // Solo la riga con la spunta attiva rientra in Giacenza/Disponibile.
    const level = levelOf(db, VARIANT_A);
    expect(level.onHand).toBe(11);
    expect(level.committed).toBe(2);
    expect(level.available).toBe(9);

    const returnMovements = db.movements.slice(movimentiPrima);
    expect(returnMovements).toHaveLength(1);
    expect(returnMovements[0]!.type).toBe(StockMovementType.return);
    expect(returnMovements[0]!.quantity).toBe(1);
    expect(returnMovements[0]!.origin).toBe(MovementOrigin.vestiflow_pos);
    // ⛔ Nessun riferimento a una vendita origine: il Reso e' autonomo (`11` A11).
    expect(returnMovements[0]!.reason).not.toMatch(/vendita VN-/);
    // Il documento porta comunque DUE righe: la seconda e' documentata, non movimentata.
    expect(db.documents.at(-1)!.lines).toHaveLength(2);
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

  // ── Vendita conclusa che si RIAPRE e si risalva (`11` A2) ─────────────────
  //
  // La modifica aggiorna PER DIFFERENZA: da 2 pezzi a 1 il movimento diventa
  // −1, e NON compare una rettifica. E' la regola di `regole-gestionale`
  // applicata a un tipo che ne era fuori, non una logica della cassa.

  async function vendita(db: FakeDb, righe: unknown[], id?: string) {
    const { service } = createService(db);
    return service.createSale(
      TENANT,
      { ...(id ? { id } : {}), locationId: LOCATION, paymentMethod: 'cash', lines: righe } as never,
      user,
    );
  }

  it('risalvataggio da 2 a 1: UN solo movimento, aggiornato in posto, e la giacenza torna di 1', async () => {
    const db = createDb();
    await vendita(db, [{ variantId: VARIANT_A, quantity: 2, unitPriceMinor: 2990 }]);
    const doc = db.documents[0]!;
    const movimentoPrima = db.movements[0]!;
    expect(levelOf(db, VARIANT_A).onHand).toBe(8);

    await vendita(
      db,
      [{ id: doc.lines[0]!.id, variantId: VARIANT_A, quantity: 1, unitPriceMinor: 2990 }],
      doc.id,
    );

    // ⛔ Un movimento solo: nessuna rettifica accodata.
    expect(db.movements).toHaveLength(1);
    const movimentoDopo = db.movements[0]!;
    expect(movimentoDopo.id).toBe(movimentoPrima.id);
    expect(movimentoDopo.quantity).toBe(1);
    // La giacenza si muove SOLO della differenza: 8 → 9, non 8 → 10 → 9.
    expect(levelOf(db, VARIANT_A).onHand).toBe(9);
    expect(db.documents).toHaveLength(1);
  });

  it('risalvataggio: numero, serie e data del documento restano quelli', async () => {
    const db = createDb();
    const primo = await vendita(db, [{ variantId: VARIANT_A, quantity: 2, unitPriceMinor: 2990 }]);
    const doc = db.documents[0]!;
    const dataPrima = doc.documentDate;

    const secondo = await vendita(
      db,
      [{ id: doc.lines[0]!.id, variantId: VARIANT_A, quantity: 1, unitPriceMinor: 2990 }],
      doc.id,
    );

    expect(secondo.reference).toBe(primo.reference);
    expect(db.documents[0]!.number).toBe(doc.number);
    expect(db.documents[0]!.series).toBe(doc.series);
    expect(db.documents[0]!.documentDate).toEqual(dataPrima);
  });

  it('riga eliminata dal documento: il movimento sparisce e la giacenza torna per intero', async () => {
    const db = createDb();
    await vendita(db, [
      { variantId: VARIANT_A, quantity: 2, unitPriceMinor: 2990 },
      { variantId: VARIANT_B, quantity: 1, unitPriceMinor: 1000 },
    ]);
    const doc = db.documents[0]!;
    expect(db.movements).toHaveLength(2);

    await vendita(
      db,
      [{ id: doc.lines[0]!.id, variantId: VARIANT_A, quantity: 2, unitPriceMinor: 2990 }],
      doc.id,
    );

    expect(db.movements).toHaveLength(1);
    expect(db.movements[0]!.variantId).toBe(VARIANT_A);
    // Tornata per intero: il fixture parte da 3, l'uscita di 1 e' stata annullata.
    expect(levelOf(db, VARIANT_B).onHand).toBe(3);
  });

  it('riga AGGIUNTA in modifica: movimento nuovo, con la data del DOCUMENTO', async () => {
    const db = createDb();
    await vendita(db, [{ variantId: VARIANT_A, quantity: 1, unitPriceMinor: 2990 }]);
    const doc = db.documents[0]!;

    await vendita(
      db,
      [
        { id: doc.lines[0]!.id, variantId: VARIANT_A, quantity: 1, unitPriceMinor: 2990 },
        { variantId: VARIANT_B, quantity: 3, unitPriceMinor: 1000 },
      ],
      doc.id,
    );

    expect(db.movements).toHaveLength(2);
    const aggiunto = db.movements.find((m) => m.variantId === VARIANT_B)!;
    expect(aggiunto.quantity).toBe(3);
    // Non la data della correzione: quella del documento, o il venduto di marzo
    // si sposterebbe ad agosto.
    expect(aggiunto.createdAt).toEqual(doc.documentDate);
    // 3 di partenza meno i 3 venduti dalla riga aggiunta.
    expect(levelOf(db, VARIANT_B).onHand).toBe(0);
  });

  it('doppio salvataggio identico: nessun movimento in piu e nessuna variazione di giacenza', async () => {
    const db = createDb();
    await vendita(db, [{ variantId: VARIANT_A, quantity: 2, unitPriceMinor: 2990 }]);
    const doc = db.documents[0]!;
    const giacenza = levelOf(db, VARIANT_A).onHand;

    await vendita(
      db,
      [{ id: doc.lines[0]!.id, variantId: VARIANT_A, quantity: 2, unitPriceMinor: 2990 }],
      doc.id,
    );

    expect(db.movements).toHaveLength(1);
    expect(levelOf(db, VARIANT_A).onHand).toBe(giacenza);
  });

  it('descrizione e SKU sono la FOTOGRAFIA: risalvare non li riscrive dall’anagrafica', async () => {
    const db = createDb();
    await vendita(db, [{ variantId: VARIANT_A, quantity: 1, unitPriceMinor: 2990 }]);
    const doc = db.documents[0]!;
    const descrizioneAllora = doc.lines[0]!.description;
    // Il prodotto viene rinominato in anagrafica dopo la vendita.
    const nomeOriginale = VARIANTS[VARIANT_A]!.productName;
    VARIANTS[VARIANT_A]!.productName = 'Nome cambiato in anagrafica';

    await vendita(
      db,
      [{ id: doc.lines[0]!.id, variantId: VARIANT_A, quantity: 1, unitPriceMinor: 2990 }],
      doc.id,
    );

    expect(db.documents[0]!.lines[0]!.description).toBe(descrizioneAllora);
    expect(db.documents[0]!.lines[0]!.description).not.toContain('cambiato');
    VARIANTS[VARIANT_A]!.productName = nomeOriginale;
  });

  it('id di un altro tipo documento: rifiutato, non aggiorna niente', async () => {
    const db = createDb();
    await vendita(db, [{ variantId: VARIANT_A, quantity: 1, unitPriceMinor: 2990 }]);
    const doc = db.documents[0]!;
    doc.type = DocumentType.sales_ddt;

    await expect(
      vendita(db, [{ variantId: VARIANT_A, quantity: 1, unitPriceMinor: 2990 }], doc.id),
    ).rejects.toThrow(/non trovato/i);
  });

  // ── Reso concluso che si RIAPRE e si risalva ─────────────────────────────
  //
  // Stesso impianto della Vendita, verso opposto: il motore e' quello di
  // CARICO. E la spunta di riga resta l'unica a decidere il movimento.

  async function reso(db: FakeDb, righe: unknown[], id?: string, documentDate?: string) {
    const { service } = createService(db);
    return service.createReturn(
      TENANT,
      {
        ...(id ? { id } : {}),
        ...(documentDate ? { documentDate } : {}),
        locationId: LOCATION,
        reason: 'Taglia errata',
        lines: righe,
      } as never,
      user,
    );
  }

  describe('la data del Reso — stesso contratto della Vendita', () => {
    const IERI = '2026-08-18T00:00:00.000Z';

    it('la data scelta in creazione finisce sul documento', async () => {
      const db = createDb();
      await reso(
        db,
        [{ variantId: VARIANT_A, quantity: 1, restockable: true, unitPriceMinor: 2990 }],
        undefined,
        IERI,
      );

      expect(db.documents[0]!.documentDate).toEqual(new Date(IERI));
    });

    it('⭐ e anche sul MOVIMENTO: il carico porta la data del reso, non quella di oggi', async () => {
      const db = createDb();
      await reso(
        db,
        [{ variantId: VARIANT_A, quantity: 1, restockable: true, unitPriceMinor: 2990 }],
        undefined,
        IERI,
      );

      // Se il movimento restasse a oggi, un rientro di ieri comparirebbe nello
      // storico movimenti in un giorno diverso da quello del suo documento.
      expect(db.movements[0]!.createdAt).toEqual(new Date(IERI));
    });

    it('senza data: è oggi, come prima', async () => {
      const db = createDb();
      const prima = Date.now();
      await reso(db, [
        { variantId: VARIANT_A, quantity: 1, restockable: true, unitPriceMinor: 2990 },
      ]);

      const scritta = new Date(db.documents[0]!.documentDate).getTime();
      expect(scritta).toBeGreaterThanOrEqual(prima - 1000);
    });

    it('⛔ in MODIFICA la data si conserva, anche se il client ne manda un’altra', async () => {
      const db = createDb();
      await reso(
        db,
        [{ variantId: VARIANT_A, quantity: 2, restockable: true, unitPriceMinor: 2990 }],
        undefined,
        IERI,
      );
      const doc = db.documents[0]!;

      await reso(
        db,
        [
          {
            id: doc.lines[0]!.id,
            variantId: VARIANT_A,
            quantity: 1,
            restockable: true,
            unitPriceMinor: 2990,
          },
        ],
        doc.id,
        '2026-01-01T00:00:00.000Z',
      );

      // La data è un fatto del documento: correggere un reso non lo sposta di
      // periodo, e il Registro Corrispettivi raggruppa proprio su di essa.
      expect(db.documents[0]!.documentDate).toEqual(new Date(IERI));
    });
  });

  it('reso risalvato da 2 a 1: UN solo movimento, aggiornato in posto', async () => {
    const db = createDb();
    await reso(db, [
      { variantId: VARIANT_A, quantity: 2, restockable: true, unitPriceMinor: 2990 },
    ]);
    const doc = db.documents[0]!;
    const movimentoPrima = db.movements[0]!;
    expect(levelOf(db, VARIANT_A).onHand).toBe(12);

    await reso(
      db,
      [
        {
          id: doc.lines[0]!.id,
          variantId: VARIANT_A,
          quantity: 1,
          restockable: true,
          unitPriceMinor: 2990,
        },
      ],
      doc.id,
    );

    expect(db.movements).toHaveLength(1);
    expect(db.movements[0]!.id).toBe(movimentoPrima.id);
    expect(db.movements[0]!.quantity).toBe(1);
    // La giacenza si muove SOLO della differenza: 12 → 11.
    expect(levelOf(db, VARIANT_A).onHand).toBe(11);
  });

  it('⛔ il costo del reso NON e il prezzo di vendita: si congela quello della variante', async () => {
    // E' la trappola del sync di carico, che deriva il costo dalla riga: sul
    // Reso quel prezzo e' il RICAVO, e scriverlo come costo falserebbe il
    // margine di ogni reso.
    const db = createDb();
    await reso(db, [
      { variantId: VARIANT_A, quantity: 1, restockable: true, unitPriceMinor: 2990 },
    ]);

    const movimento = db.movements[0]!;
    expect(movimento.unitCostMinor).toBe(VARIANT_COSTS[VARIANT_A]);
    expect(movimento.unitCostMinor).not.toBe(2990);
    expect(movimento.totalCostMinor).toBe(VARIANT_COSTS[VARIANT_A]);
  });

  it('reso risalvato: il costo unitario congelato non si rivaluta, il totale segue la quantita', async () => {
    const db = createDb();
    await reso(db, [
      { variantId: VARIANT_A, quantity: 2, restockable: true, unitPriceMinor: 2990 },
    ]);
    const doc = db.documents[0]!;
    const costoAllora = db.movements[0]!.unitCostMinor!;

    await reso(
      db,
      [
        {
          id: doc.lines[0]!.id,
          variantId: VARIANT_A,
          quantity: 1,
          restockable: true,
          unitPriceMinor: 5000,
        },
      ],
      doc.id,
    );

    expect(db.movements[0]!.unitCostMinor).toBe(costoAllora);
    expect(db.movements[0]!.totalCostMinor).toBe(costoAllora);
  });

  it('spunta tolta in modifica: il movimento sparisce e la giacenza torna indietro', async () => {
    const db = createDb();
    await reso(db, [
      { variantId: VARIANT_A, quantity: 2, restockable: true, unitPriceMinor: 2990 },
    ]);
    const doc = db.documents[0]!;
    expect(levelOf(db, VARIANT_A).onHand).toBe(12);

    await reso(
      db,
      [
        {
          id: doc.lines[0]!.id,
          variantId: VARIANT_A,
          quantity: 2,
          restockable: false,
          unitPriceMinor: 2990,
        },
      ],
      doc.id,
    );

    // La riga resta nel documento, il movimento no.
    expect(db.movements).toHaveLength(0);
    expect(db.documents[0]!.lines).toHaveLength(1);
    expect(levelOf(db, VARIANT_A).onHand).toBe(10);
  });

  it('numero, serie e data del reso restano quelli al risalvataggio', async () => {
    const db = createDb();
    const primo = await reso(db, [
      { variantId: VARIANT_A, quantity: 1, restockable: true, unitPriceMinor: 2990 },
    ]);
    const doc = db.documents[0]!;

    const secondo = await reso(
      db,
      [
        {
          id: doc.lines[0]!.id,
          variantId: VARIANT_A,
          quantity: 2,
          restockable: true,
          unitPriceMinor: 2990,
        },
      ],
      doc.id,
    );

    expect(secondo.reference).toBe(primo.reference);
    expect(db.documents[0]!.number).toBe(doc.number);
    expect(db.documents[0]!.documentDate).toEqual(doc.documentDate);
    expect(db.documents).toHaveLength(1);
  });
});

describe('i tre contratti adottati dal comune — prerequisiti di UI 3', () => {
  const db2 = () => createDb();

  /**
   * ⛔ `11` A11: il Reso ha lo sconto IDENTICO alla Vendita. Il servizio lo
   * forzava a zero in due punti, e il DTO non lo accettava proprio — chi aveva
   * venduto un capo scontato del 20% e lo riprendeva rendeva il prezzo pieno.
   */
  it('⛔ il Reso applica lo sconto di riga: non lo forza piu a zero', async () => {
    const db = db2();
    const { service } = createService(db);
    await service.createReturn(
      TENANT,
      {
        locationId: LOCATION,
        causale: 'Taglia errata',
        lines: [
          {
            variantId: VARIANT_A,
            quantity: 1,
            restockable: true,
            unitPriceMinor: 10000,
            discountPercent: 20,
          },
        ],
      } as never,
      user,
    );

    const riga = db.documents[0]!.lines[0]!;
    expect(riga.discountPercent).toBe(20);
    // 100,00 scontato del 20% = 80,00 netto.
    expect(riga.lineTotalMinor).toBe(8000);
  });

  it('senza sconto dichiarato resta zero: il default non cambia', async () => {
    const db = db2();
    const { service } = createService(db);
    await service.createReturn(
      TENANT,
      {
        locationId: LOCATION,
        causale: 'x',
        lines: [{ variantId: VARIANT_A, quantity: 1, restockable: true, unitPriceMinor: 10000 }],
      } as never,
      user,
    );
    expect(db.documents[0]!.lines[0]!.discountPercent).toBe(0);
  });

  /**
   * ⛔ La causale vive in `causalText`, la colonna generica del documento — non
   * in `internalComment` col prefisso `Causale reso: `, che per rileggerla
   * obbligava ad analizzare una stringa.
   */
  it('⛔ la causale sta in causalText, non in un prefisso dentro il commento', async () => {
    const db = db2();
    const { service } = createService(db);
    await service.createReturn(
      TENANT,
      {
        locationId: LOCATION,
        causale: 'Capo difettoso',
        lines: [{ variantId: VARIANT_A, quantity: 1, restockable: true, unitPriceMinor: 1000 }],
      } as never,
      user,
    );

    const doc = db.documents[0]!;
    expect(doc.causalText).toBe('Capo difettoso');
    expect(doc.causalGenerationMode).toBe('manual');
    // Il prefisso non deve ricomparire da nessuna parte.
    expect(JSON.stringify(doc)).not.toContain('Causale reso:');
  });

  it('⛔ la causale e FACOLTATIVA: senza, il reso si registra lo stesso', async () => {
    const db = db2();
    const { service } = createService(db);
    await service.createReturn(
      TENANT,
      {
        locationId: LOCATION,
        lines: [{ variantId: VARIANT_A, quantity: 1, restockable: true, unitPriceMinor: 1000 }],
      } as never,
      user,
    );

    const doc = db.documents[0]!;
    expect(doc.causalText).toBeNull();
    expect(doc.causalGenerationMode).toBeNull();
    // E il movimento porta comunque il riferimento, che basta a ritrovarlo.
    expect(db.movements[0]!.reason).toContain(doc.reference);
  });

  /**
   * ⚠️ Contratto binario, come il Codice IVA: assente = non modificata.
   * Rileggere dall'anagrafica a ogni salvataggio riscriverebbe un documento di
   * marzo col nome di oggi.
   */
  it('descrizione DICHIARATA: si salva quella', async () => {
    const db = db2();
    const { service } = createService(db);
    await service.createReturn(
      TENANT,
      {
        locationId: LOCATION,
        lines: [
          {
            variantId: VARIANT_A,
            quantity: 1,
            restockable: true,
            unitPriceMinor: 1000,
            description: 'Maglia cotone — seconda scelta',
          },
        ],
      } as never,
      user,
    );
    expect(db.documents[0]!.lines[0]!.description).toBe('Maglia cotone — seconda scelta');
  });

  it('⛔ descrizione ASSENTE su riga esistente: resta quella persistita', async () => {
    const db = db2();
    const { service } = createService(db);
    await service.createReturn(
      TENANT,
      {
        locationId: LOCATION,
        lines: [
          {
            variantId: VARIANT_A,
            quantity: 2,
            restockable: true,
            unitPriceMinor: 1000,
            description: 'Nome di allora',
          },
        ],
      } as never,
      user,
    );
    const doc = db.documents[0]!;

    await service.createReturn(
      TENANT,
      {
        id: doc.id,
        locationId: LOCATION,
        lines: [
          {
            id: doc.lines[0]!.id,
            variantId: VARIANT_A,
            quantity: 1,
            restockable: true,
            unitPriceMinor: 1000,
          },
        ],
      } as never,
      user,
    );

    expect(db.documents[0]!.lines[0]!.description).toBe('Nome di allora');
  });

  // ── T6 — autorizzazione sede: creazione normale, modifica su ENTRAMBE ────
  //
  // In modifica non basta autorizzare la sede richiesta (`dto.locationId`):
  // un operatore che vede solo A potrebbe "prendere" un documento nato in B
  // passando `locationId: A`, perché la sola sede controllata sarebbe quella
  // di ARRIVO. Va autorizzata anche quella del documento ESISTENTE, prima.
  //
  // `user` (riusato da tutto il resto del file) è owner: accesso illimitato,
  // quindi non esercita mai il ramo che nega. Questi test usano utenti clerk
  // con `assignedLocationIds` esplicite, apposta per farlo negare.

  describe('T6 — autorizzazione sede in creazione e in modifica', () => {
    function clerk(assignedLocationIds: readonly string[]): UserProfileDto {
      return {
        ...user,
        id: 'u-clerk',
        role: UserRole.clerk,
        hasAllLocationsAccess: false,
        assignedLocationIds: [...assignedLocationIds],
        permissions: [TenantPermission.InventoryManage],
      } as unknown as UserProfileDto;
    }

    const userA = clerk([LOCATION]);
    const userAB = clerk([LOCATION, LOCATION_B]);

    async function nuovaVendita(db: FakeDb, locationId: string, attore: UserProfileDto) {
      const { service } = createService(db);
      return service.createSale(
        TENANT,
        {
          locationId,
          paymentMethod: 'cash',
          lines: [{ variantId: VARIANT_A, quantity: 1, unitPriceMinor: 2990 }],
        } as never,
        attore,
      );
    }

    async function nuovoReso(db: FakeDb, locationId: string, attore: UserProfileDto) {
      const { service } = createService(db);
      return service.createReturn(
        TENANT,
        {
          locationId,
          reason: 'Taglia errata',
          lines: [{ variantId: VARIANT_A, quantity: 1, restockable: true, unitPriceMinor: 2990 }],
        } as never,
        attore,
      );
    }

    describe.each([
      { tipo: 'Vendita', crea: nuovaVendita, metodo: 'createSale' as const },
      { tipo: 'Reso', crea: nuovoReso, metodo: 'createReturn' as const },
    ])('$tipo', ({ crea, metodo }) => {
      it('documento sede A, utente autorizzato A, update A → OK', async () => {
        const db = createDb();
        await crea(db, LOCATION, userA);
        const doc = db.documents[0]!;
        const { service } = createService(db);

        await expect(
          service[metodo](
            TENANT,
            {
              id: doc.id,
              locationId: LOCATION,
              paymentMethod: 'cash',
              reason: 'Taglia errata',
              lines: [
                {
                  id: doc.lines[0]!.id,
                  variantId: VARIANT_A,
                  quantity: 1,
                  restockable: true,
                  unitPriceMinor: 2990,
                },
              ],
            } as never,
            userA,
          ),
        ).resolves.toBeDefined();
      });

      it('documento sede B, utente autorizzato solo A, payload location A → rifiutato', async () => {
        const db = createDb();
        // Il documento nasce in B con un utente che la vede (userAB), poi lo
        // stesso utente prova a spostarlo con userA, che B non la vede affatto.
        await crea(db, LOCATION_B, userAB);
        const doc = db.documents[0]!;
        const { service } = createService(db);

        await expect(
          service[metodo](
            TENANT,
            {
              id: doc.id,
              locationId: LOCATION,
              paymentMethod: 'cash',
              reason: 'Taglia errata',
              lines: [
                {
                  id: doc.lines[0]!.id,
                  variantId: VARIANT_A,
                  quantity: 1,
                  restockable: true,
                  unitPriceMinor: 2990,
                },
              ],
            } as never,
            userA,
          ),
        ).rejects.toThrow(ForbiddenException);

        // ⛔ Nessuna scrittura: la sede del documento non è cambiata.
        expect(db.documents[0]!.locationId).toBe(LOCATION_B);
      });

      it('documento sede A, utente autorizzato solo A, cambio verso B → rifiutato', async () => {
        const db = createDb();
        await crea(db, LOCATION, userA);
        const doc = db.documents[0]!;
        const { service } = createService(db);

        await expect(
          service[metodo](
            TENANT,
            {
              id: doc.id,
              locationId: LOCATION_B,
              paymentMethod: 'cash',
              reason: 'Taglia errata',
              lines: [
                {
                  id: doc.lines[0]!.id,
                  variantId: VARIANT_A,
                  quantity: 1,
                  restockable: true,
                  unitPriceMinor: 2990,
                },
              ],
            } as never,
            userA,
          ),
        ).rejects.toThrow(ForbiddenException);

        expect(db.documents[0]!.locationId).toBe(LOCATION);
      });

      it('documento sede A, utente autorizzato A+B, cambio verso B → OK', async () => {
        const db = createDb();
        await crea(db, LOCATION, userA);
        const doc = db.documents[0]!;
        const { service } = createService(db);

        await expect(
          service[metodo](
            TENANT,
            {
              id: doc.id,
              locationId: LOCATION_B,
              paymentMethod: 'cash',
              reason: 'Taglia errata',
              lines: [
                {
                  id: doc.lines[0]!.id,
                  variantId: VARIANT_A,
                  quantity: 1,
                  restockable: true,
                  unitPriceMinor: 2990,
                },
              ],
            } as never,
            userAB,
          ),
        ).resolves.toBeDefined();

        expect(db.documents[0]!.locationId).toBe(LOCATION_B);
      });
    });

    it('creazione: si autorizza solo la sede richiesta, come prima di T6', async () => {
      const db = createDb();
      // userA non ha B, ma qui non esiste ancora un documento: non c'è nulla
      // da autorizzare oltre alla sede richiesta.
      await expect(nuovaVendita(db, LOCATION, userA)).resolves.toBeDefined();
      await expect(nuovaVendita(createDb(), LOCATION_B, userA)).rejects.toThrow(ForbiddenException);
    });
  });
});

// ── T3 — snapshot IVA: contratto binario su Vendita e Reso ────────────────
//
// Lo snapshot IVA è il FATTO FISCALE di quel documento. Il contratto è binario
// e vale su una riga GIÀ ESISTENTE:
//
//   vatCodeId ASSENTE   → non modificata → si conservano id e snapshot persistiti
//   vatCodeId PRESENTE  → assegnazione cambiata → il server risolve e RIGENERA
//   riga NUOVA          → risoluzione normale da articolo/predefinito
//
// ⚠️ Il difetto che questi test inchiodano è INVISIBILE finché nessuno tocca
// un'aliquota: finché `ratePercent` non cambia, rifotografare e conservare
// danno lo stesso numero. Per questo le prove qui sotto **cambiano l'aliquota
// in anagrafica fra un salvataggio e l'altro**: è l'unico modo di distinguere
// le due implementazioni.
//
// ⛔ Prima di T3 l'intera spec non aveva UNA asserzione su `vatCodeId` o
// `vatSnapshot`: il percorso del Reso passava `undefined` cablato, e quello
// della Vendita era corretto sul server ma vanificato dal client, che il codice
// letto all'apertura lo rimandava sempre.
describe('T3 — lo snapshot IVA non si rifotografa al risalvataggio', () => {
  /** Aliquota registrata sulla riga persistita. */
  const aliquotaDiRiga = (doc: FakeDocument, index = 0): number | undefined =>
    (doc.lines[index]!.vatSnapshot as { ratePercent?: number } | null)?.ratePercent;

  /** Simula la modifica dell'aliquota in ANAGRAFICA, dopo il salvataggio. */
  const cambiaAliquotaInAnagrafica = (db: FakeDb, nuova: number): void => {
    db.vatCodes = db.vatCodes.map((vatCode) => ({ ...vatCode, ratePercent: nuova }));
  };

  const conIva = (): FakeDb => {
    const db = createDb();
    db.defaultVatCodeId = VAT_22.id;
    db.vatCodes = [VAT_22];
    return db;
  };

  describe('Vendita', () => {
    it('⭐ riga esistente, IVA NON dichiarata: snapshot storico conservato anche se l’aliquota è cambiata', async () => {
      const db = conIva();
      const { service } = createService(db);

      await service.createSale(
        TENANT,
        {
          locationId: LOCATION,
          paymentMethod: 'cash',
          lines: [
            { variantId: VARIANT_A, quantity: 1, unitPriceMinor: 10000, vatCodeId: VAT_22.id },
          ],
        } as never,
        user,
      );
      const doc = db.documents[0]!;
      expect(aliquotaDiRiga(doc)).toBe(22);

      // Il commercialista corregge l'aliquota del Codice IVA in anagrafica.
      cambiaAliquotaInAnagrafica(db, 10);

      // L'operatore riapre la vendita e cambia SOLO la quantità.
      await service.createSale(
        TENANT,
        {
          id: doc.id,
          locationId: LOCATION,
          paymentMethod: 'cash',
          lines: [
            { id: doc.lines[0]!.id, variantId: VARIANT_A, quantity: 2, unitPriceMinor: 10000 },
          ],
        } as never,
        user,
      );

      const riga = db.documents[0]!.lines[0]!;
      expect(riga.vatCodeId).toBe(VAT_22.id);
      // ⛔ 22, non 10: la vendita di allora non si ri-prezza.
      expect(aliquotaDiRiga(db.documents[0]!)).toBe(22);
      // E l'imposta segue lo snapshot storico: 2 × 100,00 al 22% = 44,00.
      expect(riga.lineVatTotalMinor).toBe(4400);
    });

    it('riga esistente, IVA DICHIARATA: lo snapshot si rigenera all’aliquota corrente', async () => {
      const db = conIva();
      const { service } = createService(db);

      await service.createSale(
        TENANT,
        {
          locationId: LOCATION,
          paymentMethod: 'cash',
          lines: [
            { variantId: VARIANT_A, quantity: 1, unitPriceMinor: 10000, vatCodeId: VAT_22.id },
          ],
        } as never,
        user,
      );
      const doc = db.documents[0]!;
      cambiaAliquotaInAnagrafica(db, 10);

      // Stesso codice, ma DICHIARATO: è il modo in cui l'operatore dice «ho
      // toccato l'IVA di questa riga».
      await service.createSale(
        TENANT,
        {
          id: doc.id,
          locationId: LOCATION,
          paymentMethod: 'cash',
          lines: [
            {
              id: doc.lines[0]!.id,
              variantId: VARIANT_A,
              quantity: 1,
              unitPriceMinor: 10000,
              vatCodeId: VAT_22.id,
            },
          ],
        } as never,
        user,
      );

      expect(aliquotaDiRiga(db.documents[0]!)).toBe(10);
      expect(db.documents[0]!.lines[0]!.lineVatTotalMinor).toBe(1000);
    });
  });

  describe('Reso', () => {
    it('riga esistente, IVA NON dichiarata: snapshot storico conservato anche se l’aliquota è cambiata', async () => {
      const db = conIva();
      const { service } = createService(db);

      await service.createReturn(
        TENANT,
        {
          locationId: LOCATION,
          lines: [
            {
              variantId: VARIANT_A,
              quantity: 1,
              restockable: true,
              unitPriceMinor: 10000,
              vatCodeId: VAT_22.id,
            },
          ],
        } as never,
        user,
      );
      const doc = db.documents[0]!;
      expect(aliquotaDiRiga(doc)).toBe(22);

      cambiaAliquotaInAnagrafica(db, 10);

      await service.createReturn(
        TENANT,
        {
          id: doc.id,
          locationId: LOCATION,
          lines: [
            {
              id: doc.lines[0]!.id,
              variantId: VARIANT_A,
              quantity: 2,
              restockable: true,
              unitPriceMinor: 10000,
            },
          ],
        } as never,
        user,
      );

      expect(db.documents[0]!.lines[0]!.vatCodeId).toBe(VAT_22.id);
      expect(aliquotaDiRiga(db.documents[0]!)).toBe(22);
      expect(db.documents[0]!.lines[0]!.lineVatTotalMinor).toBe(4400);
    });

    it('⛔ riga esistente, IVA DICHIARATA: si rigenera — prima di T3 era IMPOSSIBILE', async () => {
      const db = conIva();
      const { service } = createService(db);

      await service.createReturn(
        TENANT,
        {
          locationId: LOCATION,
          lines: [
            {
              variantId: VARIANT_A,
              quantity: 1,
              restockable: true,
              unitPriceMinor: 10000,
              vatCodeId: VAT_22.id,
            },
          ],
        } as never,
        user,
      );
      const doc = db.documents[0]!;
      cambiaAliquotaInAnagrafica(db, 10);

      await service.createReturn(
        TENANT,
        {
          id: doc.id,
          locationId: LOCATION,
          lines: [
            {
              id: doc.lines[0]!.id,
              variantId: VARIANT_A,
              quantity: 1,
              restockable: true,
              unitPriceMinor: 10000,
              vatCodeId: VAT_22.id,
            },
          ],
        } as never,
        user,
      );

      // Prima di T3 il servizio passava `undefined` cablato: qui sarebbe
      // rimasto 22, e l'operatore non avrebbe avuto modo di cambiarlo.
      expect(aliquotaDiRiga(db.documents[0]!)).toBe(10);
      expect(db.documents[0]!.lines[0]!.lineVatTotalMinor).toBe(1000);
    });

    it('riga NUOVA senza override: risolve da articolo/predefinito, come prima', async () => {
      const db = conIva();
      const { service } = createService(db);

      await service.createReturn(
        TENANT,
        {
          locationId: LOCATION,
          lines: [{ variantId: VARIANT_A, quantity: 1, restockable: true, unitPriceMinor: 10000 }],
        } as never,
        user,
      );

      const riga = db.documents[0]!.lines[0]!;
      expect(riga.vatCodeId).toBe(VAT_22.id);
      expect(aliquotaDiRiga(db.documents[0]!)).toBe(22);
      expect(riga.lineVatTotalMinor).toBe(2200);
    });

    it('riga NUOVA con override dichiarato: vince il codice dichiarato', async () => {
      const db = conIva();
      const VAT_10: FakeVatCode = { ...VAT_22, id: 'vat-10', code: '10', ratePercent: 10 };
      db.vatCodes = [VAT_22, VAT_10];
      const { service } = createService(db);

      await service.createReturn(
        TENANT,
        {
          locationId: LOCATION,
          lines: [
            {
              variantId: VARIANT_A,
              quantity: 1,
              restockable: true,
              unitPriceMinor: 10000,
              vatCodeId: VAT_10.id,
            },
          ],
        } as never,
        user,
      );

      // Il predefinito aziendale è VAT_22: senza il campo nel DTO questa riga
      // sarebbe finita al 22% comunque.
      expect(db.documents[0]!.lines[0]!.vatCodeId).toBe(VAT_10.id);
      expect(aliquotaDiRiga(db.documents[0]!)).toBe(10);
    });
  });
});
