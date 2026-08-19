import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import {
  TenantPermission,
  docViewPermission,
  type TenantPermissionKey,
} from '../auth/tenant-permission.constants';
import { TenantPermissionsGuard } from '../common/auth/tenant-permissions.guard';
import { testClerkUser, testOwnerUser } from '../test/fixtures/user-profile.fixture';
import { ShopifyController } from './shopify.controller';

/**
 * Il gate di queste due rotte è metadato del decoratore: leggerlo con il
 * Reflector vero, sull'handler vero, è l'unico modo perché il test cada se
 * qualcuno rimette «Esportare dati» da solo. Un test che ricostruisse i gruppi
 * a mano resterebbe verde proprio nel caso che deve impedire.
 */
const guard = new TenantPermissionsGuard(new Reflector());

function contextFor(handlerName: keyof ShopifyController, appUser: UserProfileDto) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ appUser }) }),
    getHandler: () => ShopifyController.prototype[handlerName],
    getClass: () => ShopifyController,
  } as never;
}

function clerkWith(...permissions: readonly TenantPermissionKey[]): UserProfileDto {
  return testClerkUser({ permissions: [...permissions] });
}

describe('ShopifyController — il permesso segue ciò che la sync tocca, non l’export', () => {
  describe('POST /shopify/sync/customers', () => {
    it('nega a chi ha solo «Esportare dati»: la sync scrive nell’anagrafica clienti', () => {
      const user = clerkWith(TenantPermission.ReportsExport);

      expect(() => guard.canActivate(contextFor('syncCustomers', user))).toThrow(
        ForbiddenException,
      );
    });

    it('nega anche a chi gestisce i clienti ma non può esportare: i due gruppi sono in AND', () => {
      const user = clerkWith(TenantPermission.CustomersManage);

      expect(() => guard.canActivate(contextFor('syncCustomers', user))).toThrow(
        ForbiddenException,
      );
    });

    it('consente a chi ha «Esportare dati» E «Gestire clienti»', () => {
      const user = clerkWith(TenantPermission.ReportsExport, TenantPermission.CustomersManage);

      expect(guard.canActivate(contextFor('syncCustomers', user))).toBe(true);
    });

    it('il titolare passa anche con l’array permessi vuoto', () => {
      const owner = testOwnerUser({ permissions: [] });

      expect(guard.canActivate(contextFor('syncCustomers', owner))).toBe(true);
    });
  });

  describe('POST /shopify/sync/orders', () => {
    it('nega a chi ha solo «Esportare dati»: la sync importa le vendite online', () => {
      const user = clerkWith(TenantPermission.ReportsExport);

      expect(() => guard.canActivate(contextFor('syncOrders', user))).toThrow(ForbiddenException);
    });

    it('nega a chi vede le vendite online ma non può esportare', () => {
      const user = clerkWith(TenantPermission.SectionSales, docViewPermission('online_sale'));

      expect(() => guard.canActivate(contextFor('syncOrders', user))).toThrow(ForbiddenException);
    });

    it('nega se manca la famiglia «Vendite online», pur avendo sezione ed export', () => {
      const user = clerkWith(TenantPermission.SectionSales, TenantPermission.ReportsExport);

      expect(() => guard.canActivate(contextFor('syncOrders', user))).toThrow(ForbiddenException);
    });

    it('consente con export, sezione e famiglia vendite online', () => {
      const user = clerkWith(
        TenantPermission.ReportsExport,
        TenantPermission.SectionSales,
        docViewPermission('online_sale'),
      );

      expect(guard.canActivate(contextFor('syncOrders', user))).toBe(true);
    });

    it('vale anche dalla sezione Report: è la stessa porta dei corrispettivi', () => {
      const user = clerkWith(
        TenantPermission.ReportsExport,
        TenantPermission.SectionReports,
        docViewPermission('online_sale'),
      );

      expect(guard.canActivate(contextFor('syncOrders', user))).toBe(true);
    });

    it('il titolare passa anche con l’array permessi vuoto', () => {
      const owner = testOwnerUser({ permissions: [] });

      expect(guard.canActivate(contextFor('syncOrders', owner))).toBe(true);
    });
  });

  // Le altre sync del controller non cambiano: una guardia che si allarga
  // oltre il suo incarico è un difetto quanto quella che manca.
  describe('le altre sync restano come sono', () => {
    it('sync/products chiede solo «Import/export e sync prodotti»', () => {
      const user = clerkWith(TenantPermission.CatalogImportExport);

      expect(guard.canActivate(contextFor('syncProducts', user))).toBe(true);
    });

    it('sync/inventory chiede solo «Import/export e sync giacenze»', () => {
      const user = clerkWith(TenantPermission.InventoryImportExport);

      expect(guard.canActivate(contextFor('syncInventory', user))).toBe(true);
    });
  });
});
