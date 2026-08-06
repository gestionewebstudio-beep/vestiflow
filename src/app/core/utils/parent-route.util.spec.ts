import { describe, expect, it } from 'vitest';

import { parentRoute } from './parent-route.util';

const ORDER_ID = '3f1c8a2e-9b47-4d51-8c6a-2f0e7b9d1a55';

describe('parentRoute', () => {
  it('risale al registro da un documento in modifica', () => {
    expect(parentRoute(`/app/sales/${ORDER_ID}/edit`)).toBe('/app/sales');
    expect(parentRoute(`/app/sales/${ORDER_ID}`)).toBe('/app/sales');
  });

  it('si ferma alla sezione del tipo documento', () => {
    expect(parentRoute(`/app/documents/quote/${ORDER_ID}/edit`)).toBe('/app/documents/quote');
    expect(parentRoute(`/app/documents/${ORDER_ID}/edit`)).toBe('/app/documents');
  });

  it('gestisce le pagine «nuovo»', () => {
    expect(parentRoute('/app/sales/new')).toBe('/app/sales');
    expect(parentRoute('/app/documents/quote/new')).toBe('/app/documents/quote');
  });

  it('ignora query string e frammento', () => {
    expect(parentRoute(`/app/sales/${ORDER_ID}/edit?tab=righe#note`)).toBe('/app/sales');
  });

  it('da una pagina di elenco risale alla sezione superiore', () => {
    expect(parentRoute('/app/documents/arrivi-merce')).toBe('/app/documents');
  });

  it('non esce dall’app né sale oltre la radice', () => {
    expect(parentRoute('/app/dashboard')).toBeNull();
    expect(parentRoute('/app')).toBeNull();
    expect(parentRoute('/login')).toBeNull();
  });
});
