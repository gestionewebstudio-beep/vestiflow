import { Injectable, Logger } from '@nestjs/common';

import { parseCategoryMetafieldsJson } from './shopify-category-metafields.util';
import type {
  ShopifyTaxonomyCategory,
  ShopifyTaxonomyCategoryAttribute,
} from './shopify-graphql.client';
import {
  buildTaxonomyParentFullNames,
  searchLocalizedTaxonomyCategories,
  toLocalizedTaxonomyCategoryEntry,
  type LocalizedTaxonomyCategoryEntry,
} from './shopify-taxonomy-search.util';

const TAXONOMY_DIST_BASE =
  'https://raw.githubusercontent.com/Shopify/product-taxonomy/main/dist/it';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface LocalizedCategory extends LocalizedTaxonomyCategoryEntry {}

@Injectable()
export class ShopifyTaxonomyLocalizationService {
  private readonly logger = new Logger(ShopifyTaxonomyLocalizationService.name);

  private categoriesLoadedAt = 0;
  private categoriesByGid = new Map<string, LocalizedCategory>();

  private attributesLoadedAt = 0;
  private attributesByGid = new Map<string, string>();

  async localizeCategory(
    category: ShopifyTaxonomyCategory | null,
  ): Promise<ShopifyTaxonomyCategory | null> {
    if (!category) {
      return null;
    }
    await this.ensureCategoriesLoaded();
    const localized = this.categoriesByGid.get(category.id);
    if (!localized) {
      return category;
    }
    return {
      ...category,
      name: localized.name,
      fullName: localized.fullName,
      isLeaf: localized.isLeaf,
    };
  }

  async searchCategories(query: string, limit = 50): Promise<readonly ShopifyTaxonomyCategory[]> {
    await this.ensureCategoriesLoaded();
    return searchLocalizedTaxonomyCategories(this.categoriesByGid, query, limit);
  }

  async localizeCategories(
    categories: readonly ShopifyTaxonomyCategory[],
  ): Promise<readonly ShopifyTaxonomyCategory[]> {
    await this.ensureCategoriesLoaded();
    return categories.map((category) => {
      const localized = this.categoriesByGid.get(category.id);
      if (!localized) {
        return category;
      }
      return {
        ...category,
        name: localized.name,
        fullName: localized.fullName,
        isLeaf: localized.isLeaf,
      };
    });
  }

  async localizeCategoryAttributes(
    attributes: readonly ShopifyTaxonomyCategoryAttribute[],
  ): Promise<readonly ShopifyTaxonomyCategoryAttribute[]> {
    await this.ensureAttributesLoaded();
    return attributes.map((attribute) => ({
      ...attribute,
      name: this.attributesByGid.get(attribute.id) ?? attribute.name,
    }));
  }

  async prepareCategories(): Promise<void> {
    await this.ensureCategoriesLoaded();
  }

  async prepareAttributes(): Promise<void> {
    await this.ensureAttributesLoaded();
  }

  async prepareProductLocalization(): Promise<void> {
    await Promise.all([this.ensureCategoriesLoaded(), this.ensureAttributesLoaded()]);
  }

  localizeProductTaxonomySync<
    T extends {
      shopifyTaxonomyCategoryId?: string | null;
      shopifyTaxonomyCategoryFullName?: string | null;
    },
  >(product: T): T {
    const categoryId = product.shopifyTaxonomyCategoryId?.trim();
    if (!categoryId) {
      return product;
    }
    const localized = this.categoriesByGid.get(categoryId);
    if (!localized) {
      return product;
    }
    return {
      ...product,
      shopifyTaxonomyCategoryFullName: localized.fullName,
    };
  }

  /** Nomi attributi categoria in italiano; i valori taxonomy restano quelli Shopify (EN). */
  localizeProductCategoryMetafieldsSync<
    T extends { shopifyCategoryMetafields?: unknown },
  >(product: T): T {
    const fields = parseCategoryMetafieldsJson(product.shopifyCategoryMetafields);
    if (fields.length === 0 || this.attributesByGid.size === 0) {
      return product;
    }

    const localized = fields.map((field) => ({
      ...field,
      attributeName: this.attributesByGid.get(field.attributeId) ?? field.attributeName,
    }));

    return {
      ...product,
      shopifyCategoryMetafields: localized,
    };
  }

  localizeProductForResponseSync<
    T extends {
      shopifyTaxonomyCategoryId?: string | null;
      shopifyTaxonomyCategoryFullName?: string | null;
      shopifyCategoryMetafields?: unknown;
    },
  >(product: T): T {
    return this.localizeProductCategoryMetafieldsSync(
      this.localizeProductTaxonomySync(product),
    );
  }

  private async ensureCategoriesLoaded(): Promise<void> {
    if (this.isFresh(this.categoriesLoadedAt) && this.categoriesByGid.size > 0) {
      return;
    }
    const text = await this.fetchDistFile('categories.txt');
    const parsedLines: { readonly gid: string; readonly label: string }[] = [];
    for (const line of text.split('\n')) {
      const parsed = parseDistLine(line);
      if (!parsed) {
        continue;
      }
      parsedLines.push(parsed);
    }

    const parentFullNames = buildTaxonomyParentFullNames(parsedLines.map((entry) => entry.label));
    const map = new Map<string, LocalizedCategory>();
    for (const parsed of parsedLines) {
      map.set(parsed.gid, toLocalizedTaxonomyCategoryEntry(parsed.label, parentFullNames));
    }
    this.categoriesByGid = map;
    this.categoriesLoadedAt = Date.now();
    this.logger.log(`Taxonomy categorie IT caricate (${map.size})`);
  }

  private async ensureAttributesLoaded(): Promise<void> {
    if (this.isFresh(this.attributesLoadedAt) && this.attributesByGid.size > 0) {
      return;
    }
    const text = await this.fetchDistFile('attributes.txt');
    const map = new Map<string, string>();
    for (const line of text.split('\n')) {
      const parsed = parseDistLine(line);
      if (!parsed) {
        continue;
      }
      map.set(parsed.gid, parsed.label);
    }
    this.attributesByGid = map;
    this.attributesLoadedAt = Date.now();
    this.logger.log(`Taxonomy attributi IT caricati (${map.size})`);
  }

  private isFresh(loadedAt: number): boolean {
    return loadedAt > 0 && Date.now() - loadedAt < CACHE_TTL_MS;
  }

  private async fetchDistFile(fileName: string): Promise<string> {
    const url = `${TAXONOMY_DIST_BASE}/${fileName}`;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.text();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Download fallito';
      this.logger.warn(`Taxonomy IT non disponibile (${fileName}): ${message}`);
      return '';
    }
  }
}

function parseDistLine(line: string): { gid: string; label: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }
  const separatorIndex = trimmed.indexOf(' : ');
  if (separatorIndex <= 0) {
    return null;
  }
  return {
    gid: trimmed.slice(0, separatorIndex).trim(),
    label: trimmed.slice(separatorIndex + 3).trim(),
  };
}
