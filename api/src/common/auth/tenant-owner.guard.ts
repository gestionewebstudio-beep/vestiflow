import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { hasFullTenantAccess } from '../../auth/user-permissions.util';
import type { AuthenticatedRequest } from './authenticated-request';

/**
 * Riserva l'endpoint al titolare del tenant — gli utenti del negozio e
 * l'anagrafica dell'azienda gestita. Va usato DOPO JwtAuthGuard.
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
      throw new ForbiddenException('Riservato al titolare del negozio.');
    }
    return true;
  }
}
