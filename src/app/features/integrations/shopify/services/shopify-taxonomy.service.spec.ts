import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { APP_CONFIG } from '@core/config/app-config.token';

import { ShopifyTaxonomyService } from './shopify-taxonomy.service';

const API_BASE = 'http://localhost:3000/api/v1';

describe('ShopifyTaxonomyService (HTTP)', () => {
  let service: ShopifyTaxonomyService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ShopifyTaxonomyService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: API_BASE } },
      ],
    });
    service = TestBed.inject(ShopifyTaxonomyService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('listCategories passa search e childrenOf come query params', async () => {
    const promise = firstValueFrom(
      service.listCategories({ search: 'maglietta', childrenOf: 'gid://cat/1' }),
    );

    const req = httpMock.expectOne(
      (r) =>
        r.url === `${API_BASE}/shopify/taxonomy/categories` &&
        r.params.get('search') === 'maglietta' &&
        r.params.get('childrenOf') === 'gid://cat/1',
    );
    req.flush({
      items: [
        { id: 'gid://cat/2', name: 'T-Shirts', fullName: 'Apparel > T-Shirts', isLeaf: true },
      ],
    });

    const result = await promise;
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('T-Shirts');
  });

  it('listCategoryAttributes richiede categoryId', async () => {
    const promise = firstValueFrom(service.listCategoryAttributes('gid://cat/2'));

    const req = httpMock.expectOne(
      (r) =>
        r.url === `${API_BASE}/shopify/taxonomy/category-attributes` &&
        r.params.get('categoryId') === 'gid://cat/2',
    );
    req.flush({
      items: [
        {
          id: 'attr-1',
          name: 'Color',
          namespace: 'shopify',
          key: 'color',
          metafieldType: 'list.metaobject_reference',
          values: [{ id: 'v1', name: 'Red' }],
        },
      ],
    });

    expect((await promise)[0]?.key).toBe('color');
  });
});
