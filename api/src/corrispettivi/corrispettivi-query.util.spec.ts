import {
  SalesOrderRefundKind as PrismaRefundKind,
  SalesOrderSource as PrismaSource,
} from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  buildCorrispettiviManualWhere,
  buildCorrispettiviRefundWhere,
  buildCorrispettiviStoreSaleWhere,
  buildCorrispettiviWhere,
} from './corrispettivi-query.util';

describe('buildCorrispettiviWhere', () => {
  const tenantId = 'tenant-1';

  // Lo stato fiscale non esiste più (16/08/2026): il Registro classifica per
  // ORIGINE, che è un fatto della vendita. Shopify POS compare come vendita
  // fisica/POS, non viene escluso — la scelta la fa il filtro di ambito.
  it('ambito e canale restringono le origini, insieme', () => {
    expect(buildCorrispettiviWhere(tenantId, { ambito: 'fisico_pos', canale: 'shopify' }).source)
      .toEqual({ in: [PrismaSource.shopify_pos] });
    expect(buildCorrispettiviWhere(tenantId, { ambito: 'online', canale: 'shopify' }).source)
      .toEqual({ in: [PrismaSource.shopify_online] });
  });

  it('canale Shopify con ambito libero prende ecommerce e POS', () => {
    const source = buildCorrispettiviWhere(tenantId, { canale: 'shopify' }).source as {
      in: string[];
    };
    expect(source.in).toContain(PrismaSource.shopify_online);
    expect(source.in).toContain(PrismaSource.shopify_pos);
  });

  // ⚠️ Il filtro origine c’è SEMPRE, ed è la PRIMA domanda del Registro:
  // «questo evento è un corrispettivo?». Un Ordine cliente manuale non lo è —
  // impegno commerciale, non vendita — e senza questa riga entrava: misurati
  // due ordini per 229,36 €.
  it('senza filtri il Registro scarta comunque le origini che non sono corrispettivi', () => {
    const source = buildCorrispettiviWhere(tenantId, {}).source as { in: string[] };
    expect(source.in).not.toContain(PrismaSource.manual);
    expect(source.in).toContain(PrismaSource.shopify_online);
    expect(source.in).toContain(PrismaSource.store);
  });

  // ── La Vendita al banco: terza sorgente del Registro (`11` A9) ─────────

  it('la Vendita al banco entra nel Registro quando i filtri non la escludono', () => {
    const where = buildCorrispettiviStoreSaleWhere(tenantId, {});
    expect(where).not.toBeNull();
    expect(where?.type).toBe('store_sale');
    // Una vendita annullata non è un corrispettivo.
    expect(where?.status).toEqual({ not: 'cancelled' });
  });

  it('la data del Registro è quella del documento, non quella di creazione', () => {
    const where = buildCorrispettiviStoreSaleWhere(tenantId, {
      placedFrom: '2026-06-01',
      placedTo: '2026-06-30',
    });
    expect(where?.documentDate).toEqual({
      gte: new Date('2026-06-01T00:00:00.000Z'),
      lte: new Date('2026-06-30T23:59:59.999Z'),
    });
  });

  it('i filtri che escludono il canale VestiFlow la lasciano fuori', () => {
    expect(buildCorrispettiviStoreSaleWhere(tenantId, { canale: 'shopify' })).toBeNull();
    expect(buildCorrispettiviStoreSaleWhere(tenantId, { ambito: 'online' })).toBeNull();
  });

  it('Fisico/POS + VestiFlow la tiene dentro', () => {
    expect(
      buildCorrispettiviStoreSaleWhere(tenantId, { ambito: 'fisico_pos', canale: 'vestiflow' }),
    ).not.toBeNull();
  });

  it('uno stato di pagamento la esclude: è una domanda che riguarda gli ordini', () => {
    expect(buildCorrispettiviStoreSaleWhere(tenantId, { financialStatus: 'paid' })).toBeNull();
    expect(buildCorrispettiviStoreSaleWhere(tenantId, { refundsOnly: true })).toBeNull();
  });

  it('il periodo si misura sulla data di EVASIONE, non su quella dell ordine', () => {
    const where = buildCorrispettiviWhere(tenantId, {
      placedFrom: '2026-06-01',
      placedTo: '2026-06-30',
    });

    // Prima era `placedAt`: il registro contava gli ordini del periodo, evasi
    // o no. Su agosto 2026 dichiarava 386,49 € invece di 50,00 (01 §2.16).
    expect(where.placedAt).toBeUndefined();
    expect(where.fulfilledAt).toEqual({
      gte: new Date('2026-06-01T00:00:00.000Z'),
      lte: new Date('2026-06-30T23:59:59.999Z'),
      not: null,
    });
  });

  it('senza periodo esclude comunque gli ordini mai evasi', () => {
    expect(buildCorrispettiviWhere(tenantId, {}).fulfilledAt).toEqual({ not: null });
  });

  it('NON filtra gli annullati: una vendita avvenuta non sparisce a posteriori', () => {
    const where = buildCorrispettiviWhere(tenantId, { placedFrom: '2026-08-01' });

    // Un annullamento pre-evasione non ha data di evasione e resta fuori da sé.
    // Uno post-evasione lascia la vendita alla sua data: la rettifica arriva
    // alla propria, e non si riscrive il passato.
    expect(where.cancelledAt).toBeUndefined();
  });
});

describe('buildCorrispettiviRefundWhere', () => {
  const tenantId = 'tenant-1';

  it('misura il periodo sulla data della RETTIFICA', () => {
    const where = buildCorrispettiviRefundWhere(tenantId, {
      placedFrom: '2026-08-01',
      placedTo: '2026-08-31',
    });

    expect(where.tenantId).toBe(tenantId);
    expect(where.occurredAt).toEqual({
      gte: new Date('2026-08-01T00:00:00.000Z'),
      lte: new Date('2026-08-31T23:59:59.999Z'),
    });
  });

  it('lascia fuori gli annullamenti', () => {
    const where = buildCorrispettiviRefundWhere(tenantId, {});

    expect(where.kind).toEqual({ not: PrismaRefundKind.cancellation });
  });

  it('segue ambito e canale dell ordine collegato', () => {
    expect(buildCorrispettiviRefundWhere(tenantId, { ambito: 'online' }).order).toEqual({
      source: { in: [PrismaSource.shopify_online] },
    });
    expect(buildCorrispettiviRefundWhere(tenantId, { ambito: 'fisico_pos', canale: 'shopify' }).order)
      .toEqual({ source: { in: [PrismaSource.shopify_pos] } });
    // Anche qui il filtro resta: una rettifica su un ordine che non è un
    // corrispettivo non è un corrispettivo negativo.
    const senzaFiltri = buildCorrispettiviRefundWhere(tenantId, {}).order as {
      source: { in: string[] };
    };
    expect(senzaFiltri.source.in).not.toContain(PrismaSource.manual);
  });

  it('ignora i filtri che descrivono un ordine e non una rettifica', () => {
    const where = buildCorrispettiviRefundWhere(tenantId, {
      financialStatus: 'paid',
      search: 'Rossi',
    });

    expect(where.tenantId).toBe(tenantId);
    expect(where.kind).toEqual({ not: PrismaRefundKind.cancellation });
    // Lo stato di pagamento e la ricerca descrivono un ORDINE: qui non entrano.
    expect(where).not.toHaveProperty('financialStatus');
    expect(where).not.toHaveProperty('OR');
  });
});

/**
 * La **quarta sorgente** del Registro (`10` §12–§13).
 *
 * Gemella di quella della Vendita al banco, e con lo stesso `return null`: è
 * così che una domanda che riguarda solo gli ordini — stato di pagamento, «solo
 * resi» — spegne una sorgente che ordine non è, invece di mostrarla senza.
 */
describe('buildCorrispettiviManualWhere', () => {
  const tenantId = 'tenant-1';

  it('entra nel Registro quando i filtri non la escludono', () => {
    const where = buildCorrispettiviManualWhere(tenantId, {});
    expect(where).not.toBeNull();
    expect(where?.tenantId).toBe(tenantId);
    // Nessuno stato da filtrare: la registrazione non ne ha uno — esiste, o è
    // stata eliminata. Niente `status`, niente soft-delete (`10` §12).
    expect(where).not.toHaveProperty('status');
    expect(where).not.toHaveProperty('deletedAt');
  });

  it('il periodo si misura sulla data economica digitata, non sul salvataggio', () => {
    const where = buildCorrispettiviManualWhere(tenantId, {
      placedFrom: '2026-08-01',
      placedTo: '2026-08-31',
    });
    expect(where?.documentDate).toEqual({
      gte: new Date('2026-08-01T00:00:00.000Z'),
      lte: new Date('2026-08-31T23:59:59.999Z'),
    });
    // Una chiusura di cassa recuperata il giorno dopo resta del giorno prima.
    expect(where).not.toHaveProperty('createdAt');
  });

  it('i filtri che escludono Fisico/POS · VestiFlow la lasciano fuori', () => {
    expect(buildCorrispettiviManualWhere(tenantId, { ambito: 'online' })).toBeNull();
    expect(buildCorrispettiviManualWhere(tenantId, { canale: 'shopify' })).toBeNull();
    expect(
      buildCorrispettiviManualWhere(tenantId, { ambito: 'fisico_pos', canale: 'vestiflow' }),
    ).not.toBeNull();
  });

  it('una domanda che riguarda gli ordini la spegne', () => {
    // Non ha un ciclo di pagamento: mostrarla senza risponderebbe a una domanda
    // diversa da quella posta.
    expect(buildCorrispettiviManualWhere(tenantId, { financialStatus: 'paid' })).toBeNull();
    expect(buildCorrispettiviManualWhere(tenantId, { refundsOnly: true })).toBeNull();
  });

  /**
   * ⚠️ **Il filtro Origine è la sola dimensione che la isola.**
   *
   * Fino al 17/08/2026 non esisteva: c'era un `source` che ammetteva due soli
   * valori (`online`, `pos`) e che nessuna UI mandava. Ambito e canale non
   * bastano — il Corrispettivo manuale condivide con la Vendita al banco la
   * coppia Fisico/POS · VestiFlow, quindi chiedendo quella coppia si ottenevano
   * entrambe.
   */
  it('l’Origine isola davvero il Corrispettivo manuale', () => {
    expect(buildCorrispettiviManualWhere(tenantId, { origine: 'manual_receipt' })).not.toBeNull();
    // Chiedendo il manuale, la Vendita al banco si spegne — ed è il difetto che
    // il filtro esiste per correggere.
    expect(buildCorrispettiviStoreSaleWhere(tenantId, { origine: 'manual_receipt' })).toBeNull();
    // E viceversa.
    expect(buildCorrispettiviManualWhere(tenantId, { origine: 'store' })).toBeNull();
    expect(buildCorrispettiviStoreSaleWhere(tenantId, { origine: 'store' })).not.toBeNull();
    // Un'origine Shopify le spegne entrambe.
    expect(buildCorrispettiviManualWhere(tenantId, { origine: 'shopify_online' })).toBeNull();
    expect(buildCorrispettiviStoreSaleWhere(tenantId, { origine: 'shopify_online' })).toBeNull();
  });

  it('la sede filtra, e «senza sede» non la riguarda mai', () => {
    expect(buildCorrispettiviManualWhere(tenantId, { locationId: 'loc-1' })?.locationId).toBe(
      'loc-1',
    );
    // La sede è obbligatoria per costruzione: nessuna registrazione manuale può
    // finire fra le «non determinate», quindi la domanda non la tocca.
    expect(buildCorrispettiviManualWhere(tenantId, { undeterminedLocationOnly: true })).toBeNull();
  });
});

/**
 * Il filtro **Sede**, entrato col Corrispettivo manuale (`10` §12).
 *
 * Le righe senza sede escono dal risultato — a quella sede non sono
 * attribuibili — ma la schermata dichiara quante sono: un Registro che perde
 * righe appena si sceglie una sede mostrerebbe un totale più basso del vero.
 */
describe('filtro Sede sulle tre sorgenti che possono non averla', () => {
  const tenantId = 'tenant-1';

  it('la sede scelta filtra vendite, rettifiche e vendite al banco', () => {
    expect(buildCorrispettiviWhere(tenantId, { locationId: 'loc-1' }).locationId).toBe('loc-1');
    expect(buildCorrispettiviRefundWhere(tenantId, { locationId: 'loc-1' }).order).toMatchObject({
      locationId: 'loc-1',
    });
    expect(buildCorrispettiviStoreSaleWhere(tenantId, { locationId: 'loc-1' })?.locationId).toBe(
      'loc-1',
    );
  });

  it('«senza sede» è un VALORE, non «qualunque»', () => {
    // `locationId: null` aggancia le righe che una sede non ce l'hanno. Scritto
    // come assenza del filtro conterebbe tutto, e il numero dichiarato in
    // schermata direbbe una cifra senza rapporto con le righe sparite.
    expect(
      buildCorrispettiviWhere(tenantId, { undeterminedLocationOnly: true }).locationId,
    ).toBeNull();
    expect(
      buildCorrispettiviRefundWhere(tenantId, { undeterminedLocationOnly: true }).order,
    ).toMatchObject({ locationId: null });
    expect(
      buildCorrispettiviStoreSaleWhere(tenantId, { undeterminedLocationOnly: true })?.locationId,
    ).toBeNull();
  });

  it('senza filtro Sede nessuna delle tre porta un vincolo di sede', () => {
    expect(buildCorrispettiviWhere(tenantId, {})).not.toHaveProperty('locationId');
    expect(buildCorrispettiviRefundWhere(tenantId, {}).order).not.toHaveProperty('locationId');
    expect(buildCorrispettiviStoreSaleWhere(tenantId, {})).not.toHaveProperty('locationId');
  });
});
