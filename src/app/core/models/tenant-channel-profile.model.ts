import type { BadgeTone } from '@shared/components/badge/badge.component';

/** Profilo canale scelto in provisioning piattaforma (allineato a Prisma `TenantChannelProfile`). */
export const TenantChannelProfile = {
  Gestionale: 'gestionale',
  Shopify: 'shopify',
  TikTokShop: 'tiktok_shop',
} as const;

export type TenantChannelProfile = (typeof TenantChannelProfile)[keyof typeof TenantChannelProfile];

export interface TenantChannelProfileOption {
  readonly value: TenantChannelProfile;
  readonly label: string;
  readonly description: string;
}

export const TENANT_CHANNEL_PROFILE_OPTIONS: readonly TenantChannelProfileOption[] = [
  {
    value: TenantChannelProfile.Gestionale,
    label: 'Solo gestionale',
    description: 'Magazzino, prodotti e ordini fornitori senza integrazione ecommerce.',
  },
  {
    value: TenantChannelProfile.Shopify,
    label: 'Shopify',
    description: 'Il cliente collega lo shop Shopify da Impostazioni.',
  },
  {
    value: TenantChannelProfile.TikTokShop,
    label: 'TikTok Shop (in manutenzione)',
    description:
      'Integrazione in preparazione: il cliente vedrà TikTok Shop in Impostazioni quando sarà disponibile.',
  },
];

const PROFILE_LABELS: Record<TenantChannelProfile, string> = {
  [TenantChannelProfile.Gestionale]: 'Solo gestionale',
  [TenantChannelProfile.Shopify]: 'Shopify',
  [TenantChannelProfile.TikTokShop]: 'TikTok Shop',
};

export function tenantChannelProfileLabel(profile: TenantChannelProfile): string {
  return PROFILE_LABELS[profile];
}

/** Allineato al badge «Fonte» in catalogo prodotti (`catalogOriginTone`). */
export function tenantChannelProfileBadgeTone(profile: TenantChannelProfile): BadgeTone {
  switch (profile) {
    case TenantChannelProfile.Shopify:
      return 'info';
    case TenantChannelProfile.Gestionale:
      return 'vestiflow';
    default:
      return 'neutral';
  }
}

export function showShopifyIntegration(profile: TenantChannelProfile | undefined): boolean {
  return profile === TenantChannelProfile.Shopify;
}

export function showTikTokIntegration(profile: TenantChannelProfile | undefined): boolean {
  return profile === TenantChannelProfile.TikTokShop;
}
