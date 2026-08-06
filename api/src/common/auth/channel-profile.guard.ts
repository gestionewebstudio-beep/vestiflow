import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { TenantChannelProfile } from '@prisma/client';

import { tenantChannelProfileLabel } from '../tenant-channel-profile.util';
import type { AuthenticatedRequest } from './authenticated-request';
import { CHANNEL_PROFILE_KEY } from './channel-profile.decorator';

/**
 * Autorizzazione per profilo canale del tenant.
 *
 * Va usata DOPO JwtAuthGuard: legge `request.appUser.tenantChannelProfile`,
 * già risolto dal JWT, quindi non costa alcuna query.
 */
@Injectable()
export class ChannelProfileGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<TenantChannelProfile[] | undefined>(
      CHANNEL_PROFILE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.appUser;
    // Rotta pubblica (es. callback OAuth): l'autenticazione avviene altrove e
    // il profilo è già verificato all'avvio del flusso.
    if (!user) {
      return true;
    }

    if (!required.includes(user.tenantChannelProfile)) {
      throw new ForbiddenException(
        `Questo cliente è configurato per ${tenantChannelProfileLabel(user.tenantChannelProfile)}: l'integrazione ${required.map(tenantChannelProfileLabel).join(' / ')} non è disponibile.`,
      );
    }

    return true;
  }
}
