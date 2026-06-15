import { Controller, Get, UseGuards } from '@nestjs/common';

import { CurrentUser } from './current-user.decorator';
import type { UserProfileDto } from './dto/user-profile.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  /** Profilo applicativo dell'utente autenticato (tenant, ruolo, negozi). */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser() user: UserProfileDto): UserProfileDto {
    return user;
  }
}
