import { SetMetadata } from '@nestjs/common';
import type { TenantChannelProfile } from '@prisma/client';

export const CHANNEL_PROFILE_KEY = 'requiredChannelProfiles';

/**
 * Limita un controller (o un singolo handler) ai tenant il cui profilo canale
 * è tra quelli indicati. Va usato con ChannelProfileGuard dopo JwtAuthGuard.
 *
 * Il profilo canale è la decisione commerciale su cosa il cliente ha acquistato:
 * un tenant «solo gestionale» non deve poter raggiungere gli endpoint di
 * integrazione nemmeno conoscendone l'URL (regole-sicurezza: nascondere la UI
 * non è sicurezza).
 */
export const RequireChannelProfile = (
  ...profiles: TenantChannelProfile[]
): MethodDecorator & ClassDecorator => SetMetadata(CHANNEL_PROFILE_KEY, profiles);
