import { ForbiddenException, Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { TenantUsersCoreService } from './tenant-users-core.service';

import type { CreateTenantUserDto, TenantUserDto, UpdateTenantUserDto } from './dto/tenant-user.dto';
import type { TenantUserActionActor } from './tenant-users.types';

/**
 * Facciata del titolare (Impostazioni → Utenti) sul ciclo di vita utenti.
 * Gli invarianti di auto-protezione vivono QUI, lato server — la UI li
 * rispecchia ma non è il confine:
 * - nessuno modifica o elimina il proprio account da questa superficie;
 * - gli account titolare sono intoccabili (si gestiscono solo via assistenza);
 * - il ruolo titolare non si assegna da qui (né in creazione né in promozione).
 */
@Injectable()
export class TenantUsersService {
  constructor(private readonly core: TenantUsersCoreService) {}

  listUsers(tenantId: string): Promise<TenantUserDto[]> {
    return this.core.listUsers(tenantId);
  }

  async createUser(
    tenantId: string,
    dto: CreateTenantUserDto,
    actor: TenantUserActionActor,
  ): Promise<TenantUserDto> {
    if (dto.role === UserRole.owner) {
      throw new ForbiddenException(
        'Un nuovo titolare può essere creato solo dall’assistenza Vestiflow.',
      );
    }
    return this.core.createUser(tenantId, dto, actor);
  }

  async updateUser(
    tenantId: string,
    userId: string,
    dto: UpdateTenantUserDto,
    actor: TenantUserActionActor,
  ): Promise<TenantUserDto> {
    const target = await this.core.requireUser(tenantId, userId);
    this.assertNotSelf(target.id, actor, 'Non puoi modificare il tuo account da questa pagina.');
    if (target.role === UserRole.owner) {
      throw new ForbiddenException(
        'Gli account titolare si modificano solo con l’assistenza Vestiflow.',
      );
    }
    if (dto.role === UserRole.owner) {
      throw new ForbiddenException(
        'Il passaggio di proprietà si concorda con l’assistenza Vestiflow.',
      );
    }
    return this.core.updateUser(tenantId, userId, dto, actor);
  }

  async deleteUser(
    tenantId: string,
    userId: string,
    actor: TenantUserActionActor,
  ): Promise<void> {
    const target = await this.core.requireUser(tenantId, userId);
    this.assertNotSelf(target.id, actor, 'Non puoi eliminare il tuo account.');
    if (target.role === UserRole.owner) {
      throw new ForbiddenException(
        'Gli account titolare si eliminano solo con l’assistenza Vestiflow.',
      );
    }
    return this.core.deleteUser(tenantId, userId, actor);
  }

  private assertNotSelf(
    targetUserId: string,
    actor: TenantUserActionActor,
    message: string,
  ): void {
    if (actor.userId !== null && actor.userId === targetUserId) {
      throw new ForbiddenException(message);
    }
  }
}
