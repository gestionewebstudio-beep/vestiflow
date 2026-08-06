import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PlatformAdminService } from '../common/platform-admin/platform-admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { SUPPORT_SESSION_TTL_MS } from './support-session.constants';
import type { ActiveSupportSessionContext } from './support-session.types';

@Injectable()
export class SupportSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformAdmin: PlatformAdminService,
  ) {}

  async startSession(
    operatorUserId: string,
    operatorEmail: string,
    targetTenantId: string,
  ): Promise<ActiveSupportSessionContext> {
    if (!this.platformAdmin.isPlatformAdmin(operatorEmail)) {
      throw new ForbiddenException('Solo gli operatori piattaforma possono avviare una sessione assistenza');
    }

    await this.assertClientTenant(targetTenantId);

    const expiresAt = new Date(Date.now() + SUPPORT_SESSION_TTL_MS);

    const session = await this.prisma.$transaction(async (tx) => {
      await tx.supportSession.updateMany({
        where: { operatorUserId, endedAt: null },
        data: { endedAt: new Date() },
      });

      const targetTenant = await tx.tenant.findUnique({
        where: { id: targetTenantId },
        select: { id: true, name: true },
      });
      if (!targetTenant) {
        throw new NotFoundException('Cliente non trovato');
      }

      return tx.supportSession.create({
        data: {
          operatorUserId,
          targetTenantId,
          expiresAt,
        },
        include: {
          targetTenant: { select: { name: true } },
        },
      });
    });

    return this.toContext(session);
  }

  async endActiveSession(operatorUserId: string, sessionId: string): Promise<void> {
    const session = await this.prisma.supportSession.findFirst({
      where: { id: sessionId, operatorUserId, endedAt: null },
    });
    if (!session) {
      throw new NotFoundException('Sessione assistenza non trovata o già terminata');
    }

    await this.prisma.supportSession.update({
      where: { id: sessionId },
      data: { endedAt: new Date() },
    });
  }

  async endActiveSessionForOperator(operatorUserId: string): Promise<void> {
    await this.prisma.supportSession.updateMany({
      where: { operatorUserId, endedAt: null },
      data: { endedAt: new Date() },
    });
  }

  async resolveActiveSession(
    sessionId: string,
    operatorUserId: string,
  ): Promise<ActiveSupportSessionContext | null> {
    const session = await this.prisma.supportSession.findFirst({
      where: { id: sessionId, operatorUserId, endedAt: null },
      include: { targetTenant: { select: { name: true } } },
    });
    if (!session) {
      return null;
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      await this.prisma.supportSession.update({
        where: { id: session.id },
        data: { endedAt: new Date() },
      });
      return null;
    }

    return this.toContext(session);
  }

  private async assertClientTenant(tenantId: string): Promise<void> {
    const users = await this.prisma.user.findMany({
      where: { tenantId },
      select: { email: true },
    });
    if (users.some((user) => this.platformAdmin.isPlatformAdmin(user.email))) {
      throw new ForbiddenException('Non è possibile aprire assistenza su un tenant operatore');
    }
  }

  private toContext(session: {
    readonly id: string;
    readonly targetTenantId: string;
    readonly expiresAt: Date;
    readonly targetTenant: { readonly name: string };
  }): ActiveSupportSessionContext {
    return {
      sessionId: session.id,
      targetTenantId: session.targetTenantId,
      targetTenantName: session.targetTenant.name,
      expiresAt: session.expiresAt.toISOString(),
    };
  }
}
