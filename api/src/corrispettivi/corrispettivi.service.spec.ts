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
