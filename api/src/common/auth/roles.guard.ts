import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@prisma/client';

import type { AuthenticatedRequest } from './authenticated-request';
import { ROLES_KEY } from './roles.decorator';

/**
 * Autorizzazione per ruolo. Va usata DOPO JwtAuthGuard nello stesso
 * `@UseGuards(JwtAuthGuard, RolesGuard)` perche' legge `request.appUser`.
 * Se l'endpoint non dichiara @Roles, lascia passare (solo autenticazione).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.supportSession) {
      return true;
    }

    const role = request.appUser?.role;
    if (!role || !required.includes(role)) {
      throw new ForbiddenException('Permessi insufficienti per questa azione');
    }
    return true;
  }
}
