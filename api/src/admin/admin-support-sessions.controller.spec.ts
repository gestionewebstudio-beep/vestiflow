import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedRequest } from '../common/auth/authenticated-request';
import type { SupportSessionService } from '../support/support-session.service';
import {
  AdminSupportSessionsController,
  AdminTenantsSupportController,
} from './admin-support-sessions.controller';

describe('AdminSupportSessionsController', () => {
  const supportSessions = {
    endActiveSessionForOperator: vi.fn(),
    startSession: vi.fn(),
  };

  const request = {
    appUser: { id: 'op-1', email: 'admin@vestiflow.it' },
  } as AuthenticatedRequest;

  const sessionsController = new AdminSupportSessionsController(
    supportSessions as unknown as SupportSessionService,
  );
  const tenantsController = new AdminTenantsSupportController(
    supportSessions as unknown as SupportSessionService,
  );

  it('endCurrentSession delega al service con id operatore', async () => {
    supportSessions.endActiveSessionForOperator.mockResolvedValue(undefined);

    await sessionsController.endCurrentSession(request);

    expect(supportSessions.endActiveSessionForOperator).toHaveBeenCalledWith('op-1');
  });

  it('startSupportSession delega al service con tenant id', async () => {
    const session = {
      sessionId: 'session-1',
      targetTenantId: 'tenant-client',
      targetTenantName: 'Cliente Demo',
      expiresAt: '2026-06-24T16:00:00.000Z',
    };
    supportSessions.startSession.mockResolvedValue(session);

    await expect(
      tenantsController.startSupportSession(request, 'tenant-client'),
    ).resolves.toEqual(session);

    expect(supportSessions.startSession).toHaveBeenCalledWith(
      'op-1',
      'admin@vestiflow.it',
      'tenant-client',
    );
  });
});
