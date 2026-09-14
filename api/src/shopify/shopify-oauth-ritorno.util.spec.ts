import { indirizzoRitornoShopify, PAGINA_IMPOSTAZIONI_SHOPIFY } from './shopify-oauth-ritorno.util';

describe('indirizzoRitornoShopify', () => {
  const frontend = 'http://localhost:4212';

  it('⛔ rimanda alla SOTTO-PAGINA Shopify, non alla radice delle Impostazioni', () => {
    // Misurato al collaudo del 13/09/2026: alla radice nessuno legge `?shopify=`.
    const url = indirizzoRitornoShopify(frontend, 'connected');

    expect(url).toBe('http://localhost:4212/app/settings/shopify?shopify=connected');
    expect(PAGINA_IMPOSTAZIONI_SHOPIFY).toBe('/app/settings/shopify');
    expect(url).not.toContain('/app/settings?');
  });

  it('accoda i parametri del rifiuto, codificati', () => {
    const url = indirizzoRitornoShopify(frontend, 'shop_change_blocked', {
      from: 'vecchio.myshopify.com',
      to: 'nuovo&strano.myshopify.com',
    });

    expect(url).toBe(
      'http://localhost:4212/app/settings/shopify?shopify=shop_change_blocked' +
        '&from=vecchio.myshopify.com&to=nuovo%26strano.myshopify.com',
    );
  });
});
