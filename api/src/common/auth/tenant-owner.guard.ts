import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { hasFullTenantAccess } from '../../auth/user-permissions.util';
import type { AuthenticatedRequest } from './authenticated-request';

/**
 * Riserva l'endpoint al titolare del tenant. Va usato DOPO JwtAuthGuard.
 * Le sessioni di assistenza Vestiflow passano (l'operatore agisce come il
 * titolare, e ogni azione resta tracciata nell'audit con il suo nome).
 */
@Injectable()
export class TenantOwnerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.supportSession) {
      return true;
    }
    if (!hasFullTenantAccess(request.appUser)) {
      throw new ForbiddenException('Solo il titolare può gestire gli utenti del negozio.');
    }
    return true;
  }
}
