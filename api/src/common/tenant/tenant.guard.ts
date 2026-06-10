import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TenantAwareRequest extends Request {
  tenantId: string;
}

/**
 * Risolve il tenant corrente per la request.
 *
 * TODO(auth): provvisorio fino allo step Supabase Auth — il tenant arriva
 * dall'header `x-tenant-id`. Con l'auth definitiva il tenant verrà estratto
 * dal JWT verificato (claim custom), mai da un header arbitrario del client.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<TenantAwareRequest>();
    const header = request.header('x-tenant-id');
    if (!header || !UUID_PATTERN.test(header)) {
      throw new UnauthorizedException('Tenant non identificato');
    }
    request.tenantId = header;
    return true;
  }
}
