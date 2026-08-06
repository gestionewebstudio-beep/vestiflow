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

interface FakePayment {
  tenantId: string;
  documentId: string;
  position: number;
  method: string;
  methodNote: string | null;
  amountMinor: number;
  tenderedMinor: number | null;
}

interface FakeDb {
  levels: FakeLevel[];
  documents: FakeDocument[];
  movements: FakeMovement[];
  payments: FakePayment[];
  corrispettivi: Record<string, unknown>[];
  corrispettivoLines: Record<string, unknown>[];
  /** Stampante fiscale abilitata della sede (null = sede non fiscale). */
  fiscalDevice: Record<string, unknown> | null;
  fiscalReceipts: Record<string, unknown>[];
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
    payments: [],
    corrispettivi: [],
    corrispettivoLines: [],
    fiscalDevice: null,
    fiscalReceipts: [],
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

function createFakePrisma(db: FakeDb): PrismaService {
  const client = {
    location: {
      findFirst: ({ where }: { where: { id: string } }) =>
        Promise.resolve(where.id === LOCATION ? { id: LOCATION } : null),
      findMany: () => Promise.resolve([{ id: LOCATION }]),
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
    documentCounter: { findFirst: () => Promise.resolve(null) },
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
        return Promise.resolve(found ? { reference: found.reference } : null);
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
    storeSalePayment: {
      createMany: ({ data }: { data: FakePayment[] }) => {
        db.payments.push(...data.map((row) => ({ ...row })));
        return Promise.resolve({ count: data.length });
      },
    },
    // Nessuna cassa aperta nel fake db: vendite e resi restano sganciati.
    cashSession: { findFirst: () => Promise.resolve(null) },
    fiscalDevice: {
      findFirst: () => Promise.resolve(db.fiscalDevice ? { ...db.fiscalDevice } : null),
    },
    fiscalReceipt: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        db.fiscalReceipts.push({ ...data });
        return Promise.resolve({ id: `fr-${db.fiscalReceipts.length}`, ...data });
      },
      findFirst: ({ where }: { where: { documentId?: string } }) => {
        const match = db.fiscalReceipts.find(
          (receipt) => receipt['documentId'] === where.documentId,
        );
        return Promise.resolve(
          match
            ? {
                id: 'fr-original',
                fiscalNumber: '0001-0042',
                issuedAt: new Date('2026-08-06T10:00:00Z'),
                serialNumber: 'MAT123',
                ...match,
              }
            : null,
        );
      },
    },
    corrispettivoEntry: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        db.corrispettivi.push({ ...data });
        return Promise.resolve({ id: `cor-${db.corrispettivi.length}` });
      },
    },
    corrispettivoEntryLine: {
      createMany: ({ data }: { data: Record<string, unknown>[] }) => {
        db.corrispettivoLines.push(...data.map((row) => ({ ...row })));
        return Promise.resolve({ count: data.length });
      },
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
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const snapshot = structuredClone({
        levels: db.levels,
        documents: db.documents,
        movements: db.movements,
        payments: db.payments,
        corrispettivi: db.corrispettivi,
        corrispettivoLines: db.corrispettivoLines,
        sequences: [...db.sequences.entries()],
      });
      try {
        return await fn(client);
      } catch (error) {
        db.levels = snapshot.levels;
        db.documents = snapshot.documents;
        db.movements = snapshot.movements;
        db.payments = snapshot.payments;
        db.corrispettivi = snapshot.corrispettivi;
        db.corrispettivoLines = snapshot.corrispettivoLines;
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
        printTitle:
          type === DocumentType.store_sale ? 'Vendita in negozio' : 'Reso vendita negozio',
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

    // Il legacy a metodo unico produce comunque il dettaglio pagamenti:
    // una riga che copre l'intero totale, nella stessa transazione.
    expect(db.payments).toEqual([
      {
        tenantId: TENANT,
        documentId: doc.id,
        position: 1,
        method: 'cash',
        methodNote: null,
        amountMinor: 5980,
        tenderedMinor: null,
      },
    ]);

    // La vendita entra nel registro Corrispettivi come voce canale Cassa
    // negozio, numerata nella sequenza COR condivisa con l'online.
    expect(db.corrispettivi).toHaveLength(1);
    expect(db.corrispettivi[0]).toMatchObject({
      documentId: doc.id,
      channel: 'store',
      totalMinor: 5980,
      status: 'to_verify',
    });
    expect(db.corrispettivi[0]!['reference']).toMatch(/^COR-\d{4}-0001$/);
    expect(db.corrispettivoLines).toHaveLength(1);
  });

  it('Reso: voce corrispettivo di STORNO con importi negativi e nota col riferimento', async () => {
    const db = createDb();
    const { service } = createService(db);

    await service.createSale(
      TENANT,
      {
        locationId: LOCATION,
        paymentMethod: 'cash',
        lines: [{ variantId: VARIANT_A, quantity: 2, unitPriceMinor: 2990 }],
      },
      user,
    );
    const sale = db.documents[0]!;

    await service.createReturn(
      TENANT,
      {
        locationId: LOCATION,
        saleDocumentId: sale.id,
        reason: 'taglia errata',
        lines: [
          { variantId: VARIANT_A, quantity: 1, restockable: true, unitPriceMinor: 2990 },
        ],
      },
      user,
    );

    expect(db.corrispettivi).toHaveLength(2);
    const storno = db.corrispettivi[1]!;
    expect(storno).toMatchObject({ channel: 'store', totalMinor: -2990 });
    expect(String(storno['adjustmentNote'])).toContain('taglia errata');
    // Numerazione condivisa: la voce di storno prosegue la sequenza COR.
    expect(storno['number']).toBe(2);
  });

  it('Multi-tender: righe pagamento persistite, documento marcato `mixed` con sintesi in nota', async () => {
    const db = createDb();
    const { service } = createService(db);

    // 2 × 29,90 netti senza IVA = 59,80: metà contanti (con resto), metà carta.
    await service.createSale(
      TENANT,
      {
        locationId: LOCATION,
        payments: [
          { method: 'cash', amountMinor: 3000, tenderedMinor: 5000 },
          { method: 'card', amountMinor: 2980 },
        ],
        lines: [{ variantId: VARIANT_A, quantity: 2, unitPriceMinor: 2990 }],
      },
      user,
    );

    const doc = db.documents[0]!;
    expect(doc.paymentMethod).toBe('mixed');
    expect(doc['paymentMethodNote']).toBe('Contanti 30,00 € + Carta 29,80 €');
    expect(db.payments).toHaveLength(2);
    expect(db.payments[0]).toMatchObject({
      documentId: doc.id,
      position: 1,
      method: 'cash',
      amountMinor: 3000,
      tenderedMinor: 5000,
    });
    expect(db.payments[1]).toMatchObject({
      position: 2,
      method: 'card',
      amountMinor: 2980,
      tenderedMinor: null,
    });
  });

  it('Sede fiscale: la vendita nasce «da fiscalizzare» e il result porta il payload di stampa', async () => {
    const db = createDb();
    db.defaultVatCodeId = VAT_22.id;
    db.vatCodes = [VAT_22];
    db.fiscalDevice = {
      id: 'dev-1',
      endpoint: 'https://192.168.1.50',
      brand: 'epson',
      serialNumber: 'MAT123',
      vatDepartments: [{ ratePercent: 22, department: 3 }],
    };
    const { service } = createService(db);

    const result = await service.createSale(
      TENANT,
      {
        locationId: LOCATION,
        paymentMethod: 'card',
        lines: [{ variantId: VARIANT_A, quantity: 1, unitPriceMinor: 1990 }],
      },
      user,
    );

    // Ricevuta pending nella stessa transazione del documento.
    expect(db.fiscalReceipts).toHaveLength(1);
    expect(db.fiscalReceipts[0]).toMatchObject({
      documentId: db.documents[0]!.id,
      deviceId: 'dev-1',
      serialNumber: 'MAT123',
    });

    // Payload pronto da stampare: lordo, reparto dalla mappa, pagamento carta.
    expect(result.fiscal).toMatchObject({
      documentType: 'sale',
      endpoint: 'https://192.168.1.50',
      brand: 'epson',
      lines: [
        // 1990 netti al 22% = 2428 lordi; aliquota 22 → reparto 3.
        { quantity: 1, unitPriceGrossMinor: 2428, department: 3 },
      ],
      payments: [{ description: 'CARTA', amountMinor: 2428, epsonPaymentType: 2 }],
      original: null,
    });
  });

  it('Reso su sede fiscale: ricevuta agganciata all’originale e payload con rimborso', async () => {
    const db = createDb();
    db.fiscalDevice = {
      id: 'dev-1',
      endpoint: 'https://192.168.1.50',
      brand: 'epson',
      serialNumber: 'MAT123',
      vatDepartments: null,
    };
    const { service } = createService(db);

    await service.createSale(
      TENANT,
      {
        locationId: LOCATION,
        paymentMethod: 'cash',
        lines: [{ variantId: VARIANT_A, quantity: 1, unitPriceMinor: 2990 }],
      },
      user,
    );
    const sale = db.documents[0]!;

    const result = await service.createReturn(
      TENANT,
      {
        locationId: LOCATION,
        saleDocumentId: sale.id,
        reason: 'capo difettoso',
        refundMethod: 'card',
        lines: [
          { variantId: VARIANT_A, quantity: 1, restockable: true, unitPriceMinor: 2990 },
        ],
      },
      user,
    );

    // Seconda ricevuta (il reso) agganciata alla ricevuta della vendita.
    expect(db.fiscalReceipts).toHaveLength(2);
    expect(db.fiscalReceipts[1]).toMatchObject({ originalReceiptId: 'fr-original' });

    expect(result.fiscal).toMatchObject({
      documentType: 'return',
      payments: [{ description: 'CARTA', amountMinor: 2990, epsonPaymentType: 2 }],
      original: { fiscalNumber: '0001-0042', serialNumber: 'MAT123' },
    });
  });

  it('Sede NON fiscale: nessuna ricevuta, result.fiscal null (cassa come oggi)', async () => {
    const db = createDb();
    const { service } = createService(db);

    const result = await service.createSale(
      TENANT,
      {
        locationId: LOCATION,
        paymentMethod: 'cash',
        lines: [{ variantId: VARIANT_A, quantity: 1, unitPriceMinor: 2990 }],
      },
      user,
    );

    expect(db.fiscalReceipts).toHaveLength(0);
    expect(result.fiscal).toBeNull();
  });

  it('Multi-tender: somma diversa dal totale ⇒ vendita rifiutata, nessun documento né movimento', async () => {
    const db = createDb();
    const { service } = createService(db);

    await expect(
      service.createSale(
        TENANT,
        {
          locationId: LOCATION,
          payments: [{ method: 'cash', amountMinor: 1000 }],
          lines: [{ variantId: VARIANT_A, quantity: 2, unitPriceMinor: 2990 }],
        },
        user,
      ),
    ).rejects.toThrowError(
      'La somma dei pagamenti (10,00 €) non corrisponde al totale della vendita (59,80 €).',
    );

    expect(db.documents).toHaveLength(0);
    expect(db.movements).toHaveLength(0);
    expect(db.payments).toHaveLength(0);
    expect(levelOf(db, VARIANT_A).onHand).toBe(10);
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

    expect(returnResult.reference).toBe('RN-0001');

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

  it('listRecentSales rispetta lo scope location dell’utente (gap chiuso: niente più bypass manuale)', async () => {
    const db = createDb();
    const { service } = createService(db);

    await service.createSale(
      TENANT,
      {
        locationId: LOCATION,
        paymentMethod: 'other',
        lines: [{ variantId: VARIANT_A, quantity: 1, unitPriceMinor: 2990 }],
      },
      user,
    );

    // Titolare: vede la vendita registrata (scope illimitato).
    const asOwner = await service.listRecentSales(TENANT, undefined, user);
    expect(asOwner).toHaveLength(1);

    // Commesso senza sede assegnata: nessuna sede in scope ⇒ lista vuota, non 500/errore.
    const clerkWithoutLocation: UserProfileDto = {
      ...user,
      role: UserRole.clerk,
      hasAllLocationsAccess: false,
      assignedLocationIds: [],
      permissions: [],
    };
    const asClerkNoScope = await service.listRecentSales(TENANT, undefined, clerkWithoutLocation);
    expect(asClerkNoScope).toEqual([]);

    // Commesso con la sede corretta assegnata: vede la vendita.
    const clerkWithLocation: UserProfileDto = {
      ...clerkWithoutLocation,
      assignedLocationIds: [LOCATION],
    };
    const asClerkScoped = await service.listRecentSales(TENANT, undefined, clerkWithLocation);
    expect(asClerkScoped).toHaveLength(1);
  });
});
