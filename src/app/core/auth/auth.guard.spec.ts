import { TestBed } from '@angular/core/testing';
import { Router, type ActivatedRouteSnapshot, type RouterStateSnapshot } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from './auth.service';
import { authGuard } from './auth.guard';
import { guestGuard } from './guest.guard';

describe('authGuard', () => {
  const state = { url: '/app/products' } as RouterStateSnapshot;
  const route = {} as ActivatedRouteSnapshot;
  const createUrlTreeMock = vi.fn((commands: unknown[], extras?: { queryParams?: unknown }) => ({
    commands,
    extras,
  }));

  beforeEach(() => {
    createUrlTreeMock.mockClear();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: { isAuthenticated: vi.fn() },
        },
        {
          provide: Router,
          useValue: { createUrlTree: createUrlTreeMock },
        },
      ],
    });
  });

  it('consente accesso se autenticato', () => {
    const auth = TestBed.inject(AuthService);
    vi.mocked(auth.isAuthenticated).mockReturnValue(true);

    const result = TestBed.runInInjectionContext(() => authGuard(route, state));
    expect(result).toBe(true);
  });

  it('redirige al login con returnUrl se non autenticato', () => {
    const auth = TestBed.inject(AuthService);
    vi.mocked(auth.isAuthenticated).mockReturnValue(false);

    const result = TestBed.runInInjectionContext(() => authGuard(route, state));

    expect(createUrlTreeMock).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnUrl: '/app/products' },
    });
    expect(result).not.toBe(true);
  });
});

describe('guestGuard', () => {
  const createUrlTreeMock = vi.fn((commands: unknown[]) => ({ commands }));

  beforeEach(() => {
    createUrlTreeMock.mockClear();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: { isAuthenticated: vi.fn() },
        },
        {
          provide: Router,
          useValue: { createUrlTree: createUrlTreeMock },
        },
      ],
    });
  });

  it('redirige alla dashboard se gia autenticato', () => {
    const auth = TestBed.inject(AuthService);
    vi.mocked(auth.isAuthenticated).mockReturnValue(true);

    const result = TestBed.runInInjectionContext(() =>
      guestGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );

    expect(createUrlTreeMock).toHaveBeenCalledWith(['/app/dashboard']);
    expect(result).not.toBe(true);
  });

  it('consente accesso guest se non autenticato', () => {
    const auth = TestBed.inject(AuthService);
    vi.mocked(auth.isAuthenticated).mockReturnValue(false);

    const result = TestBed.runInInjectionContext(() =>
      guestGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );
    expect(result).toBe(true);
  });
});
