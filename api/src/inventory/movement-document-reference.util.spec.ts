import { DocumentType } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  collectDocumentLookupIds,
  collectOnlineSaleLookupIds,
  isUuid,
  resolveMovementDocumentReference,
} from './movement-document-reference.util';

const DOC_ID = '11111111-1111-4111-8111-111111111111';
const SALE_ID = '22222222-2222-4222-8222-222222222222';

describe('movement-document-reference.util', () => {
  it('isUuid accetta solo UUID v4/v5', () => {
    expect(isUuid(DOC_ID)).toBe(true);
    expect(isUuid('gid://shopify/Order/1')).toBe(false);
    expect(isUuid('inventory-count:session:line')).toBe(false);
  });

  it('collectDocumentLookupIds esclude GID Shopify e vendite online', () => {
    const ids = collectDocumentLookupIds([
      {
        externalRef: 'gid://shopify/Order/99',
        sourceDocumentId: SALE_ID,
        sourceDocumentType: DocumentType.online_sale,
      },
      {
        externalRef: DOC_ID,
        sourceDocumentId: null,
        sourceDocumentType: null,
      },
    ]);

    expect(ids).toEqual([DOC_ID]);
  });

  it('collectOnlineSaleLookupIds raccoglie solo vendite online', () => {
    const ids = collectOnlineSaleLookupIds([
      {
        externalRef: 'gid://shopify/Order/1',
        sourceDocumentId: SALE_ID,
        sourceDocumentType: DocumentType.online_sale,
      },
      {
        externalRef: DOC_ID,
        sourceDocumentId: DOC_ID,
        sourceDocumentType: DocumentType.sales_ddt,
      },
    ]);

    expect(ids).toEqual([SALE_ID]);
  });

  it('resolveMovementDocumentReference usa riferimento vendita online', () => {
    const ref = resolveMovementDocumentReference(
      {
        externalRef: 'gid://shopify/Order/1',
        sourceDocumentId: SALE_ID,
        sourceDocumentType: DocumentType.online_sale,
      },
      new Map(),
      new Map([[SALE_ID, 'VO-2026/00042']]),
    );

    expect(ref).toBe('VO-2026/00042');
  });

  it('resolveMovementDocumentReference fa fallback su externalRef testuale', () => {
    const ref = resolveMovementDocumentReference(
      {
        externalRef: 'inventory-count:abc:line-1',
        sourceDocumentId: null,
        sourceDocumentType: null,
      },
      new Map(),
      new Map(),
    );

    expect(ref).toBe('inventory-count:abc:line-1');
  });
});
