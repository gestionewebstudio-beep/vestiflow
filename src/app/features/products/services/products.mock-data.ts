import type { EntityId, IsoDateString, Money } from '@core/models/common.model';
import type { ProductVariant } from '@core/models/product-variant.model';
import { ProductStatus } from '@core/models/product.model';
import type { Product, ProductOption } from '@core/models/product.model';

import { OPTION_NAME_COLOR, OPTION_NAME_SIZE } from '../models/product-form.model';

const TENANT_ID: EntityId = 'tenant-demo';
const CREATED_AT: IsoDateString = '2025-09-01T08:00:00.000Z';

interface ProductSeed {
  readonly id: string;
  readonly name: string;
  readonly brand: string;
  readonly category: string;
  readonly season: string;
  readonly status: ProductStatus;
  readonly sizes: readonly string[];
  readonly colors: readonly string[];
  readonly price: Money;
  readonly updatedAt: IsoDateString;
}

const APPAREL_SIZES = ['XS', 'S', 'M', 'L', 'XL'] as const;
const SHOE_SIZES = ['39', '40', '41', '42', '43', '44'] as const;

// Seed compatti: il dataset finale (Product + varianti) viene derivato sotto.
const SEEDS: readonly ProductSeed[] = [
  // prettier-ignore
  { id: 'tee-basic', name: 'T-shirt Basic', brand: 'VF Basics', category: 'Magliette', season: 'Continuativo', status: ProductStatus.Active, sizes: APPAREL_SIZES, colors: ['Bianco', 'Nero', 'Blu'], price: 19.9, updatedAt: '2026-05-20T10:00:00.000Z' },
  {
    id: 'tee-stripe',
    name: 'T-shirt Righe',
    brand: 'Maremoto',
    category: 'Magliette',
    season: 'SS26',
    status: ProductStatus.Active,
    sizes: APPAREL_SIZES,
    colors: ['Blu', 'Rosso'],
    price: 24.9,
    updatedAt: '2026-05-18T10:00:00.000Z',
  },
  {
    id: 'polo-pique',
    name: 'Polo Piqué',
    brand: 'Nord',
    category: 'Magliette',
    season: 'SS26',
    status: ProductStatus.Active,
    sizes: APPAREL_SIZES,
    colors: ['Bianco', 'Verde', 'Navy'],
    price: 39.9,
    updatedAt: '2026-05-12T10:00:00.000Z',
  },
  {
    id: 'shirt-oxford',
    name: 'Camicia Oxford',
    brand: 'Nord',
    category: 'Camicie',
    season: 'FW25',
    status: ProductStatus.Active,
    sizes: APPAREL_SIZES,
    colors: ['Azzurro', 'Bianco'],
    price: 59.9,
    updatedAt: '2026-04-30T10:00:00.000Z',
  },
  {
    id: 'shirt-flanella',
    name: 'Camicia Flanella',
    brand: 'Bosco',
    category: 'Camicie',
    season: 'FW25',
    status: ProductStatus.Archived,
    sizes: APPAREL_SIZES,
    colors: ['Rosso', 'Verde'],
    price: 64.9,
    updatedAt: '2026-02-10T10:00:00.000Z',
  },
  {
    id: 'jeans-slim',
    name: 'Jeans Slim',
    brand: 'Denim Co',
    category: 'Pantaloni',
    season: 'Continuativo',
    status: ProductStatus.Active,
    sizes: APPAREL_SIZES,
    colors: ['Blu', 'Nero'],
    price: 79.9,
    updatedAt: '2026-05-22T10:00:00.000Z',
  },
  {
    id: 'chino-cotone',
    name: 'Chino Cotone',
    brand: 'Nord',
    category: 'Pantaloni',
    season: 'SS26',
    status: ProductStatus.Active,
    sizes: APPAREL_SIZES,
    colors: ['Beige', 'Navy', 'Verde'],
    price: 69.9,
    updatedAt: '2026-05-15T10:00:00.000Z',
  },
  {
    id: 'pant-cargo',
    name: 'Pantalone Cargo',
    brand: 'Bosco',
    category: 'Pantaloni',
    season: 'FW25',
    status: ProductStatus.Draft,
    sizes: APPAREL_SIZES,
    colors: ['Verde', 'Sabbia'],
    price: 74.9,
    updatedAt: '2026-05-25T10:00:00.000Z',
  },
  {
    id: 'hoodie-felpa',
    name: 'Felpa con Cappuccio',
    brand: 'VF Basics',
    category: 'Felpe',
    season: 'FW25',
    status: ProductStatus.Active,
    sizes: APPAREL_SIZES,
    colors: ['Grigio', 'Nero', 'Blu'],
    price: 54.9,
    updatedAt: '2026-05-10T10:00:00.000Z',
  },
  {
    id: 'crew-felpa',
    name: 'Felpa Girocollo',
    brand: 'Maremoto',
    category: 'Felpe',
    season: 'FW25',
    status: ProductStatus.Active,
    sizes: APPAREL_SIZES,
    colors: ['Bordeaux', 'Grigio'],
    price: 49.9,
    updatedAt: '2026-03-28T10:00:00.000Z',
  },
  {
    id: 'jacket-bomber',
    name: 'Giubbotto Bomber',
    brand: 'Nord',
    category: 'Giacche',
    season: 'FW25',
    status: ProductStatus.Active,
    sizes: APPAREL_SIZES,
    colors: ['Nero', 'Verde'],
    price: 129.9,
    updatedAt: '2026-04-05T10:00:00.000Z',
  },
  {
    id: 'jacket-denim',
    name: 'Giacca di Jeans',
    brand: 'Denim Co',
    category: 'Giacche',
    season: 'SS26',
    status: ProductStatus.Active,
    sizes: APPAREL_SIZES,
    colors: ['Blu'],
    price: 99.9,
    updatedAt: '2026-05-19T10:00:00.000Z',
  },
  {
    id: 'coat-parka',
    name: 'Parka Invernale',
    brand: 'Bosco',
    category: 'Giacche',
    season: 'FW25',
    status: ProductStatus.Draft,
    sizes: APPAREL_SIZES,
    colors: ['Verde', 'Navy'],
    price: 189.9,
    updatedAt: '2026-05-26T10:00:00.000Z',
  },
  {
    id: 'sneaker-run',
    name: 'Sneaker Running',
    brand: 'Passo',
    category: 'Scarpe',
    season: 'SS26',
    status: ProductStatus.Active,
    sizes: SHOE_SIZES,
    colors: ['Bianco', 'Nero'],
    price: 89.9,
    updatedAt: '2026-05-21T10:00:00.000Z',
  },
  {
    id: 'sneaker-low',
    name: 'Sneaker Low',
    brand: 'Passo',
    category: 'Scarpe',
    season: 'Continuativo',
    status: ProductStatus.Active,
    sizes: SHOE_SIZES,
    colors: ['Bianco', 'Grigio', 'Nero'],
    price: 79.9,
    updatedAt: '2026-05-08T10:00:00.000Z',
  },
  {
    id: 'boot-chelsea',
    name: 'Stivaletto Chelsea',
    brand: 'Cuoio',
    category: 'Scarpe',
    season: 'FW25',
    status: ProductStatus.Archived,
    sizes: SHOE_SIZES,
    colors: ['Marrone', 'Nero'],
    price: 139.9,
    updatedAt: '2026-01-15T10:00:00.000Z',
  },
  {
    id: 'belt-cuoio',
    name: 'Cintura in Cuoio',
    brand: 'Cuoio',
    category: 'Accessori',
    season: 'Continuativo',
    status: ProductStatus.Active,
    sizes: ['90', '95', '100'],
    colors: ['Marrone', 'Nero'],
    price: 34.9,
    updatedAt: '2026-04-18T10:00:00.000Z',
  },
  {
    id: 'cap-logo',
    name: 'Cappellino Logo',
    brand: 'VF Basics',
    category: 'Accessori',
    season: 'SS26',
    status: ProductStatus.Active,
    sizes: ['Unica'],
    colors: ['Nero', 'Bianco', 'Navy'],
    price: 22.9,
    updatedAt: '2026-05-02T10:00:00.000Z',
  },
  {
    id: 'scarf-lana',
    name: 'Sciarpa in Lana',
    brand: 'Bosco',
    category: 'Accessori',
    season: 'FW25',
    status: ProductStatus.Active,
    sizes: ['Unica'],
    colors: ['Grigio', 'Bordeaux', 'Navy'],
    price: 29.9,
    updatedAt: '2026-03-10T10:00:00.000Z',
  },
  {
    id: 'short-mare',
    name: 'Costume Boxer',
    brand: 'Maremoto',
    category: 'Mare',
    season: 'SS26',
    status: ProductStatus.Active,
    sizes: APPAREL_SIZES,
    colors: ['Blu', 'Rosso', 'Verde'],
    price: 27.9,
    updatedAt: '2026-05-23T10:00:00.000Z',
  },
];

function colorCode(color: string): string {
  return color.slice(0, 3).toUpperCase();
}

function buildOptions(seed: ProductSeed): readonly ProductOption[] {
  return [
    { name: OPTION_NAME_SIZE, values: seed.sizes },
    { name: OPTION_NAME_COLOR, values: seed.colors },
  ];
}

function buildVariants(seed: ProductSeed): readonly ProductVariant[] {
  const variants: ProductVariant[] = [];
  for (const size of seed.sizes) {
    for (const color of seed.colors) {
      variants.push({
        id: `${seed.id}-${size}-${colorCode(color)}`.toLowerCase(),
        productId: seed.id,
        sku: `${seed.id.toUpperCase()}-${size}-${colorCode(color)}`,
        optionValues: [
          { name: OPTION_NAME_SIZE, value: size },
          { name: OPTION_NAME_COLOR, value: color },
        ],
        sellingPrice: seed.price,
      });
    }
  }
  return variants;
}

function buildProduct(seed: ProductSeed): Product {
  return {
    id: seed.id,
    tenantId: TENANT_ID,
    name: seed.name,
    brand: seed.brand,
    category: seed.category,
    season: seed.season,
    status: seed.status,
    options: buildOptions(seed),
    createdAt: CREATED_AT,
    updatedAt: seed.updatedAt,
  };
}

/** Catalogo prodotti mock (tenant-aware). */
export const MOCK_PRODUCTS: readonly Product[] = SEEDS.map(buildProduct);

/** Varianti mock (flat); il service filtra per productId. */
export const MOCK_PRODUCT_VARIANTS: readonly ProductVariant[] = SEEDS.flatMap(buildVariants);
