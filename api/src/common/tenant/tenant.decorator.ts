import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { TenantAwareRequest } from './tenant.guard';

/** Tenant corrente risolto dalla TenantGuard. Uso: `@CurrentTenant() tenantId: string`. */
export const CurrentTenant = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<TenantAwareRequest>();
  return request.tenantId;
});
