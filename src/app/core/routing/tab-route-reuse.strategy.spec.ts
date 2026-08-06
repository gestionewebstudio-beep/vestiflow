import { Component, OnDestroy } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, RouteReuseStrategy } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TabRouteReuseStrategy } from './tab-route-reuse.strategy';

// Traccia creazioni e distruzioni: il reuse si osserva da qui, non dai membri
// privati della strategy.
let events: string[] = [];

@Component({ template: 'lista prodotti' })
class ProductListStubComponent implements OnDestroy {
  constructor() {
    events.push('list:new');
  }
  ngOnDestroy(): void {
    events.push('list:destroy');
  }
}

@Component({ template: 'dettaglio prodotto' })
class ProductDetailStubComponent {}

@Component({ template: 'lista ordini' })
class OrderListStubComponent implements OnDestroy {
  constructor() {
    events.push('orders:new');
  }
  ngOnDestroy(): void {
    events.push('orders:destroy');
  }
}

@Component({ template: 'login' })
class LoginStubComponent {}

describe('TabRouteReuseStrategy', () => {
  let harness: RouterTestingHarness;
  let strategy: TabRouteReuseStrategy;

  beforeEach(async () => {
    events = [];
    TestBed.configureTestingModule({
      providers: [
        TabRouteReuseStrategy,
        { provide: RouteReuseStrategy, useExisting: TabRouteReuseStrategy },
        provideRouter([
          {
            path: 'app',
            children: [
              {
                path: 'products',
                children: [
                  { path: '', component: ProductListStubComponent, data: { reuse: true } },
                  { path: ':id', component: ProductDetailStubComponent },
                ],
              },
              {
                path: 'orders',
                children: [{ path: '', component: OrderListStubComponent, data: { reuse: true } }],
              },
            ],
          },
          { path: 'login', component: LoginStubComponent },
        ]),
      ],
    });
    strategy = TestBed.inject(TabRouteReuseStrategy);
    harness = await RouterTestingHarness.create();
  });

  it('conserva la pagina lista al cambio tab e la riattacca al ritorno', async () => {
    await harness.navigateByUrl('/app/products');
    await harness.navigateByUrl('/app/orders');

    // Senza il fix il componente veniva distrutto a ogni uscita dal tab.
    expect(events).not.toContain('list:destroy');

    await harness.navigateByUrl('/app/products');
    expect(events.filter((e) => e === 'list:new')).toHaveLength(1);
  });

  it('dentro lo stesso tab (lista → dettaglio → lista) ricarica fresco', async () => {
    await harness.navigateByUrl('/app/products');
    await harness.navigateByUrl('/app/products/42');

    expect(events).toContain('list:destroy');

    await harness.navigateByUrl('/app/products');
    expect(events.filter((e) => e === 'list:new')).toHaveLength(2);
  });

  it('invalidate() distrugge le pagine conservate: al ritorno si ricrea', async () => {
    await harness.navigateByUrl('/app/products');
    await harness.navigateByUrl('/app/orders');

    strategy.invalidate();
    expect(events).toContain('list:destroy');

    await harness.navigateByUrl('/app/products');
    expect(events.filter((e) => e === 'list:new')).toHaveLength(2);
  });

  it('uscire dalla shell /app (logout) svuota la cache', async () => {
    await harness.navigateByUrl('/app/products');
    await harness.navigateByUrl('/app/orders');
    await harness.navigateByUrl('/login');

    // La pagina conservata (products) e quella attiva (orders) sono distrutte.
    expect(events).toContain('list:destroy');
    expect(events).toContain('orders:destroy');

    await harness.navigateByUrl('/app/products');
    expect(events.filter((e) => e === 'list:new')).toHaveLength(2);
  });
});
