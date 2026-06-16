import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common';

import type { AuthenticatedRequest } from '../common/auth/authenticated-request';
import { CurrentUser } from './current-user.decorator';
import type { UserProfileDto } from './dto/user-profile.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { SupabaseService } from './supabase.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly supabase: SupabaseService) {}

  /** Profilo applicativo dell'utente autenticato (tenant, ruolo, negozi). */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser() user: UserProfileDto): UserProfileDto {
    return user;
  }

  /**
   * Rimuove fattori TOTP non verificati (es. enrollment annullato a metà).
   * Usa service role lato server: il client spesso non può eliminarli da solo.
   */
  @Post('mfa/cleanup-pending')
  @UseGuards(JwtAuthGuard)
  async cleanupPendingMfa(
    @Req() request: AuthenticatedRequest,
  ): Promise<{ readonly removed: number }> {
    const removed = await this.supabase.cleanupUnverifiedTotpFactors(request.authUserId);
    return { removed };
  }
}
