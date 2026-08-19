import { describe, expect, it, vi } from 'vitest';

import { CorrispettiviService } from './corrispettivi.service';
import { CorrispettiviExportService } from './corrispettivi-export.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { ListCorrispettiviQueryDto } from './dto/list-corrispettivi.query.dto';

/**
 * Il **Reso al banco** nel Registro Corrispettivi (`11` C8b): quinta sorgente
 * documentale, agganciata a `wantsRefunds`.
 *
 * ⛔ **Il difetto che questo file presidia si scrive in una parola.** Allargare
 * il filtro esistente a `type: { in: [store_sale, store_return] }` sembra la
 * modifica giusta e produce un errore di SEGNO: il Reso entrerebbe dal ramo che
 * mappa `kind: 'sale'` con importi positivi e lo conta in `orderCount`. Su un
 * reso da 30 € il periodo sbaglierebbe di 60 €, e il reso comparirebbe
 * filtrando «Solo vendite».
 *
 * Le prove qui sotto sono costruite sul caso minimo che lo smaschera:
 *
 * ```text
 * Vendita al banco  100,00        elenco    +100,00 e −30,00
 * Reso al banco      30,00        riepilogo  vendite 100 · rettifiche 30 · netto 70
 *                                 conteggi   vendite 1 · resi 1
 * ```
 */

const TENANT = 'tenant-1';
const GIORNO = new Date(Date.UTC(2026, 7, 18, 10, 0, 0));

/** Vendita al banco da 100,00 € (imponibile 80,00 · IVA 20,00). */
const VENDITA = {
  id: 'doc-vendita',
  number: 1,
  reference: 'VN-0001',
  documentDate: GIORNO,
  customerName: 'Cliente banco',
  currency: 'EUR',
  taxMinor: 2000,
  totalMinor: 10000,
  createdAt: GIORNO,
  location: { id: 'loc-1', name: 'Negozio principale' },
};

/** Reso al banco da 30,00 € (imponibile 24,00 · IVA 6,00). POSITIVO in tabella. */
const RESO = {
  id: 'doc-reso',
  number: 1,
  reference: 'RN-0001',
  documentDate: GIORNO,
  customerName: '',
  currency: 'EUR',
  taxMinor: 600,
  totalMinor: 3000,
  createdAt: GIORNO,
  notes: 'resa merce difettosa',
  // Presente apposta: NON deve uscire nel Registro né nell'export.
  internalComment: 'Causale reso: capo difettoso',
  location: { id: 'loc-1', name: 'Negozio principale' },
};

/**
 * Prisma finto che **distingue i due tipi di documento**.
 *
 * ⚠️ Senza questa distinzione la prova non proverebbe niente: entrambe le
 * sorgenti leggono `document`, e un finto che risponde uguale a tutti e due
 * passerebbe anche con l'implementazione sbagliata.
 */
function prismaConBanco(opzioni: { vendite?: readonly unknown[]; resi?: readonly unknown[] } = {}) {
  const vendite = opzioni.vendite ?? [VENDITA];
  const resi = opzioni.resi ?? [RESO];
  const perTipo = (where: { type?: unknown } | undefined): readonly unknown[] => {
    if (where?.type === 'store_sale') return vendite;
    if (where?.type === 'store_return') return resi;
    return [];
  };
  return {
    salesOrder: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    salesOrderRefund: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    document: {
      count: vi.fn().mockImplementation(({ where }) => Promise.resolve(perTipo(where).length)),
      findMany: vi.fn().mockImplementation(({ where }) => Promise.resolve(perTipo(where))),
    },
    manualReceipt: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    location: { findMany: vi.fn().mockResolvedValue([]) },
    tenant: { findUniqueOrThrow: vi.fn().mockResolvedValue({ name: 'Prova' }) },
    // ⛔ Il magazzino: presente nel finto SOLO per poter dimostrare che non
    // viene mai toccato (vedi l'ultimo blocco di prove).
    stockMovement: {
      count: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      upsert: vi.fn(),
    },
    inventoryLevel: {
      count: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
  } as unknown as PrismaService;
}

const query = (extra: Record<string, unknown> = {}): ListCorrispettiviQueryDto =>
  ({ page: 1, pageSize: 25, ...extra }) as unknown as ListCorrispettiviQueryDto;

describe('il Reso al banco entra nel Registro come rettifica', () => {
  it('elenco: la Vendita è +100,00 e il Reso è −30,00', async () => {
    const righe = await new CorrispettiviService(prismaConBanco()).buildRegisterRows(
      TENANT,
      query(),
    );

    expect(righe).toHaveLength(2);
    const vendita = righe.find((r) => r.documentId === 'doc-vendita');
    const reso = righe.find((r) => r.documentId === 'doc-reso');

    expect(vendita?.kind).toBe('sale');
    expect(vendita?.totalMinor).toBe(10000);
    expect(vendita?.taxMinor).toBe(2000);
    expect(vendita?.taxableMinor).toBe(8000);

    // ⛔ Il cuore della prova: negativo NELLA VISTA, e `refund` non `sale`.
    expect(reso?.kind).toBe('refund');
    expect(reso?.totalMinor).toBe(-3000);
    expect(reso?.taxMinor).toBe(-600);
    expect(reso?.taxableMinor).toBe(-2400);
  });

  it('usa il vocabolario che esiste già: Tipo = Reso', async () => {
    const righe = await new CorrispettiviService(prismaConBanco()).buildRegisterRows(
      TENANT,
      query(),
    );
    const reso = righe.find((r) => r.documentId === 'doc-reso');

    expect(reso?.refundKind).toBe('return_with_restock');
    // ⛔ La nota PUBBLICA, non il commento interno: quello non esce nel file
    // che va al commercialista.
    expect(reso?.note).toBe('resa merce difettosa');
  });

  it('⛔ il commento INTERNO non esce, né nella riga né nell’export', async () => {
    const prisma = prismaConBanco();
    const corrispettivi = new CorrispettiviService(prisma);

    const righe = await corrispettivi.buildRegisterRows(TENANT, query());
    const csv = await new CorrispettiviExportService(prisma, corrispettivi).exportAccountantCsv(
      TENANT,
      query(),
    );

    // Il file va al commercialista: un campo che si chiama «interno» non ci va.
    expect(JSON.stringify(righe)).not.toContain('Causale reso');
    expect(csv).not.toContain('Causale reso');
    expect(csv).not.toContain('capo difettoso');
  });

  it('resta nell’origine della Vendita al banco: non ne nasce una nuova', async () => {
    const righe = await new CorrispettiviService(prismaConBanco()).buildRegisterRows(
      TENANT,
      query(),
    );

    // ⚠️ Se il Reso avesse un'origine propria, chi filtra «Vendita al banco»
    // vedrebbe le vendite al LORDO delle rettifiche che le abbattono.
    expect(righe.map((r) => r.source)).toEqual(['store', 'store']);
  });

  it('entra UNA volta sola', async () => {
    const righe = await new CorrispettiviService(prismaConBanco()).buildRegisterRows(
      TENANT,
      query(),
    );

    expect(righe.filter((r) => r.documentId === 'doc-reso')).toHaveLength(1);
    expect(new Set(righe.map((r) => r.rowId)).size).toBe(righe.length);
  });

  it('riepilogo: vendite 100 · rettifiche 30 · netto 70, con i conteggi giusti', async () => {
    const riepilogo = await new CorrispettiviService(prismaConBanco()).getSummary(TENANT, query());

    expect(riepilogo.totalMinor).toBe(10000);
    expect(riepilogo.refundTotalMinor).toBe(3000);
    expect(riepilogo.netTotalMinor).toBe(7000);

    // ⛔ Il Reso NON è una vendita: `orderCount` resta 1.
    expect(riepilogo.orderCount).toBe(1);
    expect(riepilogo.refundCount).toBe(1);

    expect(riepilogo.taxMinor).toBe(2000);
    expect(riepilogo.refundTaxMinor).toBe(600);
    expect(riepilogo.netTaxMinor).toBe(1400);
    expect(riepilogo.netTaxableMinor).toBe(5600);
  });

  it('al riepilogo gli importi arrivano POSITIVI: là si sottraggono', async () => {
    const riepilogo = await new CorrispettiviService(
      prismaConBanco({ vendite: [] }),
    ).getSummary(TENANT, query());

    // Se il Reso arrivasse negativo al livello che poi sottrae, il netto
    // SALIREBBE: −(−3000) = +3000 invece di −3000.
    expect(riepilogo.refundTotalMinor).toBe(3000);
    expect(riepilogo.netTotalMinor).toBe(-3000);
  });
});

describe('il Reso al banco rispetta i filtri', () => {
  it('Tutti: ci sono entrambe', async () => {
    const righe = await new CorrispettiviService(prismaConBanco()).buildRegisterRows(
      TENANT,
      query({ tipi: ['all'] }),
    );
    expect(righe).toHaveLength(2);
  });

  it('Solo vendite: il Reso NON c’è, e il netto non lo sottrae', async () => {
    const service = new CorrispettiviService(prismaConBanco());

    const righe = await service.buildRegisterRows(TENANT, query({ tipi: ['sales'] }));
    const riepilogo = await service.getSummary(TENANT, query({ tipi: ['sales'] }));

    expect(righe.map((r) => r.documentId)).toEqual(['doc-vendita']);
    expect(riepilogo.refundTotalMinor).toBe(0);
    expect(riepilogo.netTotalMinor).toBe(10000);
    expect(riepilogo.refundCount).toBe(0);
  });

  it('Solo resi: c’è SOLO il Reso', async () => {
    const service = new CorrispettiviService(prismaConBanco());

    const righe = await service.buildRegisterRows(TENANT, query({ tipi: ['returns'] }));
    const riepilogo = await service.getSummary(TENANT, query({ tipi: ['returns'] }));

    expect(righe.map((r) => r.documentId)).toEqual(['doc-reso']);
    expect(riepilogo.totalMinor).toBe(0);
    expect(riepilogo.orderCount).toBe(0);
    expect(riepilogo.refundTotalMinor).toBe(3000);
    expect(riepilogo.netTotalMinor).toBe(-3000);
  });

  /**
   * ⛔ **Questa prova asseriva il contrario, e proteggeva un difetto.** Diceva
   * «il Reso resta, perché "returns e refunds" è una congiunzione»: ma la
   * congiunzione è `refundsOnly`, mentre `tipi: ['refunds']` è una selezione
   * singola — e che le due voci siano distinguibili lo dimostra
   * `buildCorrispettiviRefundWhere`, che per lo stesso filtro tiene il solo
   * `refund_only`. Trovato dalla revisione del 19/08/2026.
   */
  it('⛔ Solo rimborsi: il Reso NON c’è — un reso non è un rimborso', async () => {
    const service = new CorrispettiviService(prismaConBanco());

    const righe = await service.buildRegisterRows(TENANT, query({ tipi: ['refunds'] }));
    const riepilogo = await service.getSummary(TENANT, query({ tipi: ['refunds'] }));

    expect(righe.map((r) => r.documentId)).toEqual([]);
    // E non deve nemmeno abbattere il totale di un filtro che non lo riguarda.
    expect(riepilogo.refundTotalMinor).toBe(0);
    expect(riepilogo.refundCount).toBe(0);
  });

  it('Solo resi: c’è, ed è l’altra metà della stessa distinzione', async () => {
    const righe = await new CorrispettiviService(prismaConBanco()).buildRegisterRows(
      TENANT,
      query({ tipi: ['returns'] }),
    );
    expect(righe.map((r) => r.documentId)).toEqual(['doc-reso']);
  });

  it('resi + rimborsi insieme: c’è', async () => {
    const righe = await new CorrispettiviService(prismaConBanco()).buildRegisterRows(
      TENANT,
      query({ tipi: ['returns', 'refunds'] }),
    );
    expect(righe.map((r) => r.documentId)).toEqual(['doc-reso']);
  });

  it('⚠️ refundsOnly INCLUDE il Reso: è il filtro che deve mostrarlo', async () => {
    const service = new CorrispettiviService(prismaConBanco());

    const righe = await service.buildRegisterRows(TENANT, query({ refundsOnly: true }));
    const riepilogo = await service.getSummary(TENANT, query({ refundsOnly: true }));

    // Il vecchio interruttore spegne le sorgenti documentali di VENDITA, e
    // deve continuare a farlo — ma non questa.
    expect(righe.map((r) => r.documentId)).toEqual(['doc-reso']);
    expect(riepilogo.refundTotalMinor).toBe(3000);
  });

  it('Origine Vendita al banco: il Reso è dentro', async () => {
    const righe = await new CorrispettiviService(prismaConBanco()).buildRegisterRows(
      TENANT,
      query({ origini: ['store'] }),
    );
    expect(righe.map((r) => r.documentId).sort()).toEqual(['doc-reso', 'doc-vendita']);
  });

  it('Origine diversa: sparisce insieme alla vendita che lo genera', async () => {
    const righe = await new CorrispettiviService(prismaConBanco()).buildRegisterRows(
      TENANT,
      query({ origini: ['shopify_online'] }),
    );
    expect(righe).toHaveLength(0);
  });

  it('somma dei sottoinsiemi = riepilogo del periodo', async () => {
    const service = new CorrispettiviService(prismaConBanco());

    const soloVendite = await service.getSummary(TENANT, query({ tipi: ['sales'] }));
    const soloResi = await service.getSummary(TENANT, query({ tipi: ['returns', 'refunds'] }));
    const tutto = await service.getSummary(TENANT, query({ tipi: [] }));

    expect(soloVendite.totalMinor + soloResi.totalMinor).toBe(tutto.totalMinor);
    expect(soloVendite.refundTotalMinor + soloResi.refundTotalMinor).toBe(tutto.refundTotalMinor);
    expect(soloVendite.netTotalMinor + soloResi.netTotalMinor).toBe(tutto.netTotalMinor);
    expect(soloVendite.netTaxableMinor + soloResi.netTaxableMinor).toBe(tutto.netTaxableMinor);
    expect(soloVendite.orderCount + soloResi.orderCount).toBe(tutto.orderCount);
    expect(soloVendite.refundCount + soloResi.refundCount).toBe(tutto.refundCount);
  });
});

describe('⭐ Reso con «Carica giacenze» spento su TUTTE le righe', () => {
  /**
   * È il caso che separa le due cose, ed è la ragione per cui il Registro e il
   * magazzino sono percorsi disgiunti:
   *
   * ```text
   * spunta magazzino    decide se la merce RIENTRA IN GIACENZA
   * il Registro         registra che il cliente HA RESO, e quanto gli si e' reso
   * ```
   *
   * Un capo difettoso torna, si rimborsa, e in magazzino non ci va: il
   * corrispettivo va abbattuto lo stesso — il denaro è uscito. Se la spunta
   * governasse anche il Registro, quel reso sparirebbe dal registro fiscale.
   *
   * ⚠️ **Non basta una fixture con le righe spente**: passerebbe anche con
   * un'implementazione che la spunta la guarda. Le prove qui sotto ispezionano
   * le chiamate a Prisma e dimostrano che il Registro non la CONSULTA affatto.
   */

  it('entra lo stesso, negativo, con gli stessi importi', async () => {
    // Le righe non entrano nemmeno nella lettura, quindi il documento è lo
    // stesso: ciò che cambia è solo che in magazzino non è successo niente.
    const service = new CorrispettiviService(prismaConBanco({ vendite: [] }));

    const righe = await service.buildRegisterRows(TENANT, query());
    const riepilogo = await service.getSummary(TENANT, query());

    const reso = righe.find((r) => r.documentId === 'doc-reso');
    expect(reso?.kind).toBe('refund');
    expect(reso?.refundKind).toBe('return_with_restock');
    expect(reso?.totalMinor).toBe(-3000);
    expect(riepilogo.refundTotalMinor).toBe(3000);
    expect(riepilogo.refundCount).toBe(1);
    expect(riepilogo.netTotalMinor).toBe(-3000);
  });

  it('⛔ il Registro non FILTRA per spunta magazzino', async () => {
    const prisma = prismaConBanco();
    await new CorrispettiviService(prisma).buildRegisterRows(TENANT, query());

    const documento = (prisma as unknown as {
      document: { findMany: { mock: { calls: [{ where: Record<string, unknown> }][] } } };
    }).document.findMany;

    const perResi = documento.mock.calls
      .map(([arg]) => arg.where)
      .filter((w) => w.type === 'store_return');
    expect(perResi.length).toBeGreaterThan(0);

    for (const where of perResi) {
      // Una clausola su `lines` significherebbe che la spunta decide se il
      // reso entra nel registro fiscale. Non deve esistere.
      expect(where['lines'], 'il where dei resi non deve toccare le righe').toBeUndefined();
      expect(JSON.stringify(where)).not.toContain('loadsStock');
    }
  });

  it('⛔ il Registro non LEGGE nemmeno la spunta', async () => {
    const prisma = prismaConBanco();
    await new CorrispettiviService(prisma).buildRegisterRows(TENANT, query());
    await new CorrispettiviService(prisma).getSummary(TENANT, query());

    const documento = (prisma as unknown as {
      document: {
        findMany: { mock: { calls: [{ where: Record<string, unknown>; select?: unknown }][] } };
      };
    }).document.findMany;

    for (const [arg] of documento.mock.calls) {
      if (arg.where['type'] !== 'store_return') continue;
      expect(JSON.stringify(arg.select ?? {})).not.toContain('loadsStock');
      expect(JSON.stringify(arg.select ?? {})).not.toContain('lines');
    }
  });
});

describe('i subtotali per giorno', () => {
  const ALTRO_GIORNO = new Date(Date.UTC(2026, 7, 19, 10, 0, 0));

  it('il Reso cade nel SUO giorno, non in quello della vendita', async () => {
    const prisma = prismaConBanco({
      resi: [{ ...RESO, documentDate: ALTRO_GIORNO, createdAt: ALTRO_GIORNO }],
    });
    const riepilogo = await new CorrispettiviService(prisma).getSummary(TENANT, query());

    const giorni = new Map(riepilogo.perGiornata.map((g) => [g.giorno, g.totali]));
    expect([...giorni.keys()].sort()).toEqual(['2026-08-18', '2026-08-19']);

    // Il 18 solo la vendita, il 19 solo il reso.
    expect(giorni.get('2026-08-18')?.totalMinor).toBe(10000);
    expect(giorni.get('2026-08-18')?.refundTotalMinor).toBe(0);
    expect(giorni.get('2026-08-19')?.totalMinor).toBe(0);
    expect(giorni.get('2026-08-19')?.refundTotalMinor).toBe(3000);
    expect(giorni.get('2026-08-19')?.netTotalMinor).toBe(-3000);
  });

  it('⚠️ somma dei giorni = totale del periodo, col Reso in mezzo', async () => {
    const prisma = prismaConBanco({
      resi: [{ ...RESO, documentDate: ALTRO_GIORNO, createdAt: ALTRO_GIORNO }],
    });
    const riepilogo = await new CorrispettiviService(prisma).getSummary(TENANT, query());

    // È la proprietà che il Registro deve garantire: il totale del periodo È la
    // somma delle giornate, non un calcolo parallelo.
    const somma = (campo: 'totalMinor' | 'refundTotalMinor' | 'netTotalMinor' | 'refundCount') =>
      riepilogo.perGiornata.reduce((s, g) => s + g.totali[campo], 0);

    expect(somma('totalMinor')).toBe(riepilogo.totalMinor);
    expect(somma('refundTotalMinor')).toBe(riepilogo.refundTotalMinor);
    expect(somma('netTotalMinor')).toBe(riepilogo.netTotalMinor);
    expect(somma('refundCount')).toBe(riepilogo.refundCount);
    expect(riepilogo.netTotalMinor).toBe(7000);
  });
});

describe('l’export quadra con il riepilogo', () => {
  it('il CSV contiene entrambe le righe, e il Reso col segno meno', async () => {
    const prisma = prismaConBanco();
    const corrispettivi = new CorrispettiviService(prisma);
    const csv = await new CorrispettiviExportService(prisma, corrispettivi).exportAccountantCsv(
      TENANT,
      query(),
    );

    expect(csv).toContain('VN-0001');
    expect(csv).toContain('RN-0001');
    // Il segno viaggia con la riga, non è disegnato dall'export.
    expect(csv).toMatch(/-30,00|−30,00/);
  });

  it('la somma delle righe esportate è il netto del riepilogo', async () => {
    const prisma = prismaConBanco();
    const corrispettivi = new CorrispettiviService(prisma);

    const righe = await corrispettivi.buildRegisterRows(TENANT, query());
    const riepilogo = await corrispettivi.getSummary(TENANT, query());

    const sommaRighe = righe.reduce((s, r) => s + r.totalMinor, 0);
    expect(sommaRighe).toBe(riepilogo.netTotalMinor);
    expect(sommaRighe).toBe(7000);
  });
});

describe('⛔ il Registro Corrispettivi non tocca il magazzino', () => {
  /**
   * La sola-letturezza del Registro era un fatto **misurato ma non presidiato**:
   * gli spec del modulo non nominavano `stockMovement` né `inventoryLevel`.
   * Ora che il modulo legge anche i Resi — che un effetto di magazzino ce
   * l'hanno, altrove — la distinzione va inchiodata.
   *
   * L'effetto di magazzino del Reso appartiene a `StoreSalesService`, al
   * salvataggio. Il Registro lo LEGGE e basta: sono due percorsi disgiunti.
   */
  it('nessuna scrittura, nessuna lettura di giacenze o movimenti', async () => {
    const prisma = prismaConBanco();
    const corrispettivi = new CorrispettiviService(prisma);
    const exportService = new CorrispettiviExportService(prisma, corrispettivi);
    const q = query();

    await corrispettivi.buildRegisterRows(TENANT, q);
    await corrispettivi.getSummary(TENANT, q);
    await corrispettivi.listOrders(TENANT, q);
    await corrispettivi.listRegisterLocations(TENANT, undefined);
    await exportService.exportAccountantCsv(TENANT, q);
    await exportService.exportAccountantSpreadsheet(TENANT, q);
    // Il PDF è la terza strada verso gli stessi dati, e legge anche il tenant:
    // se una scrittura si annidasse lì, le altre due non la vedrebbero.
    await exportService.exportAccountantPdf(TENANT, q);

    const magazzino = prisma as unknown as {
      stockMovement: Record<string, { mock: { calls: unknown[] } }>;
      inventoryLevel: Record<string, { mock: { calls: unknown[] } }>;
      $transaction: { mock: { calls: unknown[] } };
      $executeRaw: { mock: { calls: unknown[] } };
    };

    for (const [nome, spia] of Object.entries(magazzino.stockMovement)) {
      expect(spia.mock.calls, `stockMovement.${nome} è stato chiamato`).toHaveLength(0);
    }
    for (const [nome, spia] of Object.entries(magazzino.inventoryLevel)) {
      expect(spia.mock.calls, `inventoryLevel.${nome} è stato chiamato`).toHaveLength(0);
    }
    // Nessuna transazione e nessun SQL grezzo: il Registro non scrive nulla.
    expect(magazzino.$transaction.mock.calls).toHaveLength(0);
    expect(magazzino.$executeRaw.mock.calls).toHaveLength(0);
  });

  it('la guardia regge su ogni combinazione di filtri, non solo sul caso base', async () => {
    const prisma = prismaConBanco();
    const corrispettivi = new CorrispettiviService(prisma);

    for (const filtri of [
      {},
      { tipi: ['sales'] },
      { tipi: ['returns'] },
      { tipi: ['refunds'] },
      { tipi: ['returns', 'refunds'] },
      { refundsOnly: true },
      { origini: ['store'] },
      { locationId: 'loc-1' },
      { search: 'RN' },
      { undeterminedLocationOnly: true },
    ]) {
      await corrispettivi.buildRegisterRows(TENANT, query(filtri));
      await corrispettivi.getSummary(TENANT, query(filtri));
    }

    const magazzino = prisma as unknown as {
      stockMovement: Record<string, { mock: { calls: unknown[] } }>;
      inventoryLevel: Record<string, { mock: { calls: unknown[] } }>;
    };
    for (const [nome, spia] of Object.entries(magazzino.stockMovement)) {
      expect(spia.mock.calls, `stockMovement.${nome}`).toHaveLength(0);
    }
    for (const [nome, spia] of Object.entries(magazzino.inventoryLevel)) {
      expect(spia.mock.calls, `inventoryLevel.${nome}`).toHaveLength(0);
    }
  });

  /**
   * ⚠️ **Questa prova guarda il FINTO, non il servizio — di proposito**, e va
   * letta sapendolo: la prima stesura la spacciava per una prova sul modulo, ed
   * era una tautologia (segnalata dalla revisione del 19/08/2026).
   *
   * Il suo mestiere è custodire il MECCANISMO che rende mordente la guardia qui
   * sopra: `prismaConBanco` non definisce i verbi di scrittura sulle tabelle di
   * business, quindi una `document.create(...)` introdotta nel Registro non
   * sarebbe «una spia non chiamata» — sarebbe un `TypeError` che fa arrossire
   * ogni prova del file. Se qualcuno un giorno completasse il finto «per
   * comodità», quella rete sparirebbe in silenzio: è questo che la prova ferma.
   */
  it('il finto NON offre verbi di scrittura: è la rete che rende mordente la guardia', () => {
    const prisma = prismaConBanco() as unknown as Record<string, Record<string, unknown>>;
    const tabelle = ['salesOrder', 'salesOrderRefund', 'document', 'manualReceipt'];
    const scritture = ['create', 'createMany', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert'];

    for (const tabella of tabelle) {
      for (const verbo of scritture) {
        expect(
          prisma[tabella]?.[verbo],
          `${tabella}.${verbo} non va aggiunto al finto: toglierebbe la rete`,
        ).toBeUndefined();
      }
    }
  });
});
