import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';
import { TenantChannelProfile } from '@core/models/tenant-channel-profile.model';
import type { User } from '@core/models/user.model';
import { UserRole } from '@core/models/user.model';

import { retailSalesRegisterGuard, salesHistoryGuard } from './retail-sales.guard';

function userWithProfile(profile: User['tenantChannelProfile']): User {
  return {
    id: 'u1',
    tenantId: 't1',
    email: 'u@b.it',
    displayName: 'Utente',
    avatarUrl: null,
    role: UserRole.Clerk,
    storeIds: [],
    isActive: true,
    isPlatformAdmin: false,
    tenantChannelProfile: profile,
    tenantName: 'Cliente test',
    assignedLocationId: null,
    assignedLocationName: null,
    permissions: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('retail-sales guards', () => {
  const createUrlTreeMock = vi.fn((commands: unknown[]) => ({ commands }));

  beforeEach(() => {
    createUrlTreeMock.mockClear();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { currentUser: vi.fn() } },
        { provide: Router, useValue: { createUrlTree: createUrlTreeMock } },
      ],
    });
  });

  describe('retailSalesRegisterGuard', () => {
    it.each([
      TenantChannelProfile.Gestionale,
      TenantChannelProfile.Shopify,
      TenantChannelProfile.TikTokShop,
    ])('consente accesso al profilo %s', (profile) => {
      const auth = TestBed.inject(AuthService);
      vi.mocked(auth.currentUser).mockReturnValue(userWithProfile(profile));

      const result = TestBed.runInInjectionContext(() =>
        retailSalesRegisterGuard({} as never, {} as never),
      );
      expect(result).toBe(true);
    });

    it('redirige utente assente alla dashboard', () => {
      const auth = TestBed.inject(AuthService);
      vi.mocked(auth.currentUser).mockReturnValue(null);

      const result = TestBed.runInInjectionContext(() =>
        retailSalesRegisterGuard({} as never, {} as never),
      );
      expect(createUrlTreeMock).toHaveBeenCalledWith(['/app/dashboard']);
      expect(result).not.toBe(true);
    });
  });

  describe('salesHistoryGuard', () => {
    it('consente accesso al profilo Shopify', () => {
      const auth = TestBed.inject(AuthService);
      vi.mocked(auth.currentUser).mockReturnValue(userWithProfile(TenantChannelProfile.Shopify));

      const result = TestBed.runInInjectionContext(() =>
        salesHistoryGuard({} as never, {} as never),
      );
      expect(result).toBe(true);
    });

    it('consente accesso al profilo TikTok Shop', () => {
      const auth = TestBed.inject(AuthService);
      vi.mocked(auth.currentUser).mockReturnValue(userWithProfile(TenantChannelProfile.TikTokShop));

      const result = TestBed.runInInjectionContext(() =>
        salesHistoryGuard({} as never, {} as never),
      );
      expect(result).toBe(true);
    });

    it('redirige profilo gestionale a registra vendita', () => {
      const auth = TestBed.inject(AuthService);
      vi.mocked(auth.currentUser).mockReturnValue(userWithProfile(TenantChannelProfile.Gestionale));

      const result = TestBed.runInInjectionContext(() =>
        salesHistoryGuard({} as never, {} as never),
      );
      expect(createUrlTreeMock).toHaveBeenCalledWith(['/app/sales/register']);
      expect(result).not.toBe(true);
    });
  });
});
