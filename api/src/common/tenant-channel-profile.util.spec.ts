import 'reflect-metadata';

import { BadRequestException } from '@nestjs/common';
import { TenantChannelProfile } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import {
  assertTenantChannelProfile,
  assertTenantChannelProfileChangeAllowed,
  tenantChannelProfileLabel,
} from './tenant-channel-profile.util';

describe('tenant-channel-profile.util', () => {
  describe('tenantChannelProfileLabel', () => {
    it('etichetta ogni profilo canale', () => {
      expect(tenantChannelProfileLabel(TenantChannelProfile.gestionale)).toBe('solo gestionale');
      expect(tenantChannelProfileLabel(TenantChannelProfile.shopify)).toBe('Shopify');
      expect(tenantChannelProfileLabel(TenantChannelProfile.tiktok_shop)).toBe('TikTok Shop');
    });
  });

  describe('assertTenantChannelProfile', () => {
    it('passa se profilo corrisponde', async () => {
      const prisma = {
        tenant: {
          findUnique: vi.fn().mockResolvedValue({ channelProfile: TenantChannelProfile.shopify }),
        },
      };
      await expect(
        assertTenantChannelProfile(prisma as never, 't1', TenantChannelProfile.shopify),
      ).resolves.toBeUndefined();
    });

    it('lancia se tenant assente o profilo diverso', async () => {
      const prismaMissing = {
        tenant: { findUnique: vi.fn().mockResolvedValue(null) },
      };
      await expect(
        assertTenantChannelProfile(prismaMissing as never, 't1', TenantChannelProfile.shopify),
      ).rejects.toBeInstanceOf(BadRequestException);

      const prismaMismatch = {
        tenant: {
          findUnique: vi.fn().mockResolvedValue({ channelProfile: TenantChannelProfile.gestionale }),
        },
      };
      await expect(
        assertTenantChannelProfile(prismaMismatch as never, 't1', TenantChannelProfile.shopify),
      ).rejects.toThrow(/Shopify/);
    });
  });

  describe('assertTenantChannelProfileChangeAllowed', () => {
    it('non fa nulla se profilo invariato', async () => {
      const prisma = {
        tenant: {
          findUnique: vi.fn().mockResolvedValue({
            channelProfile: TenantChannelProfile.shopify,
            shopifyConnection: null,
            tiktokConnection: null,
          }),
        },
      };
      await expect(
        assertTenantChannelProfileChangeAllowed(
          prisma as never,
          't1',
          TenantChannelProfile.shopify,
        ),
      ).resolves.toBeUndefined();
    });

    it('blocca cambio se Shopify ancora connesso', async () => {
      const prisma = {
        tenant: {
          findUnique: vi.fn().mockResolvedValue({
            channelProfile: TenantChannelProfile.shopify,
            shopifyConnection: { status: 'connected' },
            tiktokConnection: null,
          }),
        },
      };
      await expect(
        assertTenantChannelProfileChangeAllowed(
          prisma as never,
          't1',
          TenantChannelProfile.gestionale,
        ),
      ).rejects.toThrow(/Disconnetti Shopify/);
    });

    it('blocca cambio se TikTok ancora connesso', async () => {
      const prisma = {
        tenant: {
          findUnique: vi.fn().mockResolvedValue({
            channelProfile: TenantChannelProfile.tiktok_shop,
            shopifyConnection: null,
            tiktokConnection: { status: 'connected' },
          }),
        },
      };
      await expect(
        assertTenantChannelProfileChangeAllowed(
          prisma as never,
          't1',
          TenantChannelProfile.gestionale,
        ),
      ).rejects.toThrow(/Disconnetti TikTok/);
    });
  });
});
