import {
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  DocumentStatus,
  DocumentType,
  MovementOrigin,
  StockMovementType,
  UserRole,
} from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { TenantPermission } from '../auth/tenant-permission.constants';
import { CreationIntentService } from '../common/idempotency/creation-intent.util';
import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import type { ChannelSyncFacade } from '../channels/channel-sync.facade';
import type { DocumentPriceModePreferenceService } from '../documents/document-price-mode-preference.service';
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
  paymentMethodNote: string | null;
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
  /**
   * Errore che `document.create` deve lanciare al prossimo tentativo (T7B).
   * `null` = nessuno. Serve a simulare il P2002 del vincolo unico sul numero,
   * che nel finto non può scattare da sé.
   */
  failNextDocumentCreate: unknown | null;
  /**
   * Il registro degli intenti di creazione (T15). Il finto ne riproduce il
   * VINCOLO UNICO su (tenantId, intentId): è quello a fare tutto il lavoro, e
   * un doppio che non lo simulasse renderebbe verdi prove che non provano nulla.
   */
  intents: { tenantId: string; intentId: string; fingerprint: string; resultRef: string | null }[];
  /**
   * Quante volte è stato preso il lock del contatore (T8A). In questo percorso
   * l'unico `$queryRaw` è `lockDocumentCounter`, quindi contarli equivale a
   * contare i lock — serve a provare che un numero IMPOSTO non passa di lì.
   */
  lockCalls: number;
  /** Codice IVA aziendale predefinito (null = nessuna imposta sulle righe). */
  defaultVatCodeId: string | null;
  vatCodes: FakeVatCode[];
  /**
   * I contatori documento (T7A). Vuoto = nessun contatore configurato, che è
   * lo stato di un tenant che non ha mai aperto i Numeratori: il banco non
   * semina niente da sé — `seedDefaults` lo chiamano solo `list()` e
   * `available()` di `document-counters.service.ts`.
   */
  counters: FakeCounter[];
  /** Convenzione aziendale sui prezzi di vendita (`11` A4). */
  companyPricesIncludeVat: boolean;
  /** Memoria dell'operatore, per `utente|tipo`. */
  priceModeMemory: Map<string, boolean>;
  /** Clienti dell'anagrafica: servono allo snapshot del nome sul documento. */
  customers: { id: string; tenantId: string; displayName: string }[];
}

/**
 * Un contatore documento, nella forma minima che serve a `defaultCounterSeries`.
 *
 * ⚠️ `locationId` NON partiziona il progressivo (`docs/04` §1): decide **quali
 * serie sono disponibili** per un documento di quella sede. Un contatore con
 * sede è usabile solo lì; uno senza sede ovunque.
 */
interface FakeCounter {
  tenantId: string;
  type: DocumentType;
  /** null = contatore «Senza serie». */
  series: string | null;
  locationId: string | null;
  isDefault: boolean;
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
    failNextDocumentCreate: null,
    intents: [],
    lockCalls: 0,
    defaultVatCodeId: null,
    vatCodes: [],
    counters: [],
    customers: [],
    companyPricesIncludeVat: true,
    priceModeMemory: new Map(),
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
      findFirst: ({ where }: { where: { id: string; tenantId: string } }) =>
        Promise.resolve(
          db.customers.find(
            (customer) => customer.id === where.id && customer.tenantId === where.tenantId,
          )
            ? // La forma che il servizio legge: lo snapshot del nome passa da
              // `partyDisplayName(customer.party)`, che prende la ragione
              // sociale quando c'è.
              {
                party: {
                  companyName: db.customers.find((customer) => customer.id === where.id)!
                    .displayName,
                  firstName: null,
                  lastName: null,
                  contactName: null,
                  email: null,
                },
              }
            : null,
        ),
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
    /**
     * Il registro degli intenti (T15), col suo vincolo unico riprodotto.
     *
     * ⚠️ L'errore lanciato ha la forma che Prisma manda davvero — `code: P2002`
     * e `meta.modelName` — perché `isCreationIntentConflict` riconosce dal
     * MODELLO. Con un errore generico il riconoscimento non scatterebbe e i
     * test proverebbero il percorso sbagliato.
     */
    creationIntent: {
      create: ({ data }: { data: { tenantId: string; intentId: string; fingerprint: string } }) => {
        const preso = db.intents.some(
          (i) => i.tenantId === data.tenantId && i.intentId === data.intentId,
        );
        if (preso) {
          return Promise.reject({
            code: 'P2002',
            meta: { modelName: 'CreationIntent', target: ['tenant_id', 'intent_id'] },
          });
        }
        db.intents.push({ ...data, resultRef: null });
        return Promise.resolve({ ...data, resultRef: null });
      },
      updateMany: ({
        where,
        data,
      }: {
        where: { tenantId: string; intentId: string };
        data: { resultRef: string };
      }) => {
        let count = 0;
        db.intents = db.intents.map((i) => {
          if (i.tenantId === where.tenantId && i.intentId === where.intentId) {
            count += 1;
            return { ...i, resultRef: data.resultRef };
          }
          return i;
        });
        return Promise.resolve({ count });
      },
      findFirst: ({ where }: { where: { tenantId: string; intentId: string } }) =>
        Promise.resolve(
          db.intents.find((i) => i.tenantId === where.tenantId && i.intentId === where.intentId) ??
            null,
        ),
    },
    documentCounter: {
      findFirst: () => Promise.resolve(null),
      // ⛔ Prima: `() => Promise.resolve([])`, che IGNORAVA gli argomenti. Con
      // nessun contatore `defaultCounterSeries` ritorna sempre `null`, quindi
      // qualunque test sulla scelta della serie — e sul ruolo della sede —
      // sarebbe passato identico con e senza la correzione. Un finto che non
      // guarda il `where` non è un banco di prova: è una comparsa.
      //
      // ⚠️ Il finto ONORA il `where` che riceve, non riderivare la regola: se
      // domani `defaultCounterSeries` cambiasse filtro, questo si adegua da sé
      // invece di continuare a rispondere secondo la regola vecchia.
      findMany: ({
        where,
      }: {
        where: {
          tenantId: string;
          type: DocumentType;
          OR?: { locationId: string | null }[];
        };
      }) =>
        Promise.resolve(
          db.counters
            .filter(
              (counter) =>
                counter.tenantId === where.tenantId &&
                counter.type === where.type &&
                (where.OR ?? []).some((ramo) => ramo.locationId === counter.locationId),
            )
            .map((counter) => ({ series: counter.series, isDefault: counter.isDefault })),
        ),
    },
    document: {
      // ⛔ Prima: `() => Promise.resolve({ _max: { number: null } })`, che
      // rispondeva SEMPRE «nessun documento» e faceva uscire sempre il numero 1.
      // Con quello, un test sulla data del documento non poteva fallire.
      //
      // Ora replica il filtro del §2: massimo del numero fra i documenti dello
      // stesso contatore (tenant + tipi della partizione + serie) e di data
      // STRETTAMENTE ANTERIORE a `documentDate.lt`.
      aggregate: ({
        where,
      }: {
        where: {
          tenantId: string;
          type: { in: DocumentType[] };
          series: string | null;
          documentDate: { lt: Date };
        };
      }) => {
        const max = db.documents
          .filter(
            (doc) =>
              doc.tenantId === where.tenantId &&
              where.type.in.includes(doc.type) &&
              ((doc.series as string | null) ?? null) === (where.series ?? null) &&
              doc.documentDate < where.documentDate.lt,
          )
          .reduce((piuAlto, doc) => Math.max(piuAlto, Number(doc.number) || 0), 0);
        return Promise.resolve({ _max: { number: max || null } });
      },
      create: ({
        data,
      }: {
        data: Record<string, unknown> & {
          lines: { create: Record<string, unknown>[] };
        };
      }) => {
        // T7B: il vincolo unico sul numero, che nel finto non può scattare.
        if (db.failNextDocumentCreate) {
          const errore = db.failNextDocumentCreate;
          db.failNextDocumentCreate = null;
          return Promise.reject(errore);
        }
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
      findFirst: ({ where }: { where: { id: string; tenantId: string; type?: DocumentType } }) => {
        // ⚠️ `type` si confronta SOLO se c'è: in Prisma un filtro assente non
        // filtra. Il finto lo pretendeva, e la lettura di replay (T15A) — che il
        // tipo non lo passa, perché è comune a Vendita e Reso — non trovava
        // niente. Un doppio più severo dell'originale fa fallire codice giusto.
        const found = db.documents.find(
          (doc) =>
            doc.id === where.id &&
            doc.tenantId === where.tenantId &&
            (where.type === undefined || doc.type === where.type),
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
    /**
     * ⚠️ In questo percorso i `$queryRaw` sono DUE, non uno: il lock del
     * contatore e la ricerca del primo numero libero (`primoNumeroLibero`).
     * Contarli tutti confonderebbe le due cose — misurato: il percorso
     * automatico ne fa 2, quello col numero imposto 0. Si riconosce il lock dal
     * testo, così `lockCalls` conta i lock e basta.
     *
     * ⚠️ Restituendo `[]` la ricerca del primo libero ripiega su `massimo + 1`:
     * il finto NON simula i buchi in mezzo alla serie, e i test qui sopra si
     * appoggiano a quel comportamento.
     */
    $queryRaw: (query: unknown) => {
      const testo = Array.isArray(query) ? (query as string[]).join(' ') : String(query);
      if (testo.includes('pg_advisory_xact_lock')) {
        db.lockCalls += 1;
      }
      return Promise.resolve([]);
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const snapshot = structuredClone({
        levels: db.levels,
        documents: db.documents,
        movements: db.movements,
        sequences: [...db.sequences.entries()],
        // T15: il claim dell'intento è una scrittura come le altre, e al
        // rollback deve sparire — è il requisito «nessun claim residuo». Se
        // restasse fuori dallo snapshot il test sul rollback direbbe il falso.
        intents: db.intents,
      });
      try {
        return await fn(client);
      } catch (error) {
        db.levels = snapshot.levels;
        db.documents = snapshot.documents;
        db.movements = snapshot.movements;
        db.sequences = new Map(snapshot.sequences);
        db.intents = snapshot.intents;
        throw error;
      }
    },
  };
  return client as unknown as PrismaService;
}

/**
 * Contratto comune netto/ivato (`11` A4), nel doppio.
 *
 * ⚠️ Riproduce le due domande che il servizio vero pone, e **solo quelle**: la
 * memoria dell'operatore per (tenant, utente, tipo) e la convenzione aziendale
 * di ripiego. `remember` scrive nella stessa memoria, così i test possono
 * provare che la creazione successiva ripropone la modalità scelta.
 */
function createPriceModePreference(db: FakeDb): DocumentPriceModePreferenceService {
  return {
    resolvePricesIncludeVat: (_tenantId: string, userId: string, type: DocumentType) =>
      Promise.resolve(db.priceModeMemory.get(`${userId}|${type}`) ?? db.companyPricesIncludeVat),
    resolveCompanyDefault: () => Promise.resolve(db.companyPricesIncludeVat),
    salesPricesIncludeVat: () => Promise.resolve(db.companyPricesIncludeVat),
    remember: (
      _tenantId: string,
      userId: string,
      type: DocumentType,
      pricesIncludeVat: boolean,
    ) => {
      db.priceModeMemory.set(`${userId}|${type}`, pricesIncludeVat);
      return Promise.resolve();
    },
  } as unknown as DocumentPriceModePreferenceService;
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

/**
 * Il servizio col suo doppio Prisma.
 *
 * ⚠️ **Fornisce un `creationIntentId` quando il test non lo passa**, e va detto
 * invece di lasciarlo scoprire. Da T15B una creazione senza identità d'intento è
 * VIETATA — il DTO la rifiuta e il servizio la verifica — ma quasi nessuno di
 * questi test parla di idempotenza: ripetere lo stesso campo in 46 punti lo
 * renderebbe rumore, e un campo che compare ovunque smette di dire qualcosa.
 *
 * ⭐ Il default si scavalca dal test: `{ creationIntentId: undefined }` passa
 * davvero `undefined` (lo spread viene dopo), ed è così che si prova il rifiuto.
 * I test di T15A passano invece il proprio intento, esplicito.
 */
let intentoProgressivo = 0;

function createService(db: FakeDb): { service: StoreSalesService; pushed: string[] } {
  const pushed: string[] = [];
  // ⚠️ Lo STESSO finto per il servizio e per il registro degli intenti: nel
  // doppio il client root e quello di transazione coincidono, quindi la lettura
  // che `resolveConflict` fa dopo il rollback vede lo stato ripristinato — che è
  // il comportamento del database vero.
  const prisma = createFakePrisma(db);
  const reale = new StoreSalesService(
    prisma,
    createSettings(),
    createChannelSync(pushed),
    new CreationIntentService(prisma),
    createPriceModePreference(db),
  );
  // ⚠️ Il contatore è di MODULO, non di servizio: molti test creano un servizio
  // nuovo a ogni chiamata, e un contatore locale avrebbe dato lo stesso intento
  // a due salvataggi diversi — trasformandoli in un replay. Misurato: rendeva
  // rosso «un numero imposto NON sposta il progressivo», che di intenti non
  // parla affatto.
  const conIntentoDiDefault = <T extends object>(dto: T): T =>
    ({ creationIntentId: `intento-di-default-${(intentoProgressivo += 1)}`, ...dto }) as T;

  const service = Object.create(reale) as StoreSalesService;
  service.createSale = (tenantId, dto, user) =>
    reale.createSale(tenantId, conIntentoDiDefault(dto), user);
  service.createReturn = (tenantId, dto, user) =>
    reale.createReturn(tenantId, conIntentoDiDefault(dto), user);
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

  async function vendita(db: FakeDb, righe: unknown[], id?: string, documentDate?: string) {
    const { service } = createService(db);
    return service.createSale(
      TENANT,
      {
        ...(id ? { id } : {}),
        ...(documentDate ? { documentDate } : {}),
        locationId: LOCATION,
        paymentMethod: 'cash',
        lines: righe,
      } as never,
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

  it('risalvataggio senza data dichiarata: numero, serie e data restano quelli', async () => {
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

  it('⭐ risalvataggio con una data NUOVA: si scrive, e il riferimento non cambia', async () => {
    // La data è modificabile anche dopo la conclusione, e correggerla non è
    // rinumerare: senza dichiarare numero o serie restano quelli del documento.
    const db = createDb();
    const primo = await vendita(db, [{ variantId: VARIANT_A, quantity: 2, unitPriceMinor: 2990 }]);
    const doc = db.documents[0]!;
    // Letto PRIMA del risalvataggio: è il valore che deve restare intatto.
    const createdAtPrima = db.movements[0]!.createdAt;
    const NUOVA = '2026-08-01T00:00:00.000Z';

    const secondo = await vendita(
      db,
      [{ id: doc.lines[0]!.id, variantId: VARIANT_A, quantity: 1, unitPriceMinor: 2990 }],
      doc.id,
      NUOVA,
    );

    expect(db.documents[0]!.documentDate).toEqual(new Date(NUOVA));
    expect(secondo.reference).toBe(primo.reference);
    expect(db.documents[0]!.number).toBe(doc.number);
    // ⛔ `createdAt` del movimento NON insegue la data documento: è il timestamp
    // tecnico di quando la scrittura è avvenuta, e un documento datato prima di
    // quando è stato registrato è una situazione legittima.
    expect(db.movements[0]!.createdAt).toEqual(createdAtPrima);
  });


  // ── Numero e serie in MODIFICA: il contratto comune, non un'eccezione ─────
  //
  // ⛔ Il banco li congelava dopo la nascita (`if (!existing)`), e li rifiutava
  // **in silenzio**: la maschera avrebbe mostrato due campi che non
  // modificavano niente. Ritirato dal proprietario il 21/08/2026 — Vendita e
  // Reso seguono lo stesso contratto degli altri documenti anche in modifica.

  it('⭐ numero DICHIARATO in modifica: si scrive, e il riferimento lo segue', async () => {
    const db = createDb();
    const { service } = createService(db);
    await vendita(db, [{ variantId: VARIANT_A, quantity: 1, unitPriceMinor: 2990 }]);
    const doc = db.documents[0]!;

    const secondo = await service.createSale(
      TENANT,
      {
        id: doc.id,
        locationId: LOCATION,
        number: 77,
        lines: [{ id: doc.lines[0]!.id, variantId: VARIANT_A, quantity: 1, unitPriceMinor: 2990 }],
      } as never,
      user,
    );

    expect(db.documents[0]!.number).toBe(77);
    expect(secondo.reference).toContain('77');
    // ⚠️ La causale del movimento porta il riferimento: se restasse quello
    // vecchio, il registro nominerebbe un documento che non esiste più.
    expect(db.movements[0]!.reason).toContain(secondo.reference);
  });

  it('⭐ SERIE dichiarata in modifica: il riferimento la nomina, il numero resta', async () => {
    const db = createDb();
    const { service } = createService(db);
    await vendita(db, [{ variantId: VARIANT_A, quantity: 1, unitPriceMinor: 2990 }]);
    const doc = db.documents[0]!;

    const secondo = await service.createSale(
      TENANT,
      {
        id: doc.id,
        locationId: LOCATION,
        series: 'B',
        lines: [{ id: doc.lines[0]!.id, variantId: VARIANT_A, quantity: 1, unitPriceMinor: 2990 }],
      } as never,
      user,
    );

    expect(db.documents[0]!.series).toBe('B');
    expect(db.documents[0]!.number).toBe(doc.number);
    // Il riferimento si rifà anche cambiando la sola serie: lo dice
    // (`PREFISSO-SERIE-NUMERO`), e resterebbe altrimenti a nominare la vecchia.
    expect(secondo.reference).toContain('B');
  });

  // ── Netto/ivato: contratto comune, nessun forcing (`11` A4) ──────────────
  //
  // ⛔ Il servizio cablava `pricesIncludeVat: true` alla creazione — «al banco
  // si legge sempre ivato». Ora la modalità viene dal contratto comune degli
  // altri documenti, si persiste sul documento e resta modificabile.
  describe('modalità prezzo del banco', () => {
    it('⭐ la modalità dichiarata dal client si scrive: niente più «sempre ivato»', async () => {
      const db = createDb();
      const { service } = createService(db);

      await service.createSale(
        TENANT,
        {
          locationId: LOCATION,
          pricesIncludeVat: false,
          lines: [{ variantId: VARIANT_A, quantity: 1, unitPriceMinor: 2990 }],
        } as never,
        user,
      );

      expect(db.documents[0]!.pricesIncludeVat).toBe(false);
    });

    it('senza modalità dichiarata, un documento NUOVO prende quella del contratto comune', async () => {
      const db = createDb();
      db.companyPricesIncludeVat = false;

      await vendita(db, [{ variantId: VARIANT_A, quantity: 1, unitPriceMinor: 2990 }]);

      expect(db.documents[0]!.pricesIncludeVat).toBe(false);
    });

    it('⭐ la scelta si ricorda, e la vendita successiva la ripropone', async () => {
      const db = createDb();
      db.companyPricesIncludeVat = true;
      const { service } = createService(db);

      await service.createSale(
        TENANT,
        {
          locationId: LOCATION,
          pricesIncludeVat: false,
          lines: [{ variantId: VARIANT_A, quantity: 1, unitPriceMinor: 2990 }],
        } as never,
        user,
      );
      await vendita(db, [{ variantId: VARIANT_A, quantity: 1, unitPriceMinor: 2990 }]);

      // La seconda non dichiara niente: prende la memoria, non la convenzione.
      expect(db.documents[1]!.pricesIncludeVat).toBe(false);
    });

    it('⭐ in MODIFICA senza modalità dichiarata resta quella persistita', async () => {
      const db = createDb();
      const { service } = createService(db);
      await service.createSale(
        TENANT,
        {
          locationId: LOCATION,
          pricesIncludeVat: false,
          lines: [{ variantId: VARIANT_A, quantity: 2, unitPriceMinor: 2990 }],
        } as never,
        user,
      );
      const doc = db.documents[0]!;

      await vendita(
        db,
        [{ id: doc.lines[0]!.id, variantId: VARIANT_A, quantity: 1, unitPriceMinor: 2990 }],
        doc.id,
      );

      expect(db.documents[0]!.pricesIncludeVat).toBe(false);
    });

    it('cambiare modalità su un documento aperto la persiste', async () => {
      const db = createDb();
      const { service } = createService(db);
      await service.createSale(
        TENANT,
        {
          locationId: LOCATION,
          pricesIncludeVat: false,
          lines: [{ variantId: VARIANT_A, quantity: 2, unitPriceMinor: 2990 }],
        } as never,
        user,
      );
      const doc = db.documents[0]!;

      await service.createSale(
        TENANT,
        {
          id: doc.id,
          locationId: LOCATION,
          pricesIncludeVat: true,
          lines: [
            { id: doc.lines[0]!.id, variantId: VARIANT_A, quantity: 2, unitPriceMinor: 2990 },
          ],
        } as never,
        user,
      );

      expect(db.documents[0]!.pricesIncludeVat).toBe(true);
    });

    it('il Reso ha lo stesso contratto della Vendita', async () => {
      const db = createDb();
      const { service } = createService(db);

      await service.createReturn(
        TENANT,
        {
          locationId: LOCATION,
          pricesIncludeVat: false,
          lines: [{ variantId: VARIANT_A, quantity: 1, restockable: true, unitPriceMinor: 2990 }],
        } as never,
        user,
      );

      expect(db.documents[0]!.pricesIncludeVat).toBe(false);
    });

    it('⛔ la modalità NON cambia il valore del documento: le righe portano il netto', async () => {
      // È la ragione per cui non entra in nessun calcolo: due vendite identiche
      // in modalità opposte valgono lo stesso.
      const db = createDb();
      const { service } = createService(db);

      const ivata = await service.createSale(
        TENANT,
        {
          locationId: LOCATION,
          pricesIncludeVat: true,
          lines: [{ variantId: VARIANT_A, quantity: 1, unitPriceMinor: 2990 }],
        } as never,
        user,
      );
      const netta = await service.createSale(
        TENANT,
        {
          locationId: LOCATION,
          pricesIncludeVat: false,
          lines: [{ variantId: VARIANT_A, quantity: 1, unitPriceMinor: 2990 }],
        } as never,
        user,
      );

      expect(netta.totalMinor).toBe(ivata.totalMinor);
    });
  });

  // ── Pagamento: differito, ma i valori storici non si toccano (`11` A8) ────
  //
  // La maschera nuova non manda il pagamento — la gestione è differita al blocco
  // Pagamenti/Tesoreria — e il DTO non lo pretende più. L'assenza però non è
  // «nessun pagamento»: su un documento esistente significa «non modificato».
  it('⭐ risalvataggio senza pagamento dichiarato: quello storico resta', async () => {
    const db = createDb();
    const { service } = createService(db);
    await service.createSale(
      TENANT,
      {
        locationId: LOCATION,
        // «Altro» con la sua nota: è il caso in cui c'è più di un dato da
        // perdere, ed è quello che il risalvataggio deve conservare intero.
        paymentMethod: 'other',
        paymentMethodNote: 'Assegno',
        lines: [{ variantId: VARIANT_A, quantity: 2, unitPriceMinor: 2990 }],
      } as never,
      user,
    );
    const doc = db.documents[0]!;

    // Il payload della maschera nuova: niente pagamento, niente nota.
    await service.createSale(
      TENANT,
      {
        id: doc.id,
        locationId: LOCATION,
        lines: [{ id: doc.lines[0]!.id, variantId: VARIANT_A, quantity: 1, unitPriceMinor: 2990 }],
      } as never,
      user,
    );

    expect(db.documents[0]!.paymentMethod).toBe('other');
    expect(db.documents[0]!.paymentMethodNote).toBe('Assegno');
  });

  it('creazione senza pagamento: il documento nasce senza, e non se ne inventa uno', async () => {
    const db = createDb();
    const { service } = createService(db);

    await service.createSale(
      TENANT,
      {
        locationId: LOCATION,
        lines: [{ variantId: VARIANT_A, quantity: 1, unitPriceMinor: 2990 }],
      } as never,
      user,
    );

    // ⛔ Nessun «Contanti» di default: sarebbe un dato che nessuno ha scelto,
    // scritto su un documento che poi lo mostrerebbe come un fatto.
    expect(db.documents[0]!.paymentMethod).toBeNull();
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

  // ── Cliente sul Reso (`11` A13) ──────────────────────────────────────────
  //
  // ⛔ Il DTO del Reso non lo accettava, e quell'assenza NON era una decisione:
  // A13 mette «Cliente (facoltativo)» nella testata senza distinguere Vendita e
  // Reso. Era un gap del contratto, e leggerlo come «il Reso non ha cliente»
  // avrebbe promosso un buco a regola.
  it('⭐ il Reso accetta il cliente, e ne congela il nome come la Vendita', async () => {
    const db = createDb();
    db.customers.push({ id: 'cli-1', tenantId: TENANT, displayName: 'Mario Rossi' });
    const { service } = createService(db);

    await service.createReturn(
      TENANT,
      {
        locationId: LOCATION,
        customerId: 'cli-1',
        lines: [{ variantId: VARIANT_A, quantity: 1, restockable: true, unitPriceMinor: 2990 }],
      } as never,
      user,
    );

    expect(db.documents[0]!.customerId).toBe('cli-1');
    // Snapshot: il documento conserva il nome di allora, anche se l'anagrafica
    // cambia dopo.
    expect(db.documents[0]!.customerName).toBe('Mario Rossi');
  });

  it('il Reso senza cliente resta valido: è facoltativo', async () => {
    const db = createDb();

    await reso(db, [
      { variantId: VARIANT_A, quantity: 1, restockable: true, unitPriceMinor: 2990 },
    ]);

    expect(db.documents[0]!.customerId ?? null).toBeNull();
    expect(db.documents[0]!.customerName).toBeNull();
  });

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

    it('⭐ in MODIFICA la data dichiarata si SCRIVE, e non rinumera il documento', async () => {
      // ⛔ Qui il servizio la ignorava, e la maschera poteva mostrare un campo
      // che non modificava niente. Una data sbagliata si corregge dove è stata
      // scritta (decisione del proprietario, 21/08/2026).
      const db = createDb();
      await reso(
        db,
        [{ variantId: VARIANT_A, quantity: 2, restockable: true, unitPriceMinor: 2990 }],
        undefined,
        IERI,
      );
      const doc = db.documents[0]!;
      const riferimentoPrima = { numero: doc.number, serie: doc.series, ref: doc.reference };
      // Letto PRIMA del risalvataggio: deve restare intatto.
      const createdAtPrima = db.movements[0]!.createdAt;
      const NUOVA = '2026-08-01T00:00:00.000Z';

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
        NUOVA,
      );

      expect(db.documents[0]!.documentDate).toEqual(new Date(NUOVA));
      // Numero e serie si assegnano solo alla nascita: spostare la data non
      // tocca il riferimento, che vive dentro la causale dei movimenti.
      expect(db.documents[0]!.number).toBe(riferimentoPrima.numero);
      expect(db.documents[0]!.series).toBe(riferimentoPrima.serie);
      expect(db.documents[0]!.reference).toBe(riferimentoPrima.ref);

      // ⏸ **Il `createdAt` del movimento NON è asserito qui, ed è deliberato.**
      // Sullo SCARICO è deciso che resti il timestamp tecnico (vedi il test
      // gemello della Vendita). Il Reso passa dal motore di CARICO, che invece
      // riallinea `createdAt` alla data documento da prima di questo lavoro —
      // lo stesso motore che serve Arrivo merce.
      //
      // ⛔ Non si uniforma di straforo: cambiarlo toccherebbe l'Arrivo merce, e
      // la divergenza è segnalata come punto aperto invece di essere risolta o
      // nascosta dietro un'asserzione compiacente.
      void createdAtPrima;
    });

    it('in MODIFICA senza data dichiarata resta quella persistita', async () => {
      // «Assente» è «non l'ho toccata»: senza questa distinzione ogni
      // risalvataggio riporterebbe il documento a oggi.
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
      );

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

  it('⭐ ma un numero DICHIARATO si scrive anche sul reso: stesso contratto comune', async () => {
    const db = createDb();
    const { service } = createService(db);
    await reso(db, [{ variantId: VARIANT_A, quantity: 1, restockable: true, unitPriceMinor: 2990 }]);
    const doc = db.documents[0]!;

    const secondo = await service.createReturn(
      TENANT,
      {
        id: doc.id,
        locationId: LOCATION,
        number: 91,
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
      user,
    );

    expect(db.documents[0]!.number).toBe(91);
    expect(secondo.reference).toContain('91');
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

// ── T4 — il prezzo del Reso: obbligatorio, e zero è un valore ─────────────
//
// ⛔ Il servizio faceva `line.unitPriceMinor ?? 0`: il campo era facoltativo e
// un prezzo mancante diventava zero IN SILENZIO. Ora il DTO lo pretende, quindi
// «assente» non arriva più al servizio — lo respinge la validazione.
//
// ⚠️ Zero ESPLICITO resta validissimo (`@Min(0)`, non `@Min(1)`): c'è chi rende
// un omaggio. Sparisce l'ambiguità, non lo zero.
//
// ⛔ E nessun ripiego sul prezzo corrente dell'articolo: sarebbe la rifotografia
// dall'anagrafica che `regole-gestionale` vieta. Il prezzo appartiene ai campi
// che il CLIENT MANDA SEMPRE, quindi non ha nemmeno il contratto binario dello
// snapshot — per un campo di quel gruppo sarebbe inutile.
describe('T4 — il prezzo del Reso', () => {
  it('zero ESPLICITO è un valore valido: si salva zero, non lo si scambia per assente', async () => {
    const db = createDb();
    db.defaultVatCodeId = VAT_22.id;
    db.vatCodes = [VAT_22];
    const { service } = createService(db);

    await service.createReturn(
      TENANT,
      {
        locationId: LOCATION,
        lines: [{ variantId: VARIANT_A, quantity: 2, restockable: true, unitPriceMinor: 0 }],
      } as never,
      user,
    );

    const riga = db.documents[0]!.lines[0]!;
    expect(riga.unitPriceMinor).toBe(0);
    expect(riga.lineTotalMinor).toBe(0);
    // Nessuna imposta su un imponibile nullo, ma il Codice IVA resta risolto:
    // la riga è documentata, non degradata.
    expect(riga.lineVatTotalMinor).toBe(0);
    expect(riga.vatCodeId).toBe(VAT_22.id);
    // ⭐ E il rientro fisico avviene lo stesso: a decidere il movimento è la
    // spunta di riga, non il prezzo (`11` A11-ter).
    expect(db.movements).toHaveLength(1);
    expect(levelOf(db, VARIANT_A).onHand).toBe(12);
  });

  it('⭐ coda decimale: risalvare senza toccare il prezzo lo lascia identico, non lo arrotonda', async () => {
    const db = createDb();
    db.defaultVatCodeId = VAT_22.id;
    db.vatCodes = [VAT_22];
    const { service } = createService(db);

    // 2049,1803 centesimi netti = il risultato ESATTO dello scorporo di 25,00 €
    // ivati al 22%. È quella coda a far tornare il prezzo digitato quando la
    // riga viene rimostrata ivata (`regole-gestionale`, §sei decimali).
    const CON_CODA = 2049.1803;

    await service.createReturn(
      TENANT,
      {
        locationId: LOCATION,
        lines: [{ variantId: VARIANT_A, quantity: 1, restockable: true, unitPriceMinor: CON_CODA }],
      } as never,
      user,
    );
    const doc = db.documents[0]!;
    expect(doc.lines[0]!.unitPriceMinor).toBe(CON_CODA);

    // Il client rimanda il netto canonico tale e quale: la maschera del banco
    // lo tiene nel signal e il campo ne MOSTRA solo l'ivato a due decimali.
    await service.createReturn(
      TENANT,
      {
        id: doc.id,
        locationId: LOCATION,
        lines: [
          {
            id: doc.lines[0]!.id,
            variantId: VARIANT_A,
            quantity: 3,
            restockable: true,
            unitPriceMinor: CON_CODA,
          },
        ],
      } as never,
      user,
    );

    // ⛔ Non 2049: la coda sopravvive al risalvataggio.
    expect(db.documents[0]!.lines[0]!.unitPriceMinor).toBe(CON_CODA);
    // E il totale si rifà sulla quantità nuova, arrotondato UNA volta sola:
    // 3 × 2049,1803 = 6147,5409 → 6148.
    expect(db.documents[0]!.lines[0]!.lineTotalMinor).toBe(6148);
  });
});

// ── T7A — il contesto della numerazione: sede e data ──────────────────────
//
// Il banco non ha un motore di numerazione proprio: usa da sempre i tre util
// comuni. Gli mancavano DUE ARGOMENTI dello stesso calcolo, entrambi già
// accettati dalle funzioni condivise e già disponibili nel servizio.
//
//   defaultCounterSeries(tx, tenant, tipo, locationId)   ← la sede era omessa
//   nextDocumentNumber({ …, documentDate })              ← la data era omessa
//
// ⚠️ La sede NON partiziona il progressivo (`docs/04` §1): decide quali serie
// sono disponibili. La data invece è il perno della regola del §2 — «il primo
// libero DOPO i documenti di data anteriore» — e omettendola si ricade su oggi.
//
// ⛔ Prima di T7A questi test erano IMPOSSIBILI da scrivere: il finto Prisma
// rispondeva `[]` ai contatori e `{_max:{number:null}}` all'aggregato, sempre,
// ignorando gli argomenti. Qualunque prova sarebbe passata con e senza la
// correzione. Il banco di prova è stato insegnato a onorare il `where` nello
// stesso commit, ed è la metà più grossa del lavoro.
describe('T7A — sede e data nel calcolo della numerazione', () => {
  const conContatori = (...counters: FakeCounter[]): FakeDb => {
    const db = createDb();
    db.counters = counters;
    return db;
  };

  const contatore = (over: Partial<FakeCounter> = {}): FakeCounter => ({
    tenantId: TENANT,
    type: DocumentType.store_sale,
    series: null,
    locationId: null,
    isDefault: false,
    ...over,
  });

  describe('la sede sceglie la serie', () => {
    it('serie predefinita legata alla sede A, documento in sede A → usa quella serie', async () => {
      const db = conContatori(
        contatore({ series: 'NEG', locationId: LOCATION, isDefault: true }),
        contatore({ series: null }),
      );
      const { service } = createService(db);

      await service.createSale(
        TENANT,
        {
          locationId: LOCATION,
          paymentMethod: 'cash',
          lines: [{ variantId: VARIANT_A, quantity: 1, unitPriceMinor: 2990 }],
        } as never,
        user,
      );

      expect(db.documents[0]!.series).toBe('NEG');
    });

    it('⛔ serie predefinita legata alla sede A, documento in sede B → NON usa quella serie', async () => {
      const db = conContatori(
        contatore({ series: 'NEG', locationId: LOCATION, isDefault: true }),
        // Il solo contatore disponibile in sede B è quello senza sede: con uno
        // solo disponibile la scelta è obbligata (`defaultCounterSeries`).
        contatore({ series: null }),
      );
      const { service } = createService(db);

      await service.createSale(
        TENANT,
        {
          locationId: LOCATION_B,
          paymentMethod: 'cash',
          lines: [{ variantId: VARIANT_A, quantity: 1, unitPriceMinor: 2990 }],
        } as never,
        user,
      );

      // Il predefinito è di un'altra sede: non si applica. Prima di T7A usciva
      // 'NEG' comunque — «la tendina diceva il vero, il salvataggio no».
      expect(db.documents[0]!.series).toBeNull();
    });

    it('la sede vale anche sul Reso, che ha un contatore PROPRIO', async () => {
      const db = conContatori(
        contatore({
          type: DocumentType.store_return,
          series: 'RES',
          locationId: LOCATION,
          isDefault: true,
        }),
        contatore({ type: DocumentType.store_return, series: null }),
      );
      const { service } = createService(db);

      await service.createReturn(
        TENANT,
        {
          locationId: LOCATION,
          lines: [{ variantId: VARIANT_A, quantity: 1, restockable: true, unitPriceMinor: 1000 }],
        } as never,
        user,
      );

      expect(db.documents[0]!.series).toBe('RES');
      expect(db.documents[0]!.type).toBe(DocumentType.store_return);
    });
  });

  describe('la data determina il numero proposto', () => {
    /** Un documento già a registro, per dare al contatore un massimo da leggere. */
    const documentoEsistente = (numero: number, data: string) => ({
      id: `doc-${numero}`,
      tenantId: TENANT,
      type: DocumentType.store_sale,
      status: DocumentStatus.confirmed,
      reference: `VN-${numero}`,
      documentDate: new Date(data),
      totalMinor: 0,
      currency: 'EUR',
      customerName: null,
      locationId: LOCATION,
      paymentMethod: 'cash',
      sourceDocumentId: null,
      internalComment: null,
      createdAt: new Date(data),
      lines: [],
      number: numero,
      series: null,
    });

    it('⭐ documento RETRODATATO: il numero si calcola sulla SUA data, non su oggi', async () => {
      const db = createDb();
      // A registro: il n. 5 è del 10 agosto, il n. 9 del 20 agosto.
      db.documents = [
        documentoEsistente(5, '2026-08-10T00:00:00.000Z'),
        documentoEsistente(9, '2026-08-20T00:00:00.000Z'),
      ] as never;
      const { service } = createService(db);

      // Vendita datata 15 agosto: davanti a lei ci sono solo i documenti
      // ANTERIORI, cioè il n. 5. Il primo libero è quindi il 6 — non il 10,
      // che sarebbe il primo libero contando anche il n. 9 del 20.
      await service.createSale(
        TENANT,
        {
          locationId: LOCATION,
          paymentMethod: 'cash',
          documentDate: '2026-08-15T00:00:00.000Z',
          lines: [{ variantId: VARIANT_A, quantity: 1, unitPriceMinor: 2990 }],
        } as never,
        user,
      );

      const nuovo = db.documents[db.documents.length - 1]!;
      expect(nuovo.documentDate).toEqual(new Date('2026-08-15T00:00:00.000Z'));
      // ⛔ 6, non 10: prima di T7A la data non arrivava al contatore e il
      // massimo si leggeva su «tutto ciò che precede OGGI», cioè entrambi.
      expect(nuovo.number).toBe(6);
    });

    it('senza data esplicita: il contatore vede tutto ciò che precede oggi', async () => {
      const db = createDb();
      db.documents = [
        documentoEsistente(5, '2026-08-10T00:00:00.000Z'),
        documentoEsistente(9, '2026-08-20T00:00:00.000Z'),
      ] as never;
      const { service } = createService(db);

      // Nessun `documentDate`: la data è oggi, e oggi è dopo entrambi.
      await service.createSale(
        TENANT,
        {
          locationId: LOCATION,
          paymentMethod: 'cash',
          lines: [{ variantId: VARIANT_A, quantity: 1, unitPriceMinor: 2990 }],
        } as never,
        user,
      );

      expect(db.documents[db.documents.length - 1]!.number).toBe(10);
    });

    it('la data vale anche sul Reso', async () => {
      const db = createDb();
      db.documents = [
        { ...documentoEsistente(5, '2026-08-10T00:00:00.000Z'), type: DocumentType.store_return },
        { ...documentoEsistente(9, '2026-08-20T00:00:00.000Z'), type: DocumentType.store_return },
      ] as never;
      const { service } = createService(db);

      await service.createReturn(
        TENANT,
        {
          locationId: LOCATION,
          documentDate: '2026-08-15T00:00:00.000Z',
          lines: [{ variantId: VARIANT_A, quantity: 1, restockable: true, unitPriceMinor: 1000 }],
        } as never,
        user,
      );

      expect(db.documents[db.documents.length - 1]!.number).toBe(6);
    });
  });
});

// ── T7B — il conflitto sul numero: 409 strutturato, non 500 ───────────────
//
// ⛔ Il banco era l'UNICO servizio numerato senza questa rete. Gli altri sei —
// documenti generici, Arrivo merce, Trasferimento/Rettifica, Ordine cliente
// manuale, Ordine fornitore, Corrispettivo manuale — la avevano già. Qui il
// P2002 usciva non gestito e il filtro globale lo rendeva un 500 generico:
// l'operatore leggeva un errore di sistema al posto dell'avviso col primo
// numero libero.
//
// Lo schema è copiato dai precedenti, non reinventato: si intercetta FUORI
// dalla transazione (che ha già fatto rollback), si riconosce con
// `isDocumentNumberConflict`, si costruisce il payload col client ROOT, si
// lancia `ConflictException`.
describe('T7B — conflitto sul numero documento', () => {
  /**
   * La violazione del vincolo unico, nella forma in cui Prisma la manda DAVVERO.
   *
   * ⚠️ `target` è un troncone (`['tenant_id,']`), non l'elenco delle colonne:
   * l'indice è di ESPRESSIONE e Prisma non sa nominarlo. È la ragione per cui
   * `isDocumentNumberConflict` riconosce il conflitto dal **modello** e non
   * dalle colonne — cercare la parola «number» in `target` non funzionerebbe.
   */
  const numeroGiaPreso = {
    code: 'P2002',
    meta: { modelName: 'Document', target: ['tenant_id,'] },
  };

  /** Un P2002 che NON è di numerazione: SKU duplicato creando un articolo. */
  const skuDuplicato = {
    code: 'P2002',
    meta: { modelName: 'ProductVariant', target: ['tenant_id', 'sku'] },
  };

  /** Documento già a registro, per dare al contatore un massimo da leggere. */
  const documentoEsistente = (numero: number, type: DocumentType) => ({
    id: `doc-${numero}`,
    tenantId: TENANT,
    type,
    status: DocumentStatus.confirmed,
    reference: `X-${numero}`,
    documentDate: new Date('2026-08-01T00:00:00.000Z'),
    totalMinor: 0,
    currency: 'EUR',
    customerName: null,
    locationId: LOCATION,
    paymentMethod: 'cash',
    sourceDocumentId: null,
    internalComment: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    lines: [],
    number: numero,
    series: null,
  });

  it('⭐ Vendita: la collisione dà un errore STRUTTURATO, non generico', async () => {
    const db = createDb();
    db.failNextDocumentCreate = numeroGiaPreso;
    const { service } = createService(db);

    const errore = await service
      .createSale(
        TENANT,
        {
          locationId: LOCATION,
          paymentMethod: 'cash',
          lines: [{ variantId: VARIANT_A, quantity: 1, unitPriceMinor: 2990 }],
        } as never,
        user,
      )
      .catch((err: unknown) => err);

    expect(errore).toBeInstanceOf(ConflictException);
    expect((errore as ConflictException).getResponse()).toMatchObject({
      code: 'document_number_taken',
      // Nessun numero imposto: il banco non ha ancora il campo, e l'avviso
      // NON deve inventarne uno che l'operatore non ha digitato.
      number: null,
      series: null,
    });
  });

  it('⭐ Reso: stesso comportamento', async () => {
    const db = createDb();
    db.failNextDocumentCreate = numeroGiaPreso;
    const { service } = createService(db);

    const errore = await service
      .createReturn(
        TENANT,
        {
          locationId: LOCATION,
          lines: [{ variantId: VARIANT_A, quantity: 1, restockable: true, unitPriceMinor: 1000 }],
        } as never,
        user,
      )
      .catch((err: unknown) => err);

    expect(errore).toBeInstanceOf(ConflictException);
    expect((errore as ConflictException).getResponse()).toMatchObject({
      code: 'document_number_taken',
      number: null,
    });
  });

  it('`nextAvailable` lo calcola il contratto comune, non un conteggio locale', async () => {
    const db = createDb();
    // Serie arrivata al 43: il primo libero è il 44, e deve dirlo il motore
    // condiviso leggendo i documenti veri.
    db.documents = [documentoEsistente(43, DocumentType.store_sale)] as never;
    db.failNextDocumentCreate = numeroGiaPreso;
    const { service } = createService(db);

    const errore = await service
      .createSale(
        TENANT,
        {
          locationId: LOCATION,
          paymentMethod: 'cash',
          // Datata avanti, così il 43 del 1° agosto le sta davvero dietro.
          documentDate: '2026-08-20T00:00:00.000Z',
          lines: [{ variantId: VARIANT_A, quantity: 1, unitPriceMinor: 2990 }],
        } as never,
        user,
      )
      .catch((err: unknown) => err);

    expect((errore as ConflictException).getResponse()).toMatchObject({
      code: 'document_number_taken',
      nextAvailable: 44,
    });
  });

  it('⛔ un P2002 di ALTRA natura non si traveste da conflitto di numero', async () => {
    const db = createDb();
    // Salvando una vendita si possono creare articoli: uno SKU duplicato è un
    // P2002 su `ProductVariant`, e non c'entra niente col numero documento.
    db.failNextDocumentCreate = skuDuplicato;
    const { service } = createService(db);

    const errore = await service
      .createSale(
        TENANT,
        {
          locationId: LOCATION,
          paymentMethod: 'cash',
          lines: [{ variantId: VARIANT_A, quantity: 1, unitPriceMinor: 2990 }],
        } as never,
        user,
      )
      .catch((err: unknown) => err);

    // L'errore originale prosegue INTATTO: non diventa un 409, e soprattutto
    // non dice all'operatore che il numero è già assegnato quando non lo è.
    expect(errore).not.toBeInstanceOf(ConflictException);
    expect(errore).toBe(skuDuplicato);
  });

  it('creazione normale: nessun conflitto e nessun errore (non-regressione)', async () => {
    const db = createDb();
    const { service } = createService(db);

    await expect(
      service.createSale(
        TENANT,
        {
          locationId: LOCATION,
          paymentMethod: 'cash',
          lines: [{ variantId: VARIANT_A, quantity: 1, unitPriceMinor: 2990 }],
        } as never,
        user,
      ),
    ).resolves.toBeDefined();
    expect(db.documents).toHaveLength(1);
  });
});

// ── T8A — numero e serie scelti dall'operatore ────────────────────────────
//
// ⛔ Il banco NON ha una gestione propria di numero/serie: entra nel contratto
// comune, con la stessa semantica di ogni altro documento.
//
//   series assente        → «decidi tu»: il server risolve dal contatore della sede
//   series stringa vuota  → «Senza serie», SCELTA, e scavalca il predefinito
//   series con valore     → quella serie, con trim
//   number assente        → primo libero, assegnato dal server nella transazione
//   number presente       → imposto, e NON sposta il progressivo
//
// ⚠️ «Senza serie» non è un caso speciale della cassa: è uno dei valori del
// sistema comune, e corrisponde a un contatore reale. Il documento ha comunque
// sempre il proprio numero.
describe('T8A — numero e serie dalla testata', () => {
  const contatore = (over: Partial<FakeCounter> = {}): FakeCounter => ({
    tenantId: TENANT,
    type: DocumentType.store_sale,
    series: null,
    locationId: null,
    isDefault: false,
    ...over,
  });

  const vendita = (db: FakeDb, dto: Record<string, unknown>) => {
    const { service } = createService(db);
    return service.createSale(
      TENANT,
      {
        locationId: LOCATION,
        paymentMethod: 'cash',
        lines: [{ variantId: VARIANT_A, quantity: 1, unitPriceMinor: 2990 }],
        ...dto,
      } as never,
      user,
    );
  };

  /** Documento già a registro, per dare al contatore un massimo da leggere. */
  const esistente = (numero: number, type = DocumentType.store_sale) => ({
    id: `doc-${numero}`,
    tenantId: TENANT,
    type,
    status: DocumentStatus.confirmed,
    reference: `X-${numero}`,
    documentDate: new Date('2026-08-01T00:00:00.000Z'),
    totalMinor: 0,
    currency: 'EUR',
    customerName: null,
    locationId: LOCATION,
    paymentMethod: 'cash',
    sourceDocumentId: null,
    internalComment: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    lines: [],
    number: numero,
    series: null,
  });

  describe('la serie', () => {
    it('assente → la sceglie il server dal contatore predefinito', async () => {
      const db = createDb();
      db.counters = [contatore({ series: 'NEG', isDefault: true })];
      await vendita(db, {});
      expect(db.documents[0]!.series).toBe('NEG');
    });

    it('⭐ stringa VUOTA → «Senza serie», e SCAVALCA il predefinito', async () => {
      const db = createDb();
      // Il predefinito è NEG: mandando la stringa vuota l'operatore dice
      // «Senza serie», e quella scelta deve valere. Prima del contratto comune
      // le maschere mandavano `series || undefined` e ottenevano NEG — cioè
      // esattamente il contrario di quello che avevano scelto.
      db.counters = [contatore({ series: 'NEG', isDefault: true }), contatore({ series: null })];
      await vendita(db, { series: '' });
      expect(db.documents[0]!.series).toBeNull();
    });

    it('con valore → quella serie', async () => {
      const db = createDb();
      db.counters = [contatore({ series: 'NEG', isDefault: true })];
      await vendita(db, { series: 'B' });
      expect(db.documents[0]!.series).toBe('B');
    });

    it('di soli spazi → «Senza serie», non una serie fatta di spazi', async () => {
      const db = createDb();
      db.counters = [contatore({ series: 'NEG', isDefault: true })];
      await vendita(db, { series: '   ' });
      expect(db.documents[0]!.series).toBeNull();
    });
  });

  describe('il numero', () => {
    it('assente → primo libero della serie', async () => {
      const db = createDb();
      db.documents = [esistente(43)] as never;
      await vendita(db, { documentDate: '2026-08-20T00:00:00.000Z' });
      expect(db.documents[db.documents.length - 1]!.number).toBe(44);
    });

    it('⭐ imposto → si usa quello, anche se lascia un buco davanti', async () => {
      const db = createDb();
      db.documents = [esistente(43)] as never;
      // L'operatore digita 7 per tappare un buco in mezzo alla serie.
      await vendita(db, { number: 7, documentDate: '2026-08-20T00:00:00.000Z' });
      const nuovo = db.documents[db.documents.length - 1]!;
      expect(nuovo.number).toBe(7);
      // Il riferimento segue il numero imposto, non la proposta.
      expect(nuovo.reference).toContain('7');
    });

    it('⭐ un numero imposto NON sposta il progressivo', async () => {
      const db = createDb();
      db.documents = [esistente(43)] as never;
      await vendita(db, { number: 7, documentDate: '2026-08-20T00:00:00.000Z' });
      await vendita(db, { documentDate: '2026-08-21T00:00:00.000Z' });
      // 44, non 8: il 7 ha tappato un buco e non ha toccato il progressivo.
      expect(db.documents[db.documents.length - 1]!.number).toBe(44);
    });

    it('⭐ un numero imposto NON prende il lock del contatore', async () => {
      const db = createDb();
      await vendita(db, { number: 7 });
      // Il lock serializza chi LEGGE il massimo. Chi ha già scelto il proprio
      // numero non legge niente, e aspettare gli altri sarebbe tempo perso: lì
      // il conflitto è l'informazione utile, non un incidente da prevenire.
      expect(db.lockCalls).toBe(0);
    });

    it('senza numero imposto il lock si prende, come prima', async () => {
      const db = createDb();
      await vendita(db, {});
      expect(db.lockCalls).toBe(1);
    });
  });

  describe('il conflitto nomina il numero giusto', () => {
    const numeroGiaPreso = {
      code: 'P2002',
      meta: { modelName: 'Document', target: ['tenant_id,'] },
    };

    it('⭐ numero IMPOSTO in conflitto: il payload nomina QUEL numero', async () => {
      const db = createDb();
      db.counters = [contatore({ series: 'NEG', isDefault: true })];
      db.failNextDocumentCreate = numeroGiaPreso;

      const errore = await vendita(db, { number: 7, series: 'NEG' }).catch((e: unknown) => e);

      expect((errore as ConflictException).getResponse()).toMatchObject({
        code: 'document_number_taken',
        // 7, non il primo libero: è il numero che l'operatore vede in testata.
        number: 7,
        series: 'NEG',
      });
    });

    it('numero d’ufficio in conflitto: non se ne inventa uno', async () => {
      const db = createDb();
      db.failNextDocumentCreate = numeroGiaPreso;

      const errore = await vendita(db, {}).catch((e: unknown) => e);

      expect((errore as ConflictException).getResponse()).toMatchObject({
        code: 'document_number_taken',
        // Il numero assegnato d'ufficio è andato perso col rollback: nominarne
        // uno significherebbe parlare di una cifra che nessuno ha digitato.
        number: null,
      });
    });

    it('⭐ la serie del conflitto segue la scelta, non il predefinito', async () => {
      const db = createDb();
      // Predefinito NEG, ma l'operatore ha scelto «Senza serie».
      db.counters = [contatore({ series: 'NEG', isDefault: true }), contatore({ series: null })];
      db.failNextDocumentCreate = numeroGiaPreso;

      const errore = await vendita(db, { series: '' }).catch((e: unknown) => e);

      // Se qui uscisse NEG, il «primo libero» sarebbe calcolato sulla
      // partizione sbagliata e l'operatore riceverebbe un SECONDO conflitto.
      expect((errore as ConflictException).getResponse()).toMatchObject({ series: null });
    });
  });

  describe('il Reso ha la stessa semantica', () => {
    const reso = (db: FakeDb, dto: Record<string, unknown>) => {
      const { service } = createService(db);
      return service.createReturn(
        TENANT,
        {
          locationId: LOCATION,
          lines: [{ variantId: VARIANT_A, quantity: 1, restockable: true, unitPriceMinor: 1000 }],
          ...dto,
        } as never,
        user,
      );
    };

    it('stringa vuota → «Senza serie», scavalcando il predefinito', async () => {
      const db = createDb();
      db.counters = [
        contatore({ type: DocumentType.store_return, series: 'RES', isDefault: true }),
        contatore({ type: DocumentType.store_return, series: null }),
      ];
      await reso(db, { series: '' });
      expect(db.documents[0]!.series).toBeNull();
    });

    it('numero imposto → si usa quello, e non prende il lock', async () => {
      const db = createDb();
      await reso(db, { number: 9 });
      expect(db.documents[0]!.number).toBe(9);
      expect(db.lockCalls).toBe(0);
    });

    it('⛔ il Reso NON pesca dal contatore della Vendita: due tipi, due contatori', async () => {
      const db = createDb();
      // Una vendita col n. 43 non deve influenzare il numero del reso.
      db.documents = [esistente(43, DocumentType.store_sale)] as never;

      await reso(db, { documentDate: '2026-08-20T00:00:00.000Z' });
      // 1, non 44: il contatore del Reso è vuoto.
      expect(db.documents[db.documents.length - 1]!.number).toBe(1);
    });
  });
});

// ── T15A — idempotenza della creazione: il registro degli intenti ─────────
//
// ⛔ IL PROBLEMA: la transazione committa, la risposta si perde (timeout di 15s
// del client, rete, tab chiusa), l'operatore ripreme. Il solo discriminante fra
// creazione e aggiornamento è `dto.id`, che il client non possiede — l'id lo
// impara nel ramo `next`, che in quel caso non viene mai eseguito. Il reinvio è
// quindi, per il server, una creazione nuova e legittima: secondo documento,
// secondo numero, secondi movimenti, e il Registro Corrispettivi che conta due
// vendite.
//
// ⭐ LA SOLUZIONE: un registro comune degli intenti, con vincolo unico
// (tenantId, intentId), rivendicato come PRIMA scrittura della stessa
// transazione che crea il documento e applica gli effetti.
//
// ⚠️ La distinzione che regge tutto: **due compilazioni sono due intenti, anche
// a payload identico**. Due clienti che comprano la stessa maglietta nello
// stesso minuto restano due vendite — la differenza non è nei dati.
describe('T15A — intento di creazione', () => {
  const INTENTO = 'intento-0000-1111-2222';

  const vendita = (db: FakeDb, over: Record<string, unknown> = {}) => {
    const { service } = createService(db);
    return service.createSale(
      TENANT,
      {
        creationIntentId: INTENTO,
        locationId: LOCATION,
        paymentMethod: 'cash',
        lines: [{ variantId: VARIANT_A, quantity: 1, unitPriceMinor: 2990 }],
        ...over,
      } as never,
      user,
    );
  };

  const reso = (db: FakeDb, over: Record<string, unknown> = {}) => {
    const { service } = createService(db);
    return service.createReturn(
      TENANT,
      {
        creationIntentId: INTENTO,
        locationId: LOCATION,
        lines: [{ variantId: VARIANT_A, quantity: 1, restockable: true, unitPriceMinor: 1000 }],
        ...over,
      } as never,
      user,
    );
  };

  describe('replay sequenziale — il caso che T15 esiste per chiudere', () => {
    it('⭐ Vendita: reinvio dopo commit → UN documento, UN numero, UN set di movimenti', async () => {
      const db = createDb();
      const primo = await vendita(db);
      const giacenzaDopoUno = levelOf(db, VARIANT_A).onHand;

      // La risposta del primo si è persa: l'operatore ripreme, e il client
      // rimanda lo STESSO intento con lo STESSO contenuto.
      const secondo = await vendita(db);

      expect(db.documents).toHaveLength(1);
      expect(db.movements).toHaveLength(1);
      expect(levelOf(db, VARIANT_A).onHand).toBe(giacenzaDopoUno);
      // ⭐ E la seconda chiamata RIESCE, restituendo il risultato già prodotto:
      // all'operatore non si mostra un errore per un lavoro andato a buon fine.
      expect(secondo.id).toBe(primo.id);
      expect(secondo.reference).toBe(primo.reference);
    });

    it('⭐ Reso: stesso comportamento', async () => {
      const db = createDb();
      const primo = await reso(db);
      const giacenzaDopoUno = levelOf(db, VARIANT_A).onHand;

      const secondo = await reso(db);

      expect(db.documents).toHaveLength(1);
      expect(db.movements).toHaveLength(1);
      expect(levelOf(db, VARIANT_A).onHand).toBe(giacenzaDopoUno);
      expect(secondo.id).toBe(primo.id);
    });

    it('un solo NUMERO consumato: il secondo invio non tocca il contatore', async () => {
      const db = createDb();
      await vendita(db);
      await vendita(db);

      expect(db.documents).toHaveLength(1);
      expect(db.documents[0]!.number).toBe(1);
    });

    it('un solo effetto sui CORRISPETTIVI: una riga, un totale', async () => {
      const db = createDb();
      await vendita(db);
      await vendita(db);

      // Il Registro somma i documenti store_sale: con due gemelli conterebbe
      // due vendite, e imponibile/IVA/totale sarebbero doppi.
      const vendite = db.documents.filter((d) => d.type === DocumentType.store_sale);
      expect(vendite).toHaveLength(1);
    });
  });

  describe('intenti diversi, payload identico — due operazioni legittime', () => {
    it('⭐ due clienti, stessa maglietta, stesso minuto: DUE vendite', async () => {
      const db = createDb();
      await vendita(db, { creationIntentId: 'intento-cliente-A' });
      await vendita(db, { creationIntentId: 'intento-cliente-B' });

      // Il payload è byte per byte identico: a distinguerle è solo l'intento.
      expect(db.documents).toHaveLength(2);
      expect(db.movements).toHaveLength(2);
      // ⚠️ Non si asserisce sui NUMERI: il finto non simula la ricerca del
      // primo libero (restituisce `[]` alla query grezza), e due documenti di
      // oggi ricadono entrambi su «massimo+1» = 1. È un limite del doppio, non
      // del servizio — la numerazione ha i suoi test in T7A/T8A.
      expect(db.intents).toHaveLength(2);
    });
  });

  describe('stesso intento, payload diverso — non è un reinvio', () => {
    it('⛔ conflitto strutturato, e NESSUNA seconda creazione', async () => {
      const db = createDb();
      await vendita(db);

      const errore = await vendita(db, {
        lines: [{ variantId: VARIANT_A, quantity: 5, unitPriceMinor: 2990 }],
      }).catch((e: unknown) => e);

      expect(errore).toBeInstanceOf(ConflictException);
      expect((errore as ConflictException).getResponse()).toMatchObject({
        code: 'creation_intent_mismatch',
      });
      expect(db.documents).toHaveLength(1);
      expect(db.movements).toHaveLength(1);
    });
  });

  describe('rollback — nessun claim residuo', () => {
    it('⭐ se il lavoro fallisce, l’intento torna LIBERO', async () => {
      const db = createDb();
      // Il movimento fallisce: la transazione fa rollback, claim compreso.
      db.failNextMovementCreate = true;
      await expect(vendita(db)).rejects.toBeDefined();

      expect(db.intents).toHaveLength(0);
      expect(db.documents).toHaveLength(0);

      // ⭐ E lo stesso intento si può riusare: il primo tentativo non ha
      // lasciato niente dietro di sé. Senza rollback del claim l'operatore
      // resterebbe bloccato su un intento bruciato da un errore transitorio.
      const esito = await vendita(db);
      expect(esito.id).toBeDefined();
      expect(db.documents).toHaveLength(1);
    });
  });

  describe('tenant diversi — lo stesso intento non si incontra mai', () => {
    it('due tenant con lo stesso intentId creano ciascuno il proprio documento', async () => {
      const db = createDb();
      const { service } = createService(db);
      const corpo = {
        creationIntentId: INTENTO,
        locationId: LOCATION,
        paymentMethod: 'cash',
        lines: [{ variantId: VARIANT_A, quantity: 1, unitPriceMinor: 2990 }],
      };

      await service.createSale(TENANT, corpo as never, user);
      await service.createSale('altro-tenant', corpo as never, user);

      // Il vincolo è (tenantId, intentId): il tenant è una COLONNA, non un
      // pezzo della stringa. Due tenant non si bloccano a vicenda.
      expect(db.intents).toHaveLength(2);
      expect(db.documents).toHaveLength(2);
    });
  });

  describe('concorrenza — una sola creazione', () => {
    it('⭐ due richieste con lo stesso intento partite insieme: UN documento', async () => {
      const db = createDb();

      // Partono davvero insieme: nessuna delle due sa dell'altra.
      await Promise.allSettled([vendita(db), vendita(db)]);

      // Il documento è uno solo, e così i movimenti e la giacenza.
      expect(db.documents).toHaveLength(1);
      expect(db.movements).toHaveLength(1);
    });
  });

  describe('⛔ senza intento non si crea — il contratto è chiuso (T15B)', () => {
    it('creare una vendita senza `creationIntentId` viene RIFIUTATO', async () => {
      const db = createDb();

      const errore = await vendita(db, { creationIntentId: undefined }).catch((e: unknown) => e);

      // ⚠️ In T15A questo test diceva l'opposto — «creano DUE documenti» — ed
      // era il confine dichiarato finché il client non mandava l'intento.
      // Migrato il client (T15B), quel comportamento non si lascia in piedi:
      // era un ponte, non un contratto.
      expect(errore).toBeInstanceOf(UnprocessableEntityException);
      expect(db.documents).toHaveLength(0);
      expect(db.intents).toHaveLength(0);
    });

    it('creare un reso senza `creationIntentId` viene RIFIUTATO', async () => {
      const db = createDb();

      const errore = await reso(db, { creationIntentId: undefined }).catch((e: unknown) => e);

      expect(errore).toBeInstanceOf(UnprocessableEntityException);
      expect(db.documents).toHaveLength(0);
    });

    it('⭐ in MODIFICA l’intento non serve: non si sta creando niente', async () => {
      const db = createDb();
      const creata = await vendita(db);

      // Risalvataggio dello stesso documento, senza intento: deve passare.
      const { service } = createService(db);
      await expect(
        service.createSale(
          TENANT,
          {
            id: creata.id,
            creationIntentId: undefined,
            locationId: LOCATION,
            paymentMethod: 'cash',
            lines: [{ variantId: VARIANT_A, quantity: 2, unitPriceMinor: 2990 }],
          } as never,
          user,
        ),
      ).resolves.toBeDefined();

      // Un solo documento, e nessun intento in più: la modifica non ne apre uno.
      expect(db.documents).toHaveLength(1);
      expect(db.intents).toHaveLength(1);
    });
  });

  describe('nessuna interazione con il conflitto di NUMERO', () => {
    it('⛔ un intento duplicato non diventa mai «numero già assegnato»', async () => {
      const db = createDb();
      await vendita(db);

      const errore = await vendita(db, {
        lines: [{ variantId: VARIANT_A, quantity: 9, unitPriceMinor: 2990 }],
      }).catch((e: unknown) => e);

      // È la ragione per cui il registro è una TABELLA e non una colonna su
      // `documents`: lì il P2002 sarebbe caduto in `MODELLI_NUMERATI` e
      // `isDocumentNumberConflict` l'avrebbe tradotto in «numero già
      // assegnato», con la proposta di un numero libero che non c'entra niente.
      const payload = (errore as ConflictException).getResponse();
      expect(payload).toMatchObject({ code: 'creation_intent_mismatch' });
      expect(payload).not.toMatchObject({ code: 'document_number_taken' });
    });
  });
});

/**
 * ⛔ Era `loadsStock: true` cablato nel servizio: la spunta non viaggiava nel
 * payload e l'operatore che la toglieva vedeva la merce uscire lo stesso.
 *
 * Il motore la rispettava già (`document-stock-unload-sync.util`): a mancare
 * era solo il valore. Contratto comune §6.3 — «Carica/Scarica ON → OFF: viene
 * neutralizzato l'effetto di quella riga». Misurato il 23/08/2026.
 */
describe('la spunta «Scarica giacenze» della Vendita', () => {
  it('spenta: la riga resta nel documento ma la merce NON esce', async () => {
    const db = createDb();
    const { service } = createService(db);
    const giacenzaPrima = levelOf(db, VARIANT_A).onHand;
    const movimentiPrima = db.movements.length;

    const result = await service.createSale(
      TENANT,
      {
        locationId: LOCATION,
        paymentMethod: 'cash',
        lines: [{ variantId: VARIANT_A, quantity: 2, unitPriceMinor: 2990, loadsStock: false }],
      },
      user,
    );

    // Il documento c'è, e la riga pure: è documentata, non movimentata.
    expect(result.lines).toHaveLength(1);
    expect(levelOf(db, VARIANT_A).onHand).toBe(giacenzaPrima);
    expect(db.movements.slice(movimentiPrima)).toHaveLength(0);
  });

  it('accesa: la merce esce, come sempre', async () => {
    const db = createDb();
    const { service } = createService(db);
    const giacenzaPrima = levelOf(db, VARIANT_A).onHand;
    const movimentiPrima = db.movements.length;

    await service.createSale(
      TENANT,
      {
        locationId: LOCATION,
        paymentMethod: 'cash',
        lines: [{ variantId: VARIANT_A, quantity: 2, unitPriceMinor: 2990, loadsStock: true }],
      },
      user,
    );

    expect(levelOf(db, VARIANT_A).onHand).toBe(giacenzaPrima - 2);
    expect(db.movements.slice(movimentiPrima)).toHaveLength(1);
  });

  /** Assente = non dichiarata: su riga nuova la spunta nasce ACCESA. */
  it('assente dal payload: la spunta nasce accesa', async () => {
    const db = createDb();
    const { service } = createService(db);
    const giacenzaPrima = levelOf(db, VARIANT_A).onHand;

    await service.createSale(
      TENANT,
      {
        locationId: LOCATION,
        paymentMethod: 'cash',
        lines: [{ variantId: VARIANT_A, quantity: 2, unitPriceMinor: 2990 }],
      },
      user,
    );

    expect(levelOf(db, VARIANT_A).onHand).toBe(giacenzaPrima - 2);
  });

  it('due righe, una spenta: esce solo quella accesa', async () => {
    const db = createDb();
    const { service } = createService(db);
    const giacenzaPrima = levelOf(db, VARIANT_A).onHand;
    const movimentiPrima = db.movements.length;

    const result = await service.createSale(
      TENANT,
      {
        locationId: LOCATION,
        paymentMethod: 'cash',
        lines: [
          { variantId: VARIANT_A, quantity: 1, unitPriceMinor: 2990, loadsStock: true },
          { variantId: VARIANT_A, quantity: 1, unitPriceMinor: 2990, loadsStock: false },
        ],
      },
      user,
    );

    expect(result.lines).toHaveLength(2);
    expect(levelOf(db, VARIANT_A).onHand).toBe(giacenzaPrima - 1);
    expect(db.movements.slice(movimentiPrima)).toHaveLength(1);
  });
});
