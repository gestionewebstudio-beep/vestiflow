import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedRequest } from '../common/auth/authenticated-request';
import type { UserProfileDto } from './dto/user-profile.dto';
import type { SupabaseService } from './supabase.service';
import type { UserAvatarService } from './user-avatar.service';
import { AuthController } from './auth.controller';

describe('AuthController', () => {
  const user = {
    id: 'user-1',
    email: 'test@example.com',
    displayName: 'Test',
    role: 'owner',
    tenantId: 'tenant-1',
    storeIds: [],
  } as unknown as UserProfileDto;
  const supabase = { cleanupUnverifiedTotpFactors: vi.fn() };
  const userAvatar = {
    uploadAvatar: vi.fn(),
    removeAvatar: vi.fn(),
  };

  const controller = new AuthController(
    supabase as unknown as SupabaseService,
    userAvatar as unknown as UserAvatarService,
  );

  it('getMe ritorna il profilo corrente', () => {
    expect(controller.getMe(user)).toBe(user);
  });

  it('cleanupPendingMfa delega a Supabase', async () => {
    supabase.cleanupUnverifiedTotpFactors.mockResolvedValue(2);
    const request = { authUserId: 'auth-1' } as AuthenticatedRequest;

    await expect(controller.cleanupPendingMfa(request)).resolves.toEqual({ removed: 2 });
  });

  it('uploadAvatar delega al service avatar', async () => {
    const file = { originalname: 'avatar.png' } as Express.Multer.File;
    const request = { authUserId: 'auth-1' } as AuthenticatedRequest;
    userAvatar.uploadAvatar.mockResolvedValue(user);

    await controller.uploadAvatar(request, user, file);

    expect(userAvatar.uploadAvatar).toHaveBeenCalledWith(user.id, 'auth-1', file);
  });

  it('removeAvatar delega al service avatar', async () => {
    const request = { authUserId: 'auth-1' } as AuthenticatedRequest;
    userAvatar.removeAvatar.mockResolvedValue({ ...user, avatarUrl: null });

    await controller.removeAvatar(request, user);

    expect(userAvatar.removeAvatar).toHaveBeenCalledWith(user.id, 'auth-1');
  });
});
