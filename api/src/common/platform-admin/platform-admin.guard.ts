import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { PlatformAdminService } from './platform-admin.service';

/** Limita gli endpoint di provisioning a email in PLATFORM_ADMIN_EMAILS. */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly platformAdmin: PlatformAdminService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const email = request.appUser?.email;
    if (!email || !this.platformAdmin.isPlatformAdmin(email)) {
      throw new ForbiddenException('Accesso riservato agli amministratori della piattaforma');
    }
    return true;
  }
}
