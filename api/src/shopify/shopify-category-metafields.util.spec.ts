import { describe, expect, it } from 'vitest';

import {
  buildCategoryMetaobjectFieldsPayload,
  categoryMetafieldsSyncErrorMessage,
  countCategoryMetafieldsWithValues,
  matchCategoryAttributeToMetafieldTemplate,
  orderCategoryMetafieldsForPush,
  pickMetaobjectTaxonomyFieldKey,
  pickPreferredTaxonomyValueId,
  qualifyMetaobjectReferenceMetafieldType,
  reconcileCategoryMetafieldsWithAttributes,
  resolveSecondaryTaxonomyGidForMetaobjectField,
  searchTaxonomyValuesInCategoryAttributes,
  serializeMetaobjectTaxonomyReferenceValue,
} from './shopify-category-metafields.util';

describe('serializeMetaobjectTaxonomyReferenceValue', () => {
  it('serializza liste taxonomy come JSON array', () => {
    expect(
      serializeMetaobjectTaxonomyReferenceValue(
        'list.product_taxonomy_value_reference',
        'gid://shopify/TaxonomyValue/1',
      ),
    ).toBe('["gid://shopify/TaxonomyValue/1"]');
  });

  it('serializza riferimenti singoli come GID plain', () => {
    expect(
      serializeMetaobjectTaxonomyReferenceValue(
        'product_taxonomy_value_reference',
        'gid://shopify/TaxonomyValue/2874',
      ),
    ).toBe('gid://shopify/TaxonomyValue/2874');
  });
});

describe('buildCategoryMetaobjectFieldsPayload', () => {
  it('compila label e campi taxonomy primari/secondari', () => {
    const payload = buildCategoryMetaobjectFieldsPayload(
      [
        { key: 'color_taxonomy_reference', typeName: 'list.product_taxonomy_value_reference' },
        {
          key: 'pattern_taxonomy_reference',
          typeName: 'product_taxonomy_value_reference',
          required: true,
        },
        { key: 'label', typeName: 'single_line_text_field' },
      ],
      'color_taxonomy_reference',
      { id: 'gid://shopify/TaxonomyValue/10', name: 'Brown' },
      new Map([['pattern_taxonomy_reference', 'gid://shopify/TaxonomyValue/2874']]),
    );

    expect(payload).toEqual([
      {
        key: 'color_taxonomy_reference',
        value: '["gid://shopify/TaxonomyValue/10"]',
      },
      {
        key: 'pattern_taxonomy_reference',
        value: 'gid://shopify/TaxonomyValue/2874',
      },
      { key: 'label', value: 'Brown' },
    ]);
  });
});

describe('matchCategoryAttributeToMetafieldTemplate', () => {
  it('abbina attributo e template per nome', () => {
    expect(
      matchCategoryAttributeToMetafieldTemplate('Fabric', [
        {
          id: 'gid://shopify/StandardMetafieldDefinitionTemplate/1',
          name: 'Fabric',
          namespace: 'shopify',
          key: 'fabric',
          typeName: 'list.product_taxonomy_value_reference',
        },
      ]),
    ).toMatchObject({ key: 'fabric' });
  });

  it('ignora template fuori namespace shopify', () => {
    expect(
      matchCategoryAttributeToMetafieldTemplate('Fabric', [
        {
          id: 'gid://shopify/StandardMetafieldDefinitionTemplate/1',
          name: 'Fabric',
          namespace: 'custom',
          key: 'fabric',
          typeName: 'single_line_text_field',
        },
      ]),
    ).toBeNull();
  });
});

describe('reconcileCategoryMetafieldsWithAttributes', () => {
  it('corregge namespace/key/type dal mapping categoria aggiornato', () => {
    expect(
      reconcileCategoryMetafieldsWithAttributes(
        [
          {
            attributeId: 'gid://shopify/TaxonomyAttribute/10',
            attributeName: 'Tessuto',
            namespace: 'shopify',
            key: 'small-animal-dietary-requirements',
            metafieldType: 'list.metaobject_reference',
            values: [{ id: 'gid://shopify/TaxonomyValue/1', name: 'Bamboo' }],
          },
        ],
        [
          {
            id: 'gid://shopify/TaxonomyAttribute/10',
            name: 'Fabric',
            namespace: 'shopify',
            key: 'fabric',
            metafieldType: 'list.product_taxonomy_value_reference',
          },
        ],
      ),
    ).toEqual([
      {
        attributeId: 'gid://shopify/TaxonomyAttribute/10',
        attributeName: 'Fabric',
        namespace: 'shopify',
        key: 'fabric',
        metafieldType: 'list.product_taxonomy_value_reference',
        values: [{ id: 'gid://shopify/TaxonomyValue/1', name: 'Bamboo' }],
      },
    ]);
  });
});

describe('searchTaxonomyValuesInCategoryAttributes', () => {
  it('trova valori taxonomy per termine negli attributi categoria', () => {
    expect(
      searchTaxonomyValuesInCategoryAttributes(
        [
          {
            key: 'pattern',
            name: 'Pattern',
            values: [
              { id: 'gid://shopify/TaxonomyValue/1', name: 'Striped' },
              { id: 'gid://shopify/TaxonomyValue/2', name: 'Solid' },
            ],
          },
        ],
        ['solid'],
      ),
    ).toEqual([{ id: 'gid://shopify/TaxonomyValue/2', name: 'Solid' }]);
  });
});

describe('pickPreferredTaxonomyValueId', () => {
  it('preferisce valori solid/plain', () => {
    expect(
      pickPreferredTaxonomyValueId([
        { id: 'gid://shopify/TaxonomyValue/1', name: 'Striped' },
        { id: 'gid://shopify/TaxonomyValue/2', name: 'Solid' },
      ]),
    ).toBe('gid://shopify/TaxonomyValue/2');
  });
});

describe('resolveSecondaryTaxonomyGidForMetaobjectField', () => {
  it('risolve pattern da attributi categoria', () => {
    expect(
      resolveSecondaryTaxonomyGidForMetaobjectField('pattern_taxonomy_reference', [
        {
          key: 'pattern',
          name: 'Pattern',
          values: [{ id: 'gid://shopify/TaxonomyValue/99', name: 'Solid' }],
        },
      ]),
    ).toBe('gid://shopify/TaxonomyValue/99');
  });
});

describe('countCategoryMetafieldsWithValues', () => {
  it('conta solo attributi con valori selezionati', () => {
    expect(
      countCategoryMetafieldsWithValues([
        {
          attributeId: 'a1',
          attributeName: 'Color',
          namespace: 'shopify',
          key: 'color-pattern',
          metafieldType: 'list.metaobject_reference',
          values: [{ id: 'gid://shopify/TaxonomyValue/1', name: 'Blue' }],
        },
        {
          attributeId: 'a2',
          attributeName: 'Age',
          namespace: 'shopify',
          key: 'age-group',
          metafieldType: 'list.product_taxonomy_value_reference',
          values: [],
        },
      ]),
    ).toBe(1);
  });
});

describe('orderCategoryMetafieldsForPush', () => {
  it('invia color-pattern per ultimo', () => {
    const ordered = orderCategoryMetafieldsForPush([
      {
        key: 'color-pattern',
        values: [{ id: 'gid://shopify/TaxonomyValue/1' }],
      },
      {
        key: 'fabric',
        values: [{ id: 'gid://shopify/TaxonomyValue/2' }],
      },
    ]);
    expect(ordered.map((field) => field.key)).toEqual(['fabric', 'color-pattern']);
  });
});

describe('pickMetaobjectTaxonomyFieldKey', () => {
  it('usa color_taxonomy_reference per metafield color-pattern', () => {
    expect(
      pickMetaobjectTaxonomyFieldKey('color-pattern', 'Color', [
        { key: 'pattern_taxonomy_reference', typeName: 'product_taxonomy_value_reference' },
        { key: 'color_taxonomy_reference', typeName: 'list.product_taxonomy_value_reference' },
      ]),
    ).toBe('color_taxonomy_reference');
  });
});

describe('qualifyMetaobjectReferenceMetafieldType', () => {
  it('qualifica list.metaobject_reference con shopify--color-pattern', () => {
    expect(
      qualifyMetaobjectReferenceMetafieldType(
        'list.metaobject_reference',
        'shopify--color-pattern',
      ),
    ).toBe('list.metaobject_reference<shopify--color-pattern>');
  });
});

describe('categoryMetafieldsSyncErrorMessage', () => {
  it('segnala mismatch locale/remoto', () => {
    expect(categoryMetafieldsSyncErrorMessage(2, 0, null)).toContain('assenti su Shopify');
  });

  it('non segnala errore quando Shopify ha attributi', () => {
    expect(categoryMetafieldsSyncErrorMessage(2, 2, null)).toBeNull();
  });
});
