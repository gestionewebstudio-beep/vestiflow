import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { AuthProfileCacheService } from './auth-profile-cache.service';
import type { PlatformAdminService } from '../common/platform-admin/platform-admin.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { SupabaseService } from './supabase.service';
import { UserAvatarService } from './user-avatar.service';

describe('UserAvatarService', () => {
  function createService(storageClient: unknown = null) {
    const supabase = { getStorageClient: vi.fn().mockReturnValue(storageClient) };
    const service = new UserAvatarService(
      {} as PrismaService,
      supabase as unknown as SupabaseService,
      { get: () => 'user-avatars' } as never,
      { invalidate: vi.fn() } as unknown as AuthProfileCacheService,
      { isPlatformAdmin: vi.fn().mockReturnValue(false) } as unknown as PlatformAdminService,
    );
    return service;
  }

  it('uploadAvatar rifiuta file mancante', async () => {
    const service = createService({ storage: { from: vi.fn() } });

    await expect(
      service.uploadAvatar('user-1', 'auth-1', undefined as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('uploadAvatar rifiuta se storage non configurato', async () => {
    const service = createService(null);
    const file = {
      buffer: Buffer.from([0xff, 0xd8, 0xff]),
      size: 100,
      mimetype: 'image/jpeg',
    } as Express.Multer.File;

    await expect(service.uploadAvatar('user-1', 'auth-1', file)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('uploadAvatar rifiuta formato non supportato', async () => {
    const service = createService({ storage: { from: vi.fn() } });
    const file = {
      buffer: Buffer.from('not-an-image'),
      size: 100,
      mimetype: 'application/pdf',
    } as Express.Multer.File;

    await expect(service.uploadAvatar('user-1', 'auth-1', file)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
