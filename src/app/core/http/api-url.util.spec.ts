import { describe, expect, it } from 'vitest';

import { isApiRequest } from './api-url.util';

const API_BASE = 'http://localhost:3000/api/v1';

function mockDocument(origin: string): Document {
  return {
    defaultView: {
      location: { href: `${origin}/app/dashboard` },
    },
  } as Document;
}

describe('isApiRequest', () => {
  it('ritorna true per URL sulla stessa origine dell API', () => {
    const doc = mockDocument('http://localhost:3000');
    expect(isApiRequest(`${API_BASE}/products`, API_BASE, doc)).toBe(true);
    expect(isApiRequest('/api/v1/customers', API_BASE, doc)).toBe(true);
  });

  it('ritorna false per origini diverse', () => {
    const doc = mockDocument('http://localhost:4200');
    expect(isApiRequest('http://localhost:3000/api/v1/products', API_BASE, doc)).toBe(true);
    expect(isApiRequest('https://cdn.example.com/assets/logo.png', API_BASE, doc)).toBe(false);
  });

  it('usa apiBaseUrl come base se defaultView assente', () => {
    const doc = { defaultView: null } as unknown as Document;
    expect(isApiRequest('/api/v1/health', API_BASE, doc)).toBe(true);
  });

  it('confronta origine anche con path relativi', () => {
    const doc = mockDocument('http://localhost:4200');
    expect(isApiRequest('/api/v1/products', 'http://localhost:3000/api/v1', doc)).toBe(false);
  });
});
