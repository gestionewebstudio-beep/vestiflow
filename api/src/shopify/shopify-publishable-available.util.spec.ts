import { describe, expect, it } from 'vitest';

import { computeShopifyPublishableAvailable } from './shopify-publishable-available.util';

/**
 * ⛔ **Comportamento SUPERATO il 09/09/2026.** Queste prove chiamavano la
 *    funzione con `(onHand, committed)` e una con `(10, 3, 2)` per la scorta di
 *    sicurezza: la funzione RICALCOLAVA il Disponibile invece di riceverlo.
 *    Ora il numero arriva dal gestionale — la colonna `inventory_levels.
 *    available`, la stessa che l'operatore legge — e qui resta solo il clamp.
 *    La scorta di sicurezza non esiste più: decisione esplicita, non un
 *    parametro dimenticato.
 */
describe('computeShopifyPublishableAvailable — solo il clamp verso il canale', () => {
  it('un disponibile positivo passa tale e quale', () => {
    expect(computeShopifyPublishableAvailable(7)).toBe(7);
  });

  it('⛔ il negativo NON esce dal gestionale: al canale va zero', () => {
    expect(computeShopifyPublishableAvailable(-3)).toBe(0);
  });

  it('lo zero resta zero', () => {
    expect(computeShopifyPublishableAvailable(0)).toBe(0);
  });

  it('⭐ e non c è nessun altro aggiustamento: nessuna scorta, nessun arrotondamento', () => {
    // ⚠️ Se un giorno tornasse una scorta di sicurezza, questa riga cadrebbe —
    //    ed è quello che deve succedere: sarebbe una decisione, non un ritocco.
    expect(computeShopifyPublishableAvailable(1)).toBe(1);
    expect(computeShopifyPublishableAvailable(1000)).toBe(1000);
  });
});
