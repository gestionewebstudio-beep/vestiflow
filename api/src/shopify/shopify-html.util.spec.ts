import { describe, expect, it } from 'vitest';

import {
  normalizeProductDescription,
  plainTextToShopifyBodyHtml,
  shopifyBodyHtmlToPlainText,
} from './shopify-html.util';

describe('shopifyBodyHtmlToPlainText', () => {
  it('rimuove tag e mantiene paragrafi', () => {
    expect(shopifyBodyHtmlToPlainText('<p>Ciao <strong>mondo</strong></p>')).toBe('Ciao mondo');
  });

  it('gestisce br e entità', () => {
    expect(shopifyBodyHtmlToPlainText('<p>Riga 1<br>Riga 2</p>&nbsp;')).toBe('Riga 1\nRiga 2');
  });
});

describe('plainTextToShopifyBodyHtml', () => {
  it('genera paragrafi HTML sicuri', () => {
    expect(plainTextToShopifyBodyHtml('Titolo\nRiga')).toBe('<p>Titolo<br>Riga</p>');
  });
});

describe('normalizeProductDescription', () => {
  it('lascia invariato testo già piano', () => {
    expect(normalizeProductDescription('Descrizione semplice')).toBe('Descrizione semplice');
  });

  it('converte HTML legacy', () => {
    expect(normalizeProductDescription('<p>Maglietta <em>soft</em></p>')).toBe('Maglietta soft');
  });
});
