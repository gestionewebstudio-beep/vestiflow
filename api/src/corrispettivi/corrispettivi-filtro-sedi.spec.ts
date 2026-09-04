import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';

import { CorrispettiviExportService } from './corrispettivi-export.service';
import { normalizzaFiltroSedi } from './corrispettivi-location-filter.util';
import type { CorrispettiviListFilters } from './corrispettivi-query.util';
import { CorrispettiviService } from './corrispettivi.service';
import type { ListCorrispettiviQueryDto } from './dto/list-corrispettivi.query.dto';

/**
 * IL FILTRO SEDE DEL REGISTRO — e la guardia contro un errore già commesso.
 *
 * ⛔ **Il Registro raggruppa TUTTI i corrispettivi dell'azienda** (decisione del
 * proprietario, 02/09/2026): al commercialista va inviato tutto, e non può
 * vedere dati parziali, soprattutto a sua insaputa. L'accesso è binario — lo si
 * vede intero o non lo si vede — e lo governa il permesso sulla rotta.
 *
 * ⚠️ Il 02/09/2026 era stato introdotto un filtro per le sedi AUTORIZZATE
 * all'utente, dedotto dal fatto che il vecchio export dai movimenti lo
 * applicava. Nessuna regola l'aveva mai deciso, e l'effetto sarebbe stato un
 * corrispettivo totale più basso del vero senza nessun segnale. Il test
 * «nessuna restrizione senza filtro» qui sotto esiste per impedirne il ritorno.
 *
 * Resta il filtro Sede come SCELTA dell'operatore, che era rotto sui
 * Corrispettivi manuali.
 */

const TENANT = 'tenant-1';
const ALTRO_TENANT = 'tenant-2';
const QUERY = { page: 1, pageSize: 25 } as ListCorrispettiviQueryDto;

/** Prisma finto che REGISTRA i `where` ricevuti da ogni sorgente. */
function creaPrisma() {
  const whereRicevuti: Record<string, unknown[]> = {
    salesOrder: [],
    salesOrderRefund: [],
    document: [],
    manualReceipt: [],
  };

  const registra = (nome: string, valore: unknown) =>
    vi.fn().mockImplementation((args: { where?: unknown } = {}) => {
      whereRicevuti[nome]!.push(args.where);
      return Promise.resolve(valore);
    });

  const prisma = {
    location: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    salesOrder: { count: registra('salesOrder', 0), findMany: registra('salesOrder', []) },
    salesOrderRefund: {
      count: registra('salesOrderRefund', 0),
      findMany: registra('salesOrderRefund', []),
    },
    document: { count: registra('document', 0), findMany: registra('document', []) },
    manualReceipt: {
      count: registra('manualReceipt', 0),
      findMany: registra('manualReceipt', []),
    },
    tenant: {
      findUniqueOrThrow: vi
        .fn()
        .mockResolvedValue({ id: TENANT, name: 'Prova', legalName: 'Prova' }),
    },
  } as unknown as PrismaService;

  return { prisma, whereRicevuti };
}

/**
 * Il filtro sede arrivato a una sorgente.
 *
 * ⚠️ I RIMBORSI non hanno sede propria: la loro sta sull'ordine, quindi il
 * filtro è annidato in `order`. E si guarda la PRESENZA della chiave, non la
 * sua verità: `locationId: null` è un filtro valido — cerca le righe senza sede.
 */
function sedeDelWhere(where: unknown): unknown {
  const w = where as { locationId?: unknown; order?: { locationId?: unknown } } | undefined;
  if (!w) return undefined;
  if ('locationId' in w) return w.locationId;
  if (w.order && 'locationId' in w.order) return w.order.locationId;
  return undefined;
}

/**
 * Il tenant di una sorgente.
 *
 * ⚠️ Come per la sede, i RIMBORSI lo portano annidato in `order`: non hanno un
 * tenant proprio nel `where`, lo ereditano dall'ordine.
 */
function tenantDelWhere(where: unknown): unknown {
  const w = where as { tenantId?: unknown; order?: { tenantId?: unknown } } | undefined;
  if (!w) return undefined;
  if ('tenantId' in w) return w.tenantId;
  if (w.order && 'tenantId' in w.order) return w.order.tenantId;
  return undefined;
}

/**
 * La query di `undatedFulfilmentCount`: ordini evasi senza data di evasione.
 * È l'unica del riepilogo scritta fuori dai builder, e non porta né sede né
 * periodo — difetto adiacente dichiarato, non corretto in questa tranche.
 */
function evasiSenzaData(where: unknown): boolean {
  const w = where as { fulfilledAt?: unknown; fulfillmentStatus?: unknown } | undefined;
  return w?.fulfilledAt === null && w?.fulfillmentStatus === 'fulfilled';
}

describe('⛔ il Registro non si restringe da sé: guardia contro lo scope per sede', () => {
  it('senza filtro dell’operatore NESSUNA sorgente riceve una restrizione di sede', async () => {
    const { prisma, whereRicevuti } = creaPrisma();
    const service = new CorrispettiviService(prisma);

    await service.buildRegisterRows(TENANT, QUERY);

    /*
      ⛔ È il test che impedisce il ritorno dell'errore del 02/09/2026. Se
      qualcuno reintroducesse un filtro per le sedi autorizzate dell'utente,
      qui comparirebbe un `locationId` che nessuno ha chiesto — e con lui un
      corrispettivo totale più basso del vero, che è il difetto peggiore
      possibile in un registro fiscale (`10` §12).
    */
    for (const sorgente of Object.keys(whereRicevuti)) {
      for (const where of whereRicevuti[sorgente]!) {
        expect(sedeDelWhere(where), `${sorgente} ha una restrizione di sede non chiesta`).toBeUndefined();
      }
    }
  });

  it('nemmeno il RIEPILOGO si restringe da sé', async () => {
    const { prisma, whereRicevuti } = creaPrisma();
    const service = new CorrispettiviService(prisma);

    await service.getSummary(TENANT, QUERY);

    for (const sorgente of Object.keys(whereRicevuti)) {
      for (const where of whereRicevuti[sorgente]!) {
        expect(sedeDelWhere(where), sorgente).toBeUndefined();
      }
    }
  });

  it('nemmeno gli EXPORT, che sono ciò che va al commercialista', async () => {
    const { prisma, whereRicevuti } = creaPrisma();
    const exportService = new CorrispettiviExportService(prisma, new CorrispettiviService(prisma));

    await exportService.exportAccountantCsv(TENANT, QUERY);

    for (const sorgente of Object.keys(whereRicevuti)) {
      for (const where of whereRicevuti[sorgente]!) {
        expect(sedeDelWhere(where), sorgente).toBeUndefined();
      }
    }
  });

  /*
    ⚠️ CSV, foglio di calcolo e PDF passano dagli stessi `buildRegisterRows` e
    `getSummary`, quindi la garanzia è strutturale. Le prove ci sono lo stesso
    perché quel percorso condiviso non è una legge di natura: basta che un
    domani uno dei tre prenda una scorciatoia propria — è già successo con
    l'export delle giacenze — e la struttura smette di garantire.
  */
  it('nemmeno il FOGLIO DI CALCOLO', async () => {
    const { prisma, whereRicevuti } = creaPrisma();
    const exportService = new CorrispettiviExportService(prisma, new CorrispettiviService(prisma));

    await exportService.exportAccountantSpreadsheet(TENANT, QUERY);

    for (const sorgente of Object.keys(whereRicevuti)) {
      for (const where of whereRicevuti[sorgente]!) {
        expect(sedeDelWhere(where), sorgente).toBeUndefined();
      }
    }
  });

  it('nemmeno il PDF', async () => {
    const { prisma, whereRicevuti } = creaPrisma();
    const exportService = new CorrispettiviExportService(prisma, new CorrispettiviService(prisma));

    await exportService.exportAccountantPdf(TENANT, QUERY);

    for (const sorgente of Object.keys(whereRicevuti)) {
      for (const where of whereRicevuti[sorgente]!) {
        expect(sedeDelWhere(where), sorgente).toBeUndefined();
      }
    }
  });
});

describe('il filtro Sede scelto dall’operatore', () => {
  it('arriva a TUTTE e cinque le sorgenti, manuali compresi', async () => {
    const { prisma, whereRicevuti } = creaPrisma();
    const service = new CorrispettiviService(prisma);

    // La schermata manda SOLO il plurale: è la forma in cui il difetto viveva.
    await service.buildRegisterRows(TENANT, {
      ...QUERY,
      sedi: ['loc-1'],
    } as ListCorrispettiviQueryDto);

    for (const sorgente of Object.keys(whereRicevuti)) {
      const ricevuti = whereRicevuti[sorgente]!;
      expect(ricevuti.length, `${sorgente} non è stata interrogata`).toBeGreaterThan(0);
      for (const where of ricevuti) {
        expect(sedeDelWhere(where), sorgente).toEqual({ in: ['loc-1'] });
      }
    }
  });

  it('⛔ IL DIFETTO: il Corrispettivo manuale leggeva il contratto sbagliato', async () => {
    const { prisma, whereRicevuti } = creaPrisma();
    const service = new CorrispettiviService(prisma);

    await service.buildRegisterRows(TENANT, {
      ...QUERY,
      sedi: ['loc-1'],
    } as ListCorrispettiviQueryDto);

    // Leggeva `query.locationId`, sempre vuoto con questa forma: il filtro non
    // scattava mai e passavano i manuali di OGNI sede, anche nei totali e negli
    // export.
    expect(sedeDelWhere(whereRicevuti['manualReceipt']![0])).toEqual({ in: ['loc-1'] });
  });

  it('selezione multipla: tutte le sedi scelte, nessuna in più', async () => {
    const { prisma, whereRicevuti } = creaPrisma();
    const service = new CorrispettiviService(prisma);

    await service.buildRegisterRows(TENANT, {
      ...QUERY,
      sedi: ['loc-1', 'loc-3'],
    } as ListCorrispettiviQueryDto);

    expect(sedeDelWhere(whereRicevuti['salesOrder']![0])).toEqual({ in: ['loc-1', 'loc-3'] });
  });

  it('il riepilogo segue lo stesso filtro dell’elenco', async () => {
    const { prisma, whereRicevuti } = creaPrisma();
    const service = new CorrispettiviService(prisma);

    await service.getSummary(TENANT, { ...QUERY, sedi: ['loc-1'] } as ListCorrispettiviQueryDto);

    for (const where of whereRicevuti['salesOrder']!) {
      /*
        ⚠️ UNA query è esclusa, e va nominata invece che ignorata:
        `undatedFulfilmentCount` — gli ordini evasi senza data — è scritta a
        mano fuori dai builder e non porta né il filtro Sede né quello di
        PERIODO. È un difetto adiacente registrato in `10` §21 e non corretto
        qui: il numero si riferisce a tutto lo storico del tenant.
      */
      if (evasiSenzaData(where)) continue;

      const sede = sedeDelWhere(where);
      expect(sede, 'una query del riepilogo ignora il filtro').not.toBeUndefined();
      // `null` è la query del conteggio righe escluse: cerca apposta le righe
      // senza sede, ed è corretta.
      if (sede !== null) {
        expect(sede).toEqual({ in: ['loc-1'] });
      }
    }
  });

  it('il conteggio delle righe escluse ora si CALCOLA: prima era sempre zero', async () => {
    const { prisma, whereRicevuti } = creaPrisma();
    const service = new CorrispettiviService(prisma);

    await service.getSummary(TENANT, { ...QUERY, sedi: ['loc-1'] } as ListCorrispettiviQueryDto);

    // Guardava `query.locationId`, che con l'interfaccia attuale non arriva mai:
    // il banner di `docs/10` §12 non poteva comparire in nessun caso.
    expect(whereRicevuti['salesOrder']!.some((w) => sedeDelWhere(w) === null)).toBe(true);
  });

  it('senza filtro il conteggio è zero: non c’è nulla da escludere', async () => {
    const { prisma } = creaPrisma();
    const service = new CorrispettiviService(prisma);

    const riepilogo = await service.getSummary(TENANT, QUERY);

    expect(riepilogo.locationUndeterminedExcludedCount).toBe(0);
  });

  it('il filtro arriva anche al FOGLIO DI CALCOLO e al PDF', async () => {
    for (const quale of ['xls', 'pdf'] as const) {
      const { prisma, whereRicevuti } = creaPrisma();
      const exportService = new CorrispettiviExportService(
        prisma,
        new CorrispettiviService(prisma),
      );
      const conSede = { ...QUERY, sedi: ['loc-1'] } as ListCorrispettiviQueryDto;

      if (quale === 'xls') {
        await exportService.exportAccountantSpreadsheet(TENANT, conSede);
      } else {
        await exportService.exportAccountantPdf(TENANT, conSede);
      }

      expect(whereRicevuti['manualReceipt']!.length, quale).toBeGreaterThan(0);
      for (const where of whereRicevuti['manualReceipt']!) {
        expect(sedeDelWhere(where), quale).toEqual({ in: ['loc-1'] });
      }
    }
  });
});

/**
 * ISOLAMENTO TENANT.
 *
 * ⚠️ Questa prova era stata **persa**: viveva in `corrispettivi-scope-sedi.spec.ts`,
 * il file eliminato quando si è disfatto lo scope per sedi autorizzate. Il
 * comportamento era rimasto corretto — `tenantId` è in tutti e cinque i builder —
 * ma senza niente che lo tenesse fermo.
 *
 * ⛔ Lo scope sede **non sostituisce** quello del tenant, e toglierne uno non
 * poteva indebolire l'altro: è la ragione per cui la prova torna qui e non nel
 * file che è stato cancellato.
 */
describe('isolamento tenant', () => {
  it('ogni sorgente dell’elenco è limitata al tenant corrente', async () => {
    const { prisma, whereRicevuti } = creaPrisma();
    const service = new CorrispettiviService(prisma);

    await service.buildRegisterRows(ALTRO_TENANT, QUERY);

    for (const sorgente of Object.keys(whereRicevuti)) {
      const ricevuti = whereRicevuti[sorgente]!;
      expect(ricevuti.length, `${sorgente} non interrogata`).toBeGreaterThan(0);
      for (const where of ricevuti) {
        expect(tenantDelWhere(where), sorgente).toBe(ALTRO_TENANT);
      }
    }
  });

  it('anche il RIEPILOGO, comprese le sue query di conteggio', async () => {
    const { prisma, whereRicevuti } = creaPrisma();
    const service = new CorrispettiviService(prisma);

    await service.getSummary(ALTRO_TENANT, QUERY);

    for (const sorgente of Object.keys(whereRicevuti)) {
      for (const where of whereRicevuti[sorgente]!) {
        expect(tenantDelWhere(where), sorgente).toBe(ALTRO_TENANT);
      }
    }
  });

  it('e tutti e tre gli EXPORT', async () => {
    for (const quale of ['csv', 'xls', 'pdf'] as const) {
      const { prisma, whereRicevuti } = creaPrisma();
      const exportService = new CorrispettiviExportService(
        prisma,
        new CorrispettiviService(prisma),
      );

      if (quale === 'csv') await exportService.exportAccountantCsv(ALTRO_TENANT, QUERY);
      else if (quale === 'xls')
        await exportService.exportAccountantSpreadsheet(ALTRO_TENANT, QUERY);
      else await exportService.exportAccountantPdf(ALTRO_TENANT, QUERY);

      for (const sorgente of Object.keys(whereRicevuti)) {
        for (const where of whereRicevuti[sorgente]!) {
          expect(tenantDelWhere(where), `${quale}/${sorgente}`).toBe(ALTRO_TENANT);
        }
      }
    }
  });

  it('il filtro Sede non indebolisce quello del tenant', async () => {
    const { prisma, whereRicevuti } = creaPrisma();
    const service = new CorrispettiviService(prisma);

    await service.buildRegisterRows(ALTRO_TENANT, {
      ...QUERY,
      sedi: ['loc-1'],
    } as ListCorrispettiviQueryDto);

    for (const sorgente of Object.keys(whereRicevuti)) {
      for (const where of whereRicevuti[sorgente]!) {
        expect(tenantDelWhere(where), sorgente).toBe(ALTRO_TENANT);
        expect(sedeDelWhere(where), sorgente).toEqual({ in: ['loc-1'] });
      }
    }
  });
});

describe('normalizzaFiltroSedi — un solo contratto a valle', () => {
  it('nessun filtro: nessuna restrizione, righe senza sede comprese', () => {
    const q = normalizzaFiltroSedi({} as CorrispettiviListFilters);

    expect(q.sediEffettive).toBeNull();
  });

  it('il singolare storico confluisce nel plurale normalizzato', () => {
    const q = normalizzaFiltroSedi({ locationId: 'loc-1' } as CorrispettiviListFilters);

    expect(q.sediEffettive).toEqual(['loc-1']);
    // ⛔ I due contratti concorrenti non sopravvivono: a valle se ne legge uno.
    expect(q.locationId).toBeUndefined();
    expect(q.sedi).toBeUndefined();
  });

  it('il plurale vince sul singolare quando arrivano entrambi', () => {
    const q = normalizzaFiltroSedi({
      locationId: 'loc-9',
      sedi: ['loc-1'],
    } as CorrispettiviListFilters);

    expect(q.sediEffettive).toEqual(['loc-1']);
  });

  it('è IDEMPOTENTE: la seconda passata non perde il filtro', () => {
    const prima = normalizzaFiltroSedi({ sedi: ['loc-2'] } as CorrispettiviListFilters);
    const seconda = normalizzaFiltroSedi(prima);

    // `listOrders` chiama `buildRegisterRows`, che normalizza di nuovo: senza
    // la guardia il filtro scelto dall'operatore sparirebbe alla seconda passata.
    expect(seconda.sediEffettive).toEqual(['loc-2']);
  });
});
