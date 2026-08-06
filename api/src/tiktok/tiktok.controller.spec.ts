import { describe, expect, it, vi } from 'vitest';

import type { TikTokConfigService } from './tiktok-config.service';
import type { TikTokConnectionService } from './tiktok-connection.service';
import type { TikTokOAuthService } from './tiktok-oauth.service';
import { TikTokController } from './tiktok.controller';

describe('TikTokController', () => {
  const tenantId = 'tenant-1';
  const tiktokConnection = {
    getForTenant: vi.fn(),
    clearErrors: vi.fn(),
  };
  const tiktokOAuth = {
    beginAuth: vi.fn(),
    handleCallback: vi.fn(),
    disconnect: vi.fn(),
  };
  const tiktokConfig = { frontendUrl: 'http://localhost:4200' };

  const controller = new TikTokController(
    tiktokConnection as unknown as TikTokConnectionService,
    tiktokOAuth as unknown as TikTokOAuthService,
    tiktokConfig as unknown as TikTokConfigService,
  );

  it('getConnection delega al service', async () => {
    tiktokConnection.getForTenant.mockResolvedValue({ connected: false });

    await expect(controller.getConnection(tenantId)).resolves.toEqual({ connected: false });
  });

  it('beginAuth delega a OAuth', async () => {
    tiktokOAuth.beginAuth.mockResolvedValue({ authorizeUrl: 'https://tiktok.example/oauth' });

    await expect(controller.beginAuth(tenantId)).resolves.toMatchObject({
      authorizeUrl: expect.stringContaining('tiktok'),
    });
  });

  it('disconnect delega a OAuth', async () => {
    tiktokOAuth.disconnect.mockResolvedValue(undefined);

    await expect(controller.disconnect(tenantId)).resolves.toEqual({ disconnected: true });
  });

  it('authCallback reindirizza in caso di successo', async () => {
    tiktokOAuth.handleCallback.mockResolvedValue('http://localhost:4200/app/settings?tiktok=ok');
    const redirect = vi.fn();
    const response = { redirect } as never;

    await controller.authCallback({}, response);

    expect(redirect).toHaveBeenCalledWith('http://localhost:4200/app/settings?tiktok=ok');
  });

  it('authCallback reindirizza alla pagina errore se OAuth fallisce', async () => {
    tiktokOAuth.handleCallback.mockRejectedValue(new Error('denied'));
    const redirect = vi.fn();
    const response = { redirect } as never;

    await controller.authCallback({}, response);

    expect(redirect).toHaveBeenCalledWith('http://localhost:4200/app/settings?tiktok=error');
  });

  it('clearErrors delega al connection service', async () => {
    tiktokConnection.clearErrors.mockResolvedValue({ cleared: 2 });

    await expect(controller.clearErrors(tenantId)).resolves.toEqual({ cleared: 2 });
  });
});
