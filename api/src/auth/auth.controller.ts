import {
  Controller,
  Delete,
  Get,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import type { AuthenticatedRequest } from '../common/auth/authenticated-request';
import { avatarUploadMulterOptions } from '../common/upload/multer-upload.options';
import { PrismaService } from '../prisma/prisma.service';
import { AuthProfileCacheService } from './auth-profile-cache.service';
import { CurrentUser } from './current-user.decorator';
import type { UserProfileDto } from './dto/user-profile.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { SupabaseService } from './supabase.service';
import { UserAvatarService } from './user-avatar.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly userAvatar: UserAvatarService,
    private readonly prisma: PrismaService,
    private readonly profileCache: AuthProfileCacheService,
  ) {}

  /** Profilo applicativo dell'utente autenticato (tenant, ruolo, negozi). */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser() user: UserProfileDto): UserProfileDto {
    return user;
  }

  /** Carica o sostituisce la foto profilo dell'utente autenticato. */
  @Post('avatar')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file', avatarUploadMulterOptions))
  uploadAvatar(
    @Req() request: AuthenticatedRequest,
    @CurrentUser() user: UserProfileDto,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<UserProfileDto> {
    return this.userAvatar.uploadAvatar(user.id, request.authUserId, file);
  }

  /** Rimuove la foto profilo dell'utente autenticato. */
  @Delete('avatar')
  @UseGuards(JwtAuthGuard)
  removeAvatar(
    @Req() request: AuthenticatedRequest,
    @CurrentUser() user: UserProfileDto,
  ): Promise<UserProfileDto> {
    return this.userAvatar.removeAvatar(user.id, request.authUserId);
  }

  /**
   * L'utente ha cambiato la password iniziale (impostata da chi gli ha creato
   * l'account): azzera il flag e invalida il profilo in cache. Il cambio vero
   * avviene client-side su Supabase Auth; questo endpoint registra solo che il
   * promemoria non serve più — non è un confine di sicurezza.
   */
  @Post('password-changed')
  @UseGuards(JwtAuthGuard)
  async passwordChanged(
    @Req() request: AuthenticatedRequest,
  ): Promise<{ readonly mustChangePassword: boolean }> {
    await this.prisma.user.update({
      where: { id: request.appUser.id },
      data: { mustChangePassword: false },
    });
    this.profileCache.invalidate(request.authUserId);
    return { mustChangePassword: false };
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
