import { describe, expect, it } from 'vitest';

import {
  TenantChannelProfile,
  onlineSalesChannelLabel,
  onlineSalesRegisterLabel,
  onlineSalesCorrispettiviHint,
  reportPageSubtitle,
  showOnlineSalesRegister,
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

  it('showOnlineSalesRegister per tutti i profili canale', () => {
    expect(showOnlineSalesRegister(TenantChannelProfile.Gestionale)).toBe(true);
    expect(showOnlineSalesRegister(TenantChannelProfile.Shopify)).toBe(true);
    expect(showOnlineSalesRegister(TenantChannelProfile.TikTokShop)).toBe(true);
    expect(showOnlineSalesRegister(undefined)).toBe(false);
  });

  it('onlineSalesRegisterLabel distingue gestionale da canali integrati', () => {
    expect(onlineSalesRegisterLabel(TenantChannelProfile.Gestionale)).toBe(
      'Registra vendita online',
    );
    expect(onlineSalesRegisterLabel(TenantChannelProfile.Shopify)).toBe(
      'Registra vendita online esterna',
    );
  });

  it('onlineSalesChannelLabel semplifica etichetta per solo gestionale', () => {
    expect(onlineSalesChannelLabel(TenantChannelProfile.Gestionale)).toBe('Vendita online');
    expect(onlineSalesChannelLabel(TenantChannelProfile.Shopify)).toBe('Vendita online esterna');
  });

  it('reportPageSubtitle adatta copy al profilo tenant', () => {
    expect(reportPageSubtitle(TenantChannelProfile.Gestionale)).toContain('Analytics commerciali');
    expect(reportPageSubtitle(TenantChannelProfile.Shopify)).toContain('corrispettivi manuali');
  });

  it('onlineSalesCorrispettiviHint omette riferimento Shopify per gestionale', () => {
    expect(onlineSalesCorrispettiviHint(TenantChannelProfile.Gestionale)).not.toContain('Shopify');
    expect(onlineSalesCorrispettiviHint(TenantChannelProfile.Shopify)).toContain('Shopify');
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
