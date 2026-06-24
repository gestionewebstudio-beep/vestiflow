import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  function contextWithRole(role?: string, supportSession?: { sessionId: string }) {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          appUser: role ? { role } : undefined,
          supportSession,
        }),
      }),
    };
  }

  it('consente accesso se nessun ruolo richiesto', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    expect(guard.canActivate(contextWithRole('clerk') as never)).toBe(true);
  });

  it('consente accesso se il ruolo utente è tra quelli richiesti', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin', 'manager']);

    expect(guard.canActivate(contextWithRole('manager') as never)).toBe(true);
  });

  it('rifiuta accesso se il ruolo non è autorizzato', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);

    expect(() => guard.canActivate(contextWithRole('clerk') as never)).toThrow(
      ForbiddenException,
    );
  });

  it('consente accesso con sessione assistenza attiva indipendentemente dal ruolo', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);

    expect(
      guard.canActivate(
        contextWithRole('clerk', { sessionId: 'session-1' }) as never,
      ),
    ).toBe(true);
  });
});
