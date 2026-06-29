import { BadRequestException } from '@nestjs/common';
import { TenantChannelProfile } from '@prisma/client';

import type { PrismaService } from '../prisma/prisma.service';

const PROFILE_LABELS: Record<TenantChannelProfile, string> = {
  gestionale: 'solo gestionale',
  shopify: 'Shopify',
  tiktok_shop: 'TikTok Shop',
};

export function tenantChannelProfileLabel(profile: TenantChannelProfile): string {
  return PROFILE_LABELS[profile];
}

/** Etichetta vendite online manuali (origine vestiflow_online). */
export function onlineSalesChannelLabel(
  profile: TenantChannelProfile | null | undefined,
): string {
  return profile === TenantChannelProfile.gestionale
    ? 'Vendita online'
    : 'Vendita online esterna';
}

/** Motivo movimento vendita online manuale. */
export function onlineSalesSaleReasonLabel(
  profile: TenantChannelProfile | null | undefined,
): string {
  return onlineSalesChannelLabel(profile);
}

/** Motivo movimento reso online manuale. */
export function onlineSalesReturnReasonLabel(
  profile: TenantChannelProfile | null | undefined,
): string {
  return profile === TenantChannelProfile.gestionale
    ? 'Storno online (reso)'
    : 'Storno online esterna (reso)';
}

export async function assertTenantChannelProfile(
  prisma: PrismaService,
  tenantId: string,
  expected: TenantChannelProfile,
): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { channelProfile: true },
  });
  if (!tenant) {
    throw new BadRequestException('Tenant non trovato');
  }
  if (tenant.channelProfile !== expected) {
    throw new BadRequestException(
      `Questo cliente è configurato per ${tenantChannelProfileLabel(tenant.channelProfile)}: l'integrazione ${tenantChannelProfileLabel(expected)} non è disponibile.`,
    );
  }
}

export async function assertTenantChannelProfileChangeAllowed(
  prisma: PrismaService,
  tenantId: string,
  nextProfile: TenantChannelProfile,
): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      channelProfile: true,
      shopifyConnection: { select: { status: true } },
      tiktokConnection: { select: { status: true } },
    },
  });
  if (!tenant) {
    throw new BadRequestException('Tenant non trovato');
  }
  if (tenant.channelProfile === nextProfile) {
    return;
  }

  const shopifyConnected = tenant.shopifyConnection?.status === 'connected';
  const tiktokConnected = tenant.tiktokConnection?.status === 'connected';

  if (nextProfile !== TenantChannelProfile.shopify && shopifyConnected) {
    throw new BadRequestException(
      'Disconnetti Shopify dalle impostazioni del cliente prima di cambiare profilo canale.',
    );
  }
  if (nextProfile !== TenantChannelProfile.tiktok_shop && tiktokConnected) {
    throw new BadRequestException(
      'Disconnetti TikTok Shop dalle impostazioni del cliente prima di cambiare profilo canale.',
    );
  }
}
