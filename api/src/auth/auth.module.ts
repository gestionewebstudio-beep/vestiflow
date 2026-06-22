import { Global, Module } from '@nestjs/common';

import { AuthController } from './auth.controller';
import { AuthProfileCacheService } from './auth-profile-cache.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { SupabaseJwtService } from './supabase-jwt.service';
import { SupabaseService } from './supabase.service';
import { UserAvatarService } from './user-avatar.service';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    SupabaseService,
    SupabaseJwtService,
    AuthProfileCacheService,
    JwtAuthGuard,
    UserAvatarService,
  ],
  exports: [SupabaseService, SupabaseJwtService, AuthProfileCacheService, JwtAuthGuard],
})
export class AuthModule {}
