import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { AuthenticatedRequest } from '../common/auth/authenticated-request';
import type { UserProfileDto } from './dto/user-profile.dto';

/** Profilo utente corrente (dopo JwtAuthGuard). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): UserProfileDto => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.appUser;
  },
);
