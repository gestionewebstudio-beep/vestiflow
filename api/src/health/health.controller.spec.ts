import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('ritorna ok quando il database risponde', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    };
    const controller = new HealthController(prisma as unknown as PrismaService);

    await expect(controller.check()).resolves.toEqual({ status: 'ok', database: 'up' });
  });

  it('segnala database down senza esporre errori interni', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockRejectedValue(new Error('connection refused')),
    };
    const controller = new HealthController(prisma as unknown as PrismaService);

    await expect(controller.check()).resolves.toEqual({ status: 'ok', database: 'down' });
  });
});
