import { describe, expect, it } from 'vitest';

import {
  fulfillmentOrderGidsDalWebhook,
  motivoSedeNonDeterminabile,
  sediPerRigaDaFulfillmentOrders,
  senzaMotivoSede,
  type FulfillmentOrderRemoto,
} from './shopify-fulfillment-orders.util';
import { ORDINE_SENZA_SEDE_MARCATORE } from './shopify-order-location.util';

/**
 * La sede di ogni riga dai fulfillment order — la parte pura della decisione
 * del 13/09/2026 (`DA-FARE` §10e.7-bis). Ciò che qui si fissa:
 * un solo fulfillment order attivo → assegnata; nessuno → in attesa; più di
 * uno → divisa (limite dichiarato); solo chiusi → evasa. E la quantità NON esce
 * da qui: solo il dove.
 */
describe('sediPerRigaDaFulfillmentOrders', () => {
  const A = 'gid://shopify/Location/1';
  const B = 'gid://shopify/Location/2';
  const fo = (
    id: string,
    status: string,
    location: string | null,
    righe: readonly [string, number][],
  ): FulfillmentOrderRemoto => ({
    id,
    status,
    assignedLocationGid: location,
    righe: righe.map(([lineId, remaining]) => ({
      lineItemGid: `gid://shopify/LineItem/${lineId}`,
      remainingQuantity: remaining,
      totalQuantity: remaining,
    })),
  });
  const righe = [
    { salesOrderLineId: 'r1', externalLineId: '11' },
    { salesOrderLineId: 'r2', externalLineId: '12' },
  ];

  it('due righe su due fulfillment order attivi: ognuna ha la SUA sede', () => {
    const esito = sediPerRigaDaFulfillmentOrders(
      [fo('f1', 'OPEN', A, [['11', 2]]), fo('f2', 'OPEN', B, [['12', 1]])],
      righe,
    );
    expect(esito.get('r1')).toEqual({ esito: 'assegnata', shopifyLocationGid: A, residuo: 2 });
    expect(esito.get('r2')).toEqual({ esito: 'assegnata', shopifyLocationGid: B, residuo: 1 });
  });

  it('la stessa riga in DUE fulfillment order attivi sulla STESSA sede: assegnata, col residuo sommato', () => {
    // ⭐ Il residuo è ciò che dice se TUTTA la quantità residua sta in quel posto:
    //    due fulfillment order nella stessa location non sono una riga divisa.
    const esito = sediPerRigaDaFulfillmentOrders(
      [fo('f1', 'OPEN', A, [['11', 1]]), fo('f2', 'IN_PROGRESS', A, [['11', 2]])],
      righe,
    );
    expect(esito.get('r1')).toEqual({ esito: 'assegnata', shopifyLocationGid: A, residuo: 3 });
  });

  it('nessun fulfillment order: in attesa — Shopify non ha ancora assegnato', () => {
    const esito = sediPerRigaDaFulfillmentOrders([], righe);
    expect(esito.get('r1')).toEqual({ esito: 'in_attesa' });
    expect(esito.get('r2')).toEqual({ esito: 'in_attesa' });
  });

  it('la stessa riga in due fulfillment order attivi su due sedi: DIVISA, il limite dichiarato', () => {
    const esito = sediPerRigaDaFulfillmentOrders(
      [fo('f1', 'OPEN', A, [['11', 2]]), fo('f2', 'OPEN', B, [['11', 1]])],
      [righe[0]!],
    );
    expect(esito.get('r1')).toEqual({ esito: 'divisa', shopifyLocationGids: [A, B] });
  });

  it('spostamento: il fulfillment order chiuso non conta, vale quello aperto nella sede nuova', () => {
    const esito = sediPerRigaDaFulfillmentOrders(
      [fo('f1', 'CLOSED', A, [['11', 2]]), fo('f2', 'OPEN', B, [['11', 2]])],
      [righe[0]!],
    );
    expect(esito.get('r1')).toEqual({ esito: 'assegnata', shopifyLocationGid: B, residuo: 2 });
  });

  it('riga solo in fulfillment order chiusi: EVASA, non in attesa', () => {
    const esito = sediPerRigaDaFulfillmentOrders([fo('f1', 'CLOSED', A, [['11', 0]])], [righe[0]!]);
    expect(esito.get('r1')).toEqual({ esito: 'evasa' });
  });

  it('spedizione parziale: il residuo scende ma la riga resta ASSEGNATA a quella sede', () => {
    // 3 ordinati, 1 spedito: remainingQuantity 2. La quantità dell'impegno non
    // viene da qui (sarebbe una seconda sottrazione delle spedite).
    const esito = sediPerRigaDaFulfillmentOrders(
      [fo('f1', 'IN_PROGRESS', A, [['11', 2]])],
      [righe[0]!],
    );
    expect(esito.get('r1')).toEqual({ esito: 'assegnata', shopifyLocationGid: A, residuo: 2 });
  });

  it('fulfillment order attivo senza location (eliminata): la riga è in attesa', () => {
    const esito = sediPerRigaDaFulfillmentOrders(
      [fo('f1', 'OPEN', null, [['11', 2]])],
      [righe[0]!],
    );
    expect(esito.get('r1')).toEqual({ esito: 'in_attesa' });
  });

  it('riga senza id esterno: non abbinabile, in attesa', () => {
    const esito = sediPerRigaDaFulfillmentOrders(
      [fo('f1', 'OPEN', A, [['11', 2]])],
      [{ salesOrderLineId: 'r9', externalLineId: null }],
    );
    expect(esito.get('r9')).toEqual({ esito: 'in_attesa' });
  });
});

describe('fulfillmentOrderGidsDalWebhook', () => {
  it('order_routing_complete: il fulfillment order, nessun ordine', () => {
    expect(
      fulfillmentOrderGidsDalWebhook({
        fulfillment_order: { id: 'gid://shopify/FulfillmentOrder/77', status: 'open' },
      }),
    ).toEqual({ fulfillmentOrderGids: ['gid://shopify/FulfillmentOrder/77'], orderId: null });
  });

  it('moved: originale e spostato, senza doppioni, e un id numerico diventa GID', () => {
    expect(
      fulfillmentOrderGidsDalWebhook({
        original_fulfillment_order: { id: 'gid://shopify/FulfillmentOrder/1', status: 'closed' },
        moved_fulfillment_order: { id: 2, status: 'open' },
        source_fulfillment_order: { id: 'gid://shopify/FulfillmentOrder/1' },
      }).fulfillmentOrderGids,
      // Prima quello SPOSTATO (vivo), poi l'originale: per risalire all'ordine basta il primo.
    ).toEqual(['gid://shopify/FulfillmentOrder/2', 'gid://shopify/FulfillmentOrder/1']);
  });

  it("un order_id, se c'è, si prende senza risalire", () => {
    expect(
      fulfillmentOrderGidsDalWebhook({ fulfillment_order: { id: 5, order_id: 900 } }).orderId,
    ).toBe('900');
  });

  it('payload senza fulfillment order: niente', () => {
    expect(fulfillmentOrderGidsDalWebhook({ id: 1 })).toEqual({
      fulfillmentOrderGids: [],
      orderId: null,
    });
  });
});

describe('motivoSedeNonDeterminabile', () => {
  it("porta il MARCATORE della protezione e, per il permesso mancante, l'ambito e l'azione", () => {
    const motivo = motivoSedeNonDeterminabile([
      { tipo: 'permesso_mancante', dettaglio: 'Access denied' },
    ]);
    expect(motivo.startsWith(`${ORDINE_SENZA_SEDE_MARCATORE}:`)).toBe(true);
    expect(motivo).toContain('read_merchant_managed_fulfillment_orders');
    expect(motivo).toContain('Disconnetti e Connetti');
    expect(motivo).not.toContain('collega la location');
  });

  it('location non collegata: nomina la location e manda a Sedi; un tipo ripetuto compare una volta', () => {
    const motivo = motivoSedeNonDeterminabile([
      {
        tipo: 'location_non_collegata',
        shopifyLocationGid: 'gid://shopify/Location/9',
        residuoAssegnato: 1,
        letturaCompleta: true,
      },
      {
        tipo: 'location_non_collegata',
        shopifyLocationGid: 'gid://shopify/Location/9',
        residuoAssegnato: 1,
        letturaCompleta: true,
      },
      { tipo: 'in_attesa' },
    ]);
    expect(motivo).toContain('gid://shopify/Location/9');
    expect(motivo).toContain('Impostazioni → Shopify → Sedi');
    expect(motivo.split('gid://shopify/Location/9').length - 1).toBe(1);
    expect(motivo).toContain('non ha ancora assegnato');
  });

  it("riga divisa: dice il limite, non un'azione impossibile", () => {
    const motivo = motivoSedeNonDeterminabile([
      {
        tipo: 'divisa',
        shopifyLocationGids: ['gid://shopify/Location/1', 'gid://shopify/Location/2'],
      },
    ]);
    expect(motivo).toContain('suddivisa fra più sedi');
    expect(motivo).toContain('una sola sede');
  });
});

describe('senzaMotivoSede', () => {
  it('toglie SOLO il segmento della sede e lascia gli altri motivi', () => {
    const esito = senzaMotivoSede(
      `Riga chiusa · ${ORDINE_SENZA_SEDE_MARCATORE}: in attesa. · Altro motivo`,
    );
    expect(esito).toEqual({ reviewReason: 'Riga chiusa · Altro motivo', cambiato: true });
  });

  it('se resta solo la sede, non resta niente', () => {
    expect(senzaMotivoSede(`${ORDINE_SENZA_SEDE_MARCATORE}: in attesa.`)).toEqual({
      reviewReason: null,
      cambiato: true,
    });
  });

  it('senza il marcatore non cambia niente', () => {
    expect(senzaMotivoSede('Rimborso da verificare')).toEqual({
      reviewReason: 'Rimborso da verificare',
      cambiato: false,
    });
    expect(senzaMotivoSede(null)).toEqual({ reviewReason: null, cambiato: false });
  });
});
