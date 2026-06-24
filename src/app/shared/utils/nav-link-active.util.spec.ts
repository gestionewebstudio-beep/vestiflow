import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { describe, expect, it } from 'vitest';

import type { NavItem } from '@shared/models/nav-item.model';

import { isNavItemActive, NAV_LINK_SUBSET_MATCH } from './nav-link-active.util';

@Component({ template: '' })
class EmptyComponent {}

describe('isNavItemActive', () => {
  const inventoryItem: NavItem = {
    label: 'Magazzino',
    icon: 'pi-box',
    route: '/app/inventory/lookup',
    activeRoutePrefix: '/app/inventory',
  };

  const salesListItem: NavItem = {
    label: 'Vendite',
    icon: 'pi-shopping-cart',
    route: '/app/sales',
    activeRoutePrefix: '/app/sales',
    activeRouteExclude: ['/app/sales/register'],
  };

  const salesRegisterItem: NavItem = {
    label: 'Registra vendita',
    icon: 'pi-shopping-bag',
    route: '/app/sales/register',
    activeRoutePrefix: '/app/sales/register',
  };

  async function navigate(url: string): Promise<Router> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'app/products', component: EmptyComponent },
          {
            path: 'app/inventory',
            children: [
              { path: 'lookup', component: EmptyComponent },
              { path: 'movements', component: EmptyComponent },
            ],
          },
          {
            path: 'app/sales',
            children: [
              { path: '', component: EmptyComponent },
              { path: 'register', component: EmptyComponent },
              { path: ':id', component: EmptyComponent },
            ],
          },
          { path: 'app/admin/clients', component: EmptyComponent },
          { path: 'app/admin/clients/:tenantId', component: EmptyComponent },
        ]),
      ],
    });
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    return router;
  }

  it('evidenzia Magazzino su lookup e movimenti', async () => {
    const routerLookup = await navigate('/app/inventory/lookup');
    expect(isNavItemActive(routerLookup, inventoryItem)).toBe(true);

    const routerMovements = await navigate('/app/inventory/movements');
    expect(isNavItemActive(routerMovements, inventoryItem)).toBe(true);
  });

  it('non evidenzia Magazzino fuori sezione', async () => {
    const router = await navigate('/app/products');
    expect(isNavItemActive(router, inventoryItem)).toBe(false);
  });

  it('evidenzia Vendite ma non su registra vendita', async () => {
    const routerList = await navigate('/app/sales');
    expect(isNavItemActive(routerList, salesListItem)).toBe(true);

    const routerDetail = await navigate('/app/sales/order-1');
    expect(isNavItemActive(routerDetail, salesListItem)).toBe(true);

    const routerRegister = await navigate('/app/sales/register');
    expect(isNavItemActive(routerRegister, salesListItem)).toBe(false);
    expect(isNavItemActive(routerRegister, salesRegisterItem)).toBe(true);
  });

  it('rispetta linkActiveOptions legacy', async () => {
    const router = await navigate('/app/admin/clients/tenant-1');
    const item: NavItem = {
      label: 'Clienti',
      icon: 'pi-users',
      route: '/app/admin/clients',
      linkActiveOptions: NAV_LINK_SUBSET_MATCH,
    };
    expect(isNavItemActive(router, item)).toBe(true);
  });
});
