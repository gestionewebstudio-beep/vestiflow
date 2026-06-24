import { describe, expect, it } from 'vitest';

import {
  TenantChannelProfile,
  showRetailSalesRegister,
  showSalesOrderHistory,
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

  it('showRetailSalesRegister per tutti i profili canale', () => {
    expect(showRetailSalesRegister(TenantChannelProfile.Gestionale)).toBe(true);
    expect(showRetailSalesRegister(TenantChannelProfile.Shopify)).toBe(true);
    expect(showRetailSalesRegister(TenantChannelProfile.TikTokShop)).toBe(true);
    expect(showRetailSalesRegister(undefined)).toBe(false);
  });

  it('showSalesOrderHistory solo per profilo Shopify', () => {
    expect(showSalesOrderHistory(TenantChannelProfile.Shopify)).toBe(true);
    expect(showSalesOrderHistory(TenantChannelProfile.Gestionale)).toBe(false);
    expect(showSalesOrderHistory(TenantChannelProfile.TikTokShop)).toBe(false);
    expect(showSalesOrderHistory(undefined)).toBe(false);
  });

  it('showShopifyIntegration e showTikTokIntegration', () => {
    expect(showShopifyIntegration(TenantChannelProfile.Shopify)).toBe(true);
    expect(showShopifyIntegration(TenantChannelProfile.Gestionale)).toBe(false);
    expect(showTikTokIntegration(TenantChannelProfile.TikTokShop)).toBe(true);
    expect(showTikTokIntegration(TenantChannelProfile.Gestionale)).toBe(false);
  });
});
