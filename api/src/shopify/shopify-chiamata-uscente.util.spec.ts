import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import {
  descriviChiamataGraphql,
  registraChiamataGraphql,
  registraChiamataRest,
} from './shopify-chiamata-uscente.util';

/**
 * Il log delle chiamate verso Shopify distingue LETTURE e SCRITTURE: è la misura
 * con cui si dice «nessuna scrittura» (collaudo del 13/09/2026, prova 3).
 */
describe('shopify-chiamata-uscente', () => {
  it('riconosce una mutation dal documento, col nome del primo campo', () => {
    expect(
      descriviChiamataGraphql(`
        mutation SetQuantities($input: InventorySetQuantitiesInput!) {
          inventorySetQuantities(input: $input) { userErrors { message } }
        }`),
    ).toEqual({ tipo: 'mutation', nome: 'inventorySetQuantities' });
  });

  it('una query resta una lettura, anche senza nome di operazione', () => {
    expect(
      descriviChiamataGraphql(`{ fulfillmentOrders(first: 10) { edges { node { id } } } }`),
    ).toEqual({
      tipo: 'query',
      nome: 'fulfillmentOrders',
    });
    expect(
      descriviChiamataGraphql(`query Livello($id: ID!) { inventoryItem(id: $id) { id } }`),
    ).toEqual({ tipo: 'query', nome: 'inventoryItem' });
  });

  it('scrive le SCRITTURE al livello log e le letture a debug — REST e GraphQL', () => {
    const logger = { log: vi.fn(), debug: vi.fn() } as unknown as Logger;

    registraChiamataRest(logger, 'PUT', '/variants/1.json');
    registraChiamataRest(logger, undefined, '/orders/1.json');
    registraChiamataGraphql(logger, 'mutation { productUpdate(input: {}) { product { id } } }');
    registraChiamataGraphql(logger, 'query { shop { name } }');

    expect(vi.mocked(logger.log).mock.calls.map((c) => c[0])).toEqual([
      'Shopify ← SCRITTURA REST PUT /variants/1.json',
      'Shopify ← SCRITTURA GraphQL productUpdate',
    ]);
    expect(vi.mocked(logger.debug).mock.calls.map((c) => c[0])).toEqual([
      'Shopify ← lettura REST GET /orders/1.json',
      'Shopify ← lettura GraphQL shop',
    ]);
  });
});
