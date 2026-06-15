import type { Request } from 'express';

import type { UserProfileDto } from '../../auth/dto/user-profile.dto';

/** Request HTTP con utente applicativo e tenant risolti dal JWT Supabase. */
export interface AuthenticatedRequest extends Request {
  tenantId: string;
  appUser: UserProfileDto;
}
