import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { TenantChannelProfile } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { PlatformAdminService } from '../common/platform-admin/platform-admin.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { SupabaseService } from '../auth/supabase.service';
import type { LocationLicensingService } from '../inventory/location-licensing.service';
import { AdminTenantsService } from './admin-tenants.service';

describe('AdminTenantsService', () => {
  function createService(options?: {
    supabase?: Partial<SupabaseService>;
    config?: Record<string, string | undefined>;
  }) {
    const prisma = {
      tenant: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      store: {
        create: vi.fn(),
      },
      location: {
        create: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
      user: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      $transaction: vi.fn(),
    };
    const platformAdmin = {
      isPlatformAdmin: vi.fn().mockReturnValue(false),
    };
    const supabase = {
      isConfigured: vi.fn().mockReturnValue(true),
      createAuthUser: vi.fn(),
      provisionAuthUserForInvite: vi.fn(),
      resendAuthInvite: vi.fn(),
      deleteAuthUser: vi.fn(),
    };
    // Object.assign preserva i tipi Mock (lo spread di Partial<SupabaseService>
    // li allargherebbe all'unione con le firme reali, rompendo mockResolvedValue).
    Object.assign(supabase, options?.supabase);
    const config = {
      get: (key: string) => options?.config?.[key],
    } as ConfigService;
    const locationLicensing = {
      assertLicensedLocationCount: vi.fn(),
      applyAdminLicensedLocationLimit: vi.fn().mockResolvedValue(0),
      grantLocationSelectionChange: vi.fn(),
      getSummary: vi.fn().mockResolvedValue({
        licensedLocationCount: 2,
        licensedLocationActiveCount: 2,
        locationSelectionLocked: false,
        locationSelectionChangeGranted: false,
        canChangeLicensedLocations: true,
      }),
    };

    const service = new AdminTenantsService(
      prisma as unknown as PrismaService,
      supabase as unknown as SupabaseService,
      platformAdmin as unknown as PlatformAdminService,
      config,
      locationLicensing as unknown as LocationLicensingService,
    );

    return { service, prisma, platformAdmin, supabase, config, locationLicensing };
  }

  it('listTenants esclude tenant con utenti platform admin', async () => {
    const { service, prisma, platformAdmin } = createService();
    platformAdmin.isPlatformAdmin.mockImplementation((email: string) =>
      email.includes('operator@'),
    );
    prisma.tenant.findMany.mockResolvedValue([
      {
        id: 'tenant-client',
        name: 'Cliente',
        channelProfile: 'hybrid',
        createdAt: new Date('2026-01-01'),
        vatNumber: null,
        users: [{ email: 'owner@client.it', displayName: 'Owner', createdAt: new Date() }],
      },
      {
        id: 'tenant-op',
        name: 'Operatore',
        channelProfile: 'hybrid',
        createdAt: new Date('2026-01-02'),
        vatNumber: null,
        users: [{ email: 'operator@vestiflow.test', displayName: 'Ops', createdAt: new Date() }],
      },
    ]);

    const tenants = await service.listTenants();

    expect(tenants).toHaveLength(1);
    expect(tenants[0]?.id).toBe('tenant-client');
  });

  it('getTenantById lancia NotFoundException per tenant operatore', async () => {
    const { service, prisma, platformAdmin } = createService();
    platformAdmin.isPlatformAdmin.mockReturnValue(true);
    prisma.user.findMany.mockResolvedValue([{ email: 'operator@vestiflow.test' }]);

    await expect(service.getTenantById('tenant-op')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getTenantById include sedi attive licenziate in VestiFlow', async () => {
    const { service, prisma, locationLicensing } = createService();
    prisma.user.findMany.mockResolvedValue([{ email: 'owner@test.it' }]);
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant-1',
      name: 'Cliente',
      channelProfile: TenantChannelProfile.shopify,
      createdAt: new Date('2026-01-01'),
      legalName: null,
      vatNumber: null,
      fiscalCode: null,
      phone: null,
      pec: null,
      sdiCode: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      province: null,
      postalCode: null,
      countryCode: 'IT',
      users: [
        {
          id: 'user-1',
          email: 'owner@test.it',
          displayName: 'Titolare',
          role: 'owner',
        },
      ],
      stores: [{ id: 'store-1', name: 'Negozio' }],
      locations: [{ id: 'loc-legacy', name: 'Legacy', addressLine1: null, addressLine2: null, city: null, province: null, postalCode: null, countryCode: 'IT' }],
    });
    prisma.location.findMany.mockResolvedValue([
      {
        id: 'loc-a',
        name: 'Snow City Warehouse',
        code: 'LOC-03',
        isActive: true,
        shopifyLocationId: 'gid://shopify/Location/3',
      },
    ]);
    locationLicensing.getSummary.mockResolvedValue({
      licensedLocationCount: 1,
      licensedLocationActiveCount: 1,
      locationSelectionLocked: true,
      locationSelectionChangeGranted: false,
      canChangeLicensedLocations: false,
    });

    const detail = await service.getTenantById('tenant-1');

    expect(prisma.location.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', licensedInVf: true },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        code: true,
        isActive: true,
        shopifyLocationId: true,
      },
    });
    expect(detail.activeLocations).toEqual([
      {
        id: 'loc-a',
        name: 'Snow City Warehouse',
        code: 'LOC-03',
        isActive: true,
        shopifyLocationId: 'gid://shopify/Location/3',
      },
    ]);
    expect(detail.canChangeLicensedLocations).toBe(false);
  });

  it('grantLocationSelectionChange delega al licensing service', async () => {
    const { service, prisma, locationLicensing } = createService();
    prisma.user.findMany.mockResolvedValue([{ email: 'owner@test.it' }]);
    locationLicensing.grantLocationSelectionChange.mockResolvedValue({
      licensedLocationCount: 1,
      licensedLocationActiveCount: 1,
      locationSelectionLocked: true,
      locationSelectionChangeGranted: true,
      canChangeLicensedLocations: true,
    });

    await service.grantLocationSelectionChange('tenant-1');

    expect(locationLicensing.grantLocationSelectionChange).toHaveBeenCalledWith('tenant-1');
  });

  it('createTenant usa createAuthUser con password se invito email disabilitato', async () => {
    const { service, prisma, supabase } = createService({
      config: { FRONTEND_URL: 'http://localhost:4200' },
    });
    prisma.user.findFirst.mockResolvedValue(null);
    supabase.createAuthUser.mockResolvedValue('auth-user-1');
    prisma.$transaction.mockImplementation(async (callback) =>
      callback({
        tenant: {
          create: vi.fn().mockResolvedValue({
            id: 'tenant-1',
            name: 'Cliente',
            channelProfile: 'gestionale',
          }),
        },
        store: {
          create: vi.fn().mockResolvedValue({ id: 'store-1', name: 'Negozio principale' }),
        },
        location: {
          create: vi.fn().mockResolvedValue({ id: 'loc-1', name: 'Negozio principale' }),
        },
        user: {
          create: vi.fn().mockResolvedValue({
            id: 'user-1',
            email: 'owner@test.it',
            displayName: 'Titolare',
            role: 'owner',
          }),
        },
      }),
    );

    const result = await service.createTenant({
      tenantName: 'Cliente',
      ownerEmail: 'owner@test.it',
      ownerDisplayName: 'Titolare',
      ownerPassword: 'Password123!',
      channelProfile: TenantChannelProfile.gestionale,
    });

    expect(supabase.createAuthUser).toHaveBeenCalledWith('owner@test.it', 'Password123!');
    expect(supabase.provisionAuthUserForInvite).not.toHaveBeenCalled();
    expect(result.ownerInviteSent).toBe(false);
  });

  it('createTenant invia provisionAuthUserForInvite se SUPABASE_OWNER_EMAIL_INVITE=true', async () => {
    const { service, prisma, supabase } = createService({
      config: { FRONTEND_URL: 'http://localhost:4200', SUPABASE_OWNER_EMAIL_INVITE: 'true' },
    });
    prisma.user.findFirst.mockResolvedValue(null);
    supabase.provisionAuthUserForInvite.mockResolvedValue({
      authUserId: 'auth-user-1',
      inviteSent: true,
    });
    prisma.$transaction.mockImplementation(async (callback) =>
      callback({
        tenant: {
          create: vi.fn().mockResolvedValue({
            id: 'tenant-1',
            name: 'Cliente',
            channelProfile: 'gestionale',
          }),
        },
        store: {
          create: vi.fn().mockResolvedValue({ id: 'store-1', name: 'Negozio principale' }),
        },
        location: {
          create: vi.fn().mockResolvedValue({ id: 'loc-1', name: 'Negozio principale' }),
        },
        user: {
          create: vi.fn().mockResolvedValue({
            id: 'user-1',
            email: 'owner@test.it',
            displayName: 'Titolare',
            role: 'owner',
          }),
        },
      }),
    );

    const result = await service.createTenant({
      tenantName: 'Cliente',
      ownerEmail: 'owner@test.it',
      ownerDisplayName: 'Titolare',
      channelProfile: TenantChannelProfile.gestionale,
    });

    expect(supabase.provisionAuthUserForInvite).toHaveBeenCalledWith(
      'owner@test.it',
      'http://localhost:4200/login/reset-password',
    );
    expect(supabase.createAuthUser).not.toHaveBeenCalled();
    expect(result.ownerInviteSent).toBe(true);
  });

  it('updateTenant abbassa limite sedi e applica trim licenze in transazione', async () => {
    const { service, prisma, locationLicensing } = createService();
    const tenantRecord = {
      id: 'tenant-1',
      name: 'Cliente',
      channelProfile: TenantChannelProfile.shopify,
      createdAt: new Date('2026-01-01'),
      legalName: null,
      vatNumber: null,
      fiscalCode: null,
      phone: null,
      pec: null,
      sdiCode: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      province: null,
      postalCode: null,
      countryCode: 'IT',
      users: [
        {
          id: 'user-1',
          email: 'owner@test.it',
          displayName: 'Titolare',
          role: 'owner',
        },
      ],
      stores: [{ id: 'store-1', name: 'Negozio' }],
      locations: [{ id: 'loc-1', name: 'Shop', addressLine1: null, addressLine2: null, city: null, province: null, postalCode: null, countryCode: 'IT' }],
    };

    prisma.user.findMany.mockResolvedValue([{ email: 'owner@test.it' }]);
    prisma.tenant.findUnique.mockResolvedValue(tenantRecord);
    locationLicensing.applyAdminLicensedLocationLimit.mockResolvedValue(1);
    locationLicensing.getSummary.mockResolvedValue({
      licensedLocationCount: 1,
      licensedLocationActiveCount: 1,
      locationSelectionLocked: true,
      locationSelectionChangeGranted: false,
      canChangeLicensedLocations: false,
    });

    const tx = {
      tenant: { update: vi.fn().mockResolvedValue({}) },
      user: { update: vi.fn() },
      store: { update: vi.fn() },
      location: { update: vi.fn() },
    };
    prisma.$transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) =>
      callback(tx),
    );

    const result = await service.updateTenant('tenant-1', {
      licensedLocationCount: 1,
    });

    expect(locationLicensing.assertLicensedLocationCount).toHaveBeenCalledWith(1);
    expect(locationLicensing.applyAdminLicensedLocationLimit).toHaveBeenCalledWith(
      'tenant-1',
      1,
      tx,
    );
    expect(result.licensedLocationCount).toBe(1);
    expect(result.licensedLocationActiveCount).toBe(1);
  });
});
