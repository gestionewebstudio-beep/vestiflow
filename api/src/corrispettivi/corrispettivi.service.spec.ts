import { describe, expect, it, vi } from 'vitest';

import { CorrispettiviService } from './corrispettivi.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { ListCorrispettiviQueryDto } from './dto/list-corrispettivi.query.dto';

/**
 * Il Registro è delimitato dal **periodo** e dai **filtri**, non da un numero
 * di righe (`docs/10` §16).
 *
 * ⚠️ **Il difetto che questo file presidia era invisibile e conteggiato.** La
 * schermata chiedeva cento righe con `page: 1` fisso e non aveva paginatore:
 * su un periodo da 850 righe scriveva «850 righe nel periodo» — il totale era
 * giusto — e ne mostrava cento. Un registro contabile che ne mostra una parte
 * senza dirlo è peggio di uno che rifiuta il periodo.
 *
 * Le prove qui sotto girano su **150 vendite**, cioè oltre il vecchio taglio.
 */

const TENANT = 'tenant-1';
const RIGHE = 150;

function giorno(indice: number): Date {
  // Giorni decrescenti a partire dal 1° giugno: date economiche distinte, così
  // l'ordine atteso è noto senza dipendere dall'ordine di ritorno del database.
  return new Date(Date.UTC(2026, 5, 1 + indice, 10, 0, 0));
}

function venditaFinta(indice: number) {
  const at = giorno(indice);
  return {
    id: `ord-${String(indice).padStart(3, '0')}`,
    number: `#${1000 + indice}`,
    fulfilledAt: at,
    placedAt: at,
    createdAt: at,
    source: 'shopify_online',
    currency: 'EUR',
    subtotalMinor: 10000,
    taxMinor: 2200,
    totalMinor: 12200,
    financialStatus: 'paid',
    locationId: null,
    location: null,
    customer: { party: { email: null } },
    customerName: 'Cliente prova',
    customerLastName: null,
    customerCompany: null,
    note: null,
  };
}

/** Un Prisma finto: solo le delegate che l'elenco tocca davvero. */
function prismaConVendite(vendite: readonly unknown[]) {
  return {
    salesOrder: {
      count: vi.fn().mockResolvedValue(vendite.length),
      findMany: vi.fn().mockResolvedValue(vendite),
    },
    salesOrderRefund: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    document: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    manualReceipt: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaService;
}

const QUERY = { page: 1, pageSize: 25 } as ListCorrispettiviQueryDto;

describe('l’elenco del Registro non si ferma a cento righe', () => {
  it('restituisce TUTTE le righe del periodo, non una pagina', async () => {
    const vendite = Array.from({ length: RIGHE }, (_, i) => venditaFinta(i));
    const service = new CorrispettiviService(prismaConVendite(vendite));

    const pagina = await service.listOrders(TENANT, QUERY);

    expect(pagina.items).toHaveLength(RIGHE);
    // ⚠️ Il conteggio coincide con le righe consegnate: prima erano 150 e 100,
    // e la schermata mostrava il primo numero con il secondo insieme.
    expect(pagina.total).toBe(RIGHE);
    expect(pagina.items).toHaveLength(pagina.total);
  });

  it('nessuna riga persa e nessuna duplicata', async () => {
    const vendite = Array.from({ length: RIGHE }, (_, i) => venditaFinta(i));
    const service = new CorrispettiviService(prismaConVendite(vendite));

    const { items } = await service.listOrders(TENANT, QUERY);
    const identita = items.map((riga) => riga.rowId);

    expect(new Set(identita).size).toBe(RIGHE);
    expect(new Set(identita)).toEqual(new Set(vendite.map((v) => `sale:${v.id}`)));
  });

  /**
   * L'ordinamento è **globale**, calcolato prima di qualunque consegna: deve
   * restare quello canonico anche oltre il vecchio taglio — è lì che un ordine
   * per pagina si sarebbe visto.
   */
  it('l’ordine globale resta canonico su tutte e 150', async () => {
    // In ingresso mescolate, per non misurare l'ordine del database.
    const vendite = Array.from({ length: RIGHE }, (_, i) => venditaFinta(i));
    const mescolate = [...vendite.slice(70), ...vendite.slice(0, 70)];
    const service = new CorrispettiviService(prismaConVendite(mescolate));

    const { items } = await service.listOrders(TENANT, QUERY);

    for (let i = 1; i < items.length; i += 1) {
      expect(items[i - 1]!.occurredAt.getTime()).toBeGreaterThanOrEqual(
        items[i]!.occurredAt.getTime(),
      );
    }
    // La più recente in cima, la più vecchia in fondo: giorno economico DESC.
    expect(items[0]!.rowId).toBe(`sale:ord-${String(RIGHE - 1).padStart(3, '0')}`);
    expect(items.at(-1)!.rowId).toBe('sale:ord-000');
  });

  /**
   * ⚠️ `page` e `pageSize` restano nel tipo perché `Paginated` è condivisa, ma
   * qui non decidono più niente. Un parametro accettato e ignorato è il difetto
   * di `onlineOnly`, che questa stessa area ha già pagato una volta: se un
   * giorno tornassero a tagliare, questo test lo direbbe.
   */
  it('un pageSize piccolo non taglia più niente', async () => {
    const vendite = Array.from({ length: RIGHE }, (_, i) => venditaFinta(i));
    const service = new CorrispettiviService(prismaConVendite(vendite));

    const pagina = await service.listOrders(TENANT, {
      page: 1,
      pageSize: 10,
    } as ListCorrispettiviQueryDto);

    expect(pagina.items).toHaveLength(RIGHE);
  });
});

/**
 * Il riepilogo segue il filtro Tipo, e i sottoinsiemi si riconciliano
 * (`docs/10` §16, passo 4 del blocco A).
 *
 * ⚠️ **Fino al 17/08/2026 il riepilogo IGNORAVA il filtro Tipo**: leggeva
 * sempre tutte le vendite e chiedeva le rettifiche con `rowType: undefined`
 * esplicito. Era deliberato, ma rende impossibile la proprietà che il Registro
 * deve garantire — somma dei sottoinsiemi = totale del periodo — e i subtotali
 * giornalieri del blocco B sono esattamente dei sottoinsiemi.
 */

function prismaConEconomia(opzioni: {
  vendite?: readonly unknown[];
  rettifiche?: readonly { totalMinor: number; taxMinor: number }[];
}) {
  const vendite = opzioni.vendite ?? [];
  const rettifiche = opzioni.rettifiche ?? [];
  return {
    salesOrder: {
      count: vi.fn().mockResolvedValue(vendite.length),
      findMany: vi.fn().mockResolvedValue(vendite),
    },
    salesOrderRefund: {
      count: vi.fn().mockResolvedValue(rettifiche.length),
      findMany: vi.fn().mockImplementation(({ where }: { where: { kind?: unknown } }) =>
        // Gli annullamenti sono un'interrogazione a parte: qui non ce ne sono.
        Promise.resolve(where?.kind === 'cancellation' ? [] : rettifiche),
      ),
    },
    document: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    manualReceipt: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaService;
}

const VENDITE = [venditaFinta(0), venditaFinta(1)];
const RETTIFICHE = [{ totalMinor: 8000, taxMinor: 1440 }];

function conTipi(tipi: string[]): ListCorrispettiviQueryDto {
  return { page: 1, pageSize: 25, tipi } as unknown as ListCorrispettiviQueryDto;
}

describe('il riepilogo segue il filtro Tipo', () => {
  it('con i soli Resi le vendite non entrano nel totale', async () => {
    const service = new CorrispettiviService(
      prismaConEconomia({ vendite: VENDITE, rettifiche: RETTIFICHE }),
    );

    const riepilogo = await service.getSummary('t', conTipi(['returns']));

    expect(riepilogo.totalMinor).toBe(0);
    expect(riepilogo.orderCount).toBe(0);
    expect(riepilogo.refundTotalMinor).toBe(8000);
    // ⚠️ Il netto è NEGATIVO, e adesso lo dice: prima usciva schiacciato a
    // zero dal clamp, contraddicendo le righe sopra — dove un reso mostra −80,00.
    expect(riepilogo.netTotalMinor).toBe(-8000);
    expect(riepilogo.netTaxableMinor).toBe(-6560);
  });

  it('con le sole Vendite le rettifiche non entrano', async () => {
    const service = new CorrispettiviService(
      prismaConEconomia({ vendite: VENDITE, rettifiche: RETTIFICHE }),
    );

    const riepilogo = await service.getSummary('t', conTipi(['sales']));

    expect(riepilogo.totalMinor).toBe(24400);
    expect(riepilogo.refundTotalMinor).toBe(0);
    expect(riepilogo.netTotalMinor).toBe(24400);
  });

  /** La prova che tiene insieme il passo 3 e il passo 4. */
  it('somma dei sottoinsiemi = riepilogo del periodo', async () => {
    const prisma = prismaConEconomia({ vendite: VENDITE, rettifiche: RETTIFICHE });
    const service = new CorrispettiviService(prisma);

    const soloVendite = await service.getSummary('t', conTipi(['sales']));
    const soloRettifiche = await service.getSummary('t', conTipi(['returns', 'refunds']));
    const tutto = await service.getSummary('t', conTipi([]));

    expect(soloVendite.totalMinor + soloRettifiche.totalMinor).toBe(tutto.totalMinor);
    expect(soloVendite.taxMinor + soloRettifiche.taxMinor).toBe(tutto.taxMinor);
    expect(soloVendite.refundTotalMinor + soloRettifiche.refundTotalMinor).toBe(
      tutto.refundTotalMinor,
    );
    expect(soloVendite.netTotalMinor + soloRettifiche.netTotalMinor).toBe(tutto.netTotalMinor);
    // ⚠️ È l'uguaglianza che il clamp rompeva: il sottoinsieme in perdita
    // usciva 0, e la somma delle parti superava il tutto.
    expect(soloVendite.netTaxableMinor + soloRettifiche.netTaxableMinor).toBe(
      tutto.netTaxableMinor,
    );
    expect(soloVendite.taxableMinor + soloRettifiche.taxableMinor).toBe(tutto.taxableMinor);
  });
});
