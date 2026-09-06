import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { PlatformAdminService } from '../common/platform-admin/platform-admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantUsersCoreService } from '../tenant-users/tenant-users-core.service';

import type {
  CreateTenantUserDto,
  TenantUserDto,
  UpdateTenantUserDto,
} from '../tenant-users/dto/tenant-user.dto';
import type { TenantUserActionActor } from '../tenant-users/tenant-users.types';

const EMPLOYEES_BELONG_TO_OWNER =
  'I dipendenti si gestiscono dal titolare (Impostazioni → Utenti) o in sessione assistenza.';

/**
 * Facciata admin piattaforma sul ciclo di vita utenti tenant. Decisione di
 * prodotto (2026-08-11): i DIPENDENTI li gestisce solo il titolare — da qui
 * l'admin consulta (lista completa, diagnosi permessi) e amministra i soli
 * account TITOLARE: creazione, modifica, promozione a titolare (passaggio di
 * proprietà). Le mutazioni sui dipendenti sono rifiutate lato server, non solo
 * nascoste in UI; per intervenire su un dipendente l'admin entra in sessione
 * assistenza e usa la pagina del titolare (tracciata nell'audit come tale).
 */
@Injectable()
export class AdminTenantUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformAdmin: PlatformAdminService,
    private readonly core: TenantUsersCoreService,
  ) {}

  async listUsers(tenantId: string): Promise<TenantUserDto[]> {
    await this.assertClientTenant(tenantId);
    return this.core.listUsers(tenantId);
  }

  async createUser(
    tenantId: string,
    dto: CreateTenantUserDto,
    actor?: TenantUserActionActor,
  ): Promise<TenantUserDto> {
    await this.assertClientTenant(tenantId);
    if (dto.role !== UserRole.owner) {
      throw new ForbiddenException(EMPLOYEES_BELONG_TO_OWNER);
    }
    return this.core.createUser(tenantId, dto, actor);
  }

  async updateUser(
    tenantId: string,
    userId: string,
    dto: UpdateTenantUserDto,
    actor?: TenantUserActionActor,
  ): Promise<TenantUserDto> {
    await this.assertClientTenant(tenantId);
    const target = await this.core.requireUser(tenantId, userId);
    // Ammessi: account titolare (incluso il declassamento nel passaggio di
    // proprietà) e promozione di un dipendente a titolare. Tutto il resto è
    // gestione dipendenti, che appartiene al titolare.
    const isOwnerTarget = target.role === UserRole.owner;
    const isPromotionToOwner = dto.role === UserRole.owner;
    if (!isOwnerTarget && !isPromotionToOwner) {
      throw new ForbiddenException(EMPLOYEES_BELONG_TO_OWNER);
    }
    return this.core.updateUser(tenantId, userId, dto, actor);
  }

  async deleteUser(
    tenantId: string,
    userId: string,
    actor?: TenantUserActionActor,
  ): Promise<void> {
    await this.assertClientTenant(tenantId);
    const target = await this.core.requireUser(tenantId, userId);
    if (target.role !== UserRole.owner) {
      throw new ForbiddenException(EMPLOYEES_BELONG_TO_OWNER);
    }
    // Il core blocca comunque l'eliminazione di un titolare: la rimozione di
    // un owner passa dal declassamento (poi ci pensa il titolare) o dalla
    // cancellazione dell'intero tenant.
    return this.core.deleteUser(tenantId, userId, actor);
  }

  private async assertClientTenant(tenantId: string): Promise<void> {
    const users = await this.prisma.user.findMany({
      where: { tenantId },
      select: { email: true },
    });
    if (users.length === 0) {
      throw new NotFoundException('Cliente non trovato');
    }
    if (users.some((user) => this.platformAdmin.isPlatformAdmin(user.email))) {
      throw new NotFoundException('Cliente non trovato');
    }
  }
}
