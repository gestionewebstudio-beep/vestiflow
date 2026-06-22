import { Injectable } from '@nestjs/common';

import type { UserProfileDto } from './dto/user-profile.dto';

interface CachedProfile {
  readonly tenantId: string;
  readonly appUser: UserProfileDto;
  readonly expiresAt: number;
}

const CACHE_TTL_MS = 60_000;

/**
 * Cache in-memory del profilo applicativo (tenant + ruolo) per auth user id.
 * Evita query ripetute su `users` durante la navigazione frontend.
 */
@Injectable()
export class AuthProfileCacheService {
  private readonly entries = new Map<string, CachedProfile>();

  get(authUserId: string): CachedProfile | null {
    const entry = this.entries.get(authUserId);
    if (!entry || entry.expiresAt <= Date.now()) {
      this.entries.delete(authUserId);
      return null;
    }
    return entry;
  }

  invalidate(authUserId: string): void {
    this.entries.delete(authUserId);
  }

  set(authUserId: string, tenantId: string, appUser: UserProfileDto): void {
    this.entries.set(authUserId, {
      tenantId,
      appUser,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
  }
}
