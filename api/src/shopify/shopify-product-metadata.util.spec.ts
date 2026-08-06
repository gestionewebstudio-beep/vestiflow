import { describe, expect, it } from 'vitest';

import {
  extractSeasonFromMetafields,
  extractSeoFromMetafields,
  formatShopifyTags,
  mapMetafieldRows,
  parseShopifyTags,
} from './shopify-product-metadata.util';
import {
  VESTIFLOW_METAFIELD_NAMESPACE,
  VESTIFLOW_SEASON_METAFIELD_KEY,
} from './shopify-product-metadata.types';

describe('shopify-product-metadata.util', () => {
  describe('parseShopifyTags e formatShopifyTags', () => {
    it('parsa e formatta tag separati da virgola', () => {
      expect(parseShopifyTags(' estate , cotone, estate ')).toEqual(['estate', 'cotone', 'estate']);
      expect(formatShopifyTags(['primavera', 'lana'])).toBe('primavera, lana');
    });

    it('ritorna array vuoto per input vuoto', () => {
      expect(parseShopifyTags('')).toEqual([]);
      expect(parseShopifyTags(null)).toEqual([]);
    });
  });

  describe('extractSeoFromMetafields', () => {
    it('estrae title_tag e description_tag globali', () => {
      const seo = extractSeoFromMetafields([
        { namespace: 'global', key: 'title_tag', value: 'Titolo SEO' },
        { namespace: 'global', key: 'description_tag', value: 'Desc SEO' },
      ]);
      expect(seo).toEqual({ seoTitle: 'Titolo SEO', seoDescription: 'Desc SEO' });
    });
  });

  describe('extractSeasonFromMetafields', () => {
    it('estrae stagione dal namespace VestiFlow', () => {
      const season = extractSeasonFromMetafields([
        {
          namespace: VESTIFLOW_METAFIELD_NAMESPACE,
          key: VESTIFLOW_SEASON_METAFIELD_KEY,
          value: '  FW26  ',
        },
      ]);
      expect(season).toBe('FW26');
    });

    it('ritorna null se assente', () => {
      expect(extractSeasonFromMetafields([])).toBeNull();
    });
  });

  describe('mapMetafieldRows', () => {
    it('mappa righe metafield preservando type opzionale', () => {
      expect(
        mapMetafieldRows([
          { namespace: 'custom', key: 'material', value: 'lana', type: 'single_line_text_field' },
        ]),
      ).toEqual([
        { namespace: 'custom', key: 'material', value: 'lana', type: 'single_line_text_field' },
      ]);
    });
  });
});
