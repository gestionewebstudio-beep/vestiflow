import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { AuthenticatedRequest } from '../common/auth/authenticated-request';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { PlatformAdminService } from '../common/platform-admin/platform-admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthProfileCacheService } from './auth-profile-cache.service';
import { toUserProfileDto } from './dto/user-profile.dto';
import { SupabaseJwtService } from './supabase-jwt.service';
import { SupabaseService } from './supabase.service';
import { SUPPORT_SESSION_HEADER } from '../support/support-session.constants';
import { SupportSessionService } from '../support/support-session.service';

/**
 * Verifica il Bearer JWT Supabase (locale, senza getUser remoto) e risolve
 * l'utente applicativo (tenant + ruolo) dalla tabella `users`, con cache breve.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: SupabaseJwtService,
    private readonly profileCache: AuthProfileCacheService,
    private readonly prisma: PrismaService,
    private readonly platformAdmin: PlatformAdminService,
    private readonly supabase: SupabaseService,
    private readonly supportSessions: SupportSessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    if (!this.jwt.isConfigured()) {
      throw new UnauthorizedException('Autenticazione non configurata sul server');
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.header('authorization');
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token di accesso mancante');
    }

    const accessToken = header.slice('Bearer '.length).trim();
    const verified = await this.jwt.verifyAccessToken(accessToken);
    if (!verified) {
      throw new UnauthorizedException('Sessione non valida o scaduta');
    }

    if (verified.assuranceLevel !== 'aal2') {
      const hasMfa = await this.supabase.userHasVerifiedTotpFactor(verified.authUserId);
      if (hasMfa) {
        throw new UnauthorizedException('Verifica a due fattori richiesta');
      }
    }

    const supportSessionHeader = request.header(SUPPORT_SESSION_HEADER)?.trim();

    const cached = supportSessionHeader ? null : this.profileCache.get(verified.authUserId);
    if (cached) {
      request.tenantId = cached.tenantId;
      request.authUserId = verified.authUserId;
      request.appUser = cached.appUser;
      await this.applySupportSession(request, supportSessionHeader);
      return true;
    }

    const user = await this.prisma.user.findFirst({
      where: { authUserId: verified.authUserId },
      include: {
        stores: true,
        tenant: { select: { name: true, channelProfile: true } },
        assignedLocation: { select: { id: true, name: true } },
      },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Profilo applicativo non trovato o disabilitato');
    }

    const appUser = toUserProfileDto(user, this.platformAdmin.isPlatformAdmin(user.email));
    if (!supportSessionHeader) {
      this.profileCache.set(verified.authUserId, user.tenantId, appUser);
    }
    request.tenantId = user.tenantId;
    request.authUserId = verified.authUserId;
    request.appUser = appUser;
    await this.applySupportSession(request, supportSessionHeader);
    return true;
  }

  private async applySupportSession(
    request: AuthenticatedRequest,
    sessionId: string | undefined,
  ): Promise<void> {
    if (!sessionId || !request.appUser.isPlatformAdmin) {
      return;
    }

    const session = await this.supportSessions.resolveActiveSession(sessionId, request.appUser.id);
    if (!session) {
      throw new UnauthorizedException('Sessione assistenza non valida o scaduta');
    }

    const targetTenant = await this.prisma.tenant.findUnique({
      where: { id: session.targetTenantId },
      select: { name: true, channelProfile: true },
    });
    if (!targetTenant) {
      throw new UnauthorizedException('Cliente della sessione assistenza non trovato');
    }

    request.supportSession = session;
    request.tenantId = session.targetTenantId;
    request.appUser = {
      ...request.appUser,
      tenantId: session.targetTenantId,
      tenantName: targetTenant.name,
      tenantChannelProfile: targetTenant.channelProfile,
      supportSession: session,
    };
  }
}
