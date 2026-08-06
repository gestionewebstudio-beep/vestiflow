import type { Request } from 'express';

import type { UserProfileDto } from '../../auth/dto/user-profile.dto';
import type { ActiveSupportSessionContext } from '../../support/support-session.types';

/** Request HTTP con utente applicativo e tenant risolti dal JWT Supabase. */
export interface AuthenticatedRequest extends Request {
  tenantId: string;
  authUserId: string;
  appUser: UserProfileDto;
  supportSession?: ActiveSupportSessionContext;
}
