import { describe, expect, it } from 'vitest';

import {
  TenantChannelProfile,
  showGestionaleRetailSales,
  showShopifyIntegration,
  showTikTokIntegration,
  tenantChannelProfileLabel,
} from './tenant-channel-profile.model';

describe('tenant-channel-profile.model', () => {
  it('tenantChannelProfileLabel copre tutti i profili', () => {
    expect(tenantChannelProfileLabel(TenantChannelProfile.Gestionale)).toBe('Solo gestionale');
    expect(tenantChannelProfileLabel(TenantChannelProfile.Shopify)).toBe('Shopify');
    expect(tenantChannelProfileLabel(TenantChannelProfile.TikTokShop)).toBe('TikTok Shop');
  });

  it('showGestionaleRetailSales solo per profilo gestionale', () => {
    expect(showGestionaleRetailSales(TenantChannelProfile.Gestionale)).toBe(true);
    expect(showGestionaleRetailSales(TenantChannelProfile.Shopify)).toBe(false);
    expect(showGestionaleRetailSales(TenantChannelProfile.TikTokShop)).toBe(false);
    expect(showGestionaleRetailSales(undefined)).toBe(false);
  });

  it('showShopifyIntegration e showTikTokIntegration', () => {
    expect(showShopifyIntegration(TenantChannelProfile.Shopify)).toBe(true);
    expect(showShopifyIntegration(TenantChannelProfile.Gestionale)).toBe(false);
    expect(showTikTokIntegration(TenantChannelProfile.TikTokShop)).toBe(true);
    expect(showTikTokIntegration(TenantChannelProfile.Gestionale)).toBe(false);
  });
});
