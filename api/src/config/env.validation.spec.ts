import 'reflect-metadata';
import { describe, expect, it } from 'vitest';

import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  it('accetta configurazione minima valida', () => {
    const env = validateEnv({
      PORT: 3000,
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/vestiflow',
      CORS_ORIGINS: 'http://localhost:4200',
    });

    expect(env.PORT).toBe(3000);
    expect(env.DATABASE_URL).toBe('postgresql://user:pass@localhost:5432/vestiflow');
  });

  it('fallisce se DATABASE_URL mancante', () => {
    expect(() =>
      validateEnv({
        PORT: '3000',
        CORS_ORIGINS: 'http://localhost:4200',
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it('fallisce se PORT fuori range', () => {
    expect(() =>
      validateEnv({
        PORT: '70000',
        DATABASE_URL: 'postgresql://localhost/db',
      }),
    ).toThrow(/PORT/);
  });

  it('accetta variabili Shopify opzionali', () => {
    const env = validateEnv({
      PORT: 3000,
      DATABASE_URL: 'postgresql://localhost/db',
      SHOPIFY_API_KEY: 'key',
      SHOPIFY_SCOPES: 'read_products,write_products',
      SUPABASE_URL: 'http://localhost:54321',
    });

    expect(env.SHOPIFY_API_KEY).toBe('key');
    expect(env.SHOPIFY_SCOPES).toBe('read_products,write_products');
  });
});
