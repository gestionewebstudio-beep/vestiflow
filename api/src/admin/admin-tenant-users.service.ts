import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';

import { AuthProfileCacheService } from '../auth/auth-profile-cache.service';
import { SupabaseService } from '../auth/supabase.service';
import { PlatformAdminService } from '../common/platform-admin/platform-admin.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  hasUnrestrictedLocationAccess,
  requiresAssignedLocation,
} from '../inventory/user-location-scope.util';
import { normalizeStoredPermissions } from '../auth/user-permissions.util';
import { isTenantPermissionKey } from '../auth/tenant-permission.constants';

import type { CreateTenantUserDto, TenantUserDto, UpdateTenantUserDto } from './dto/tenant-user.dto';

@Injectable()
export class AdminTenantUsersService {
  private readonly logger = new Logger(AdminTenantUsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
    private readonly platformAdmin: PlatformAdminService,
    private readonly profileCache: AuthProfileCacheService,
    private readonly config: ConfigService,
  ) {}

  async listUsers(tenantId: string): Promise<TenantUserDto[]> {
    await this.assertClientTenant(tenantId);

    const users = await this.prisma.user.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      include: {
        assignedLocation: { select: { id: true, name: true } },
      },
    });

    return users.map((user) => this.toDto(user));
  }

  async createUser(tenantId: string, dto: CreateTenantUserDto): Promise<TenantUserDto> {
    await this.assertClientTenant(tenantId);

    if (!this.supabase.isConfigured()) {
      throw new BadRequestException(
        'Supabase non configurato: impossibile creare credenziali di accesso',
      );
    }

    const email = dto.email.trim().toLowerCase();
    if (this.platformAdmin.isPlatformAdmin(email)) {
      throw new BadRequestException('Non puoi provisionare un utente con email Admin Vestiflow');
    }

    const existing = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    if (existing) {
      throw new ConflictException('Esiste già un utente con questa email');
    }

    const assignedLocationId = await this.resolveAssignedLocationId(
      tenantId,
      dto.role,
      dto.assignedLocationId ?? null,
    );
    const permissions = this.resolvePermissions(dto.role, dto.permissions);

    const store = await this.prisma.store.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!store) {
      throw new BadRequestException('Negozio non trovato per questo cliente');
    }

    let authUserId: string;
    try {
      authUserId = await this.supabase.createAuthUser(email, dto.password.trim());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'CREATION_FAILED';
      if (message === 'EMAIL_ALREADY_REGISTERED') {
        throw new ConflictException('Email già registrata in Supabase Auth');
      }
      this.logger.error(`Creazione utente Auth fallita per ${email}: ${message}`);
      throw new InternalServerErrorException('Creazione utente di accesso non riuscita');
    }

    try {
      const user = await this.prisma.user.create({
        data: {
          tenantId,
          authUserId,
          email,
          displayName: dto.displayName.trim(),
          role: dto.role,
          assignedLocationId,
          permissions,
          stores: { create: { storeId: store.id } },
        },
        include: {
          assignedLocation: { select: { id: true, name: true } },
        },
      });
      return this.toDto(user);
    } catch (error) {
      await this.supabase.deleteAuthUser(authUserId).catch(() => undefined);
      throw error;
    }
  }

  async updateUser(
    tenantId: string,
    userId: string,
    dto: UpdateTenantUserDto,
  ): Promise<TenantUserDto> {
    await this.assertClientTenant(tenantId);

    const existing = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      include: { assignedLocation: { select: { id: true, name: true } } },
    });
    if (!existing) {
      throw new NotFoundException('Utente non trovato');
    }

    const nextRole = dto.role ?? existing.role;
    let assignedLocationId = existing.assignedLocationId;
    if (dto.assignedLocationId !== undefined) {
      assignedLocationId = await this.resolveAssignedLocationId(
        tenantId,
        nextRole,
        dto.assignedLocationId,
      );
    } else if (dto.role !== undefined && hasUnrestrictedLocationAccess({ role: nextRole })) {
      assignedLocationId = null;
    } else if (dto.role !== undefined && requiresAssignedLocation({ role: nextRole })) {
      assignedLocationId = await this.resolveAssignedLocationId(
        tenantId,
        nextRole,
        existing.assignedLocationId,
      );
    }

    const permissions =
      dto.permissions !== undefined || dto.role !== undefined
        ? this.resolvePermissions(nextRole, dto.permissions ?? existing.permissions)
        : existing.permissions;

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.displayName !== undefined ? { displayName: dto.displayName.trim() } : {}),
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        assignedLocationId,
        permissions,
      },
      include: {
        assignedLocation: { select: { id: true, name: true } },
      },
    });

    if (user.authUserId) {
      this.profileCache.invalidate(user.authUserId);
    }

    return this.toDto(user);
  }

  async deleteUser(tenantId: string, userId: string): Promise<void> {
    await this.assertClientTenant(tenantId);

    const existing = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: {
        id: true,
        authUserId: true,
        role: true,
        avatarStoragePath: true,
      },
    });
    if (!existing) {
      throw new NotFoundException('Utente non trovato');
    }

    if (existing.role === UserRole.owner) {
      throw new BadRequestException('Non puoi eliminare un titolare del negozio.');
    }

    await this.removeAvatarStorage(existing.avatarStoragePath);
    await this.prisma.supportSession.deleteMany({ where: { operatorUserId: userId } });
    await this.prisma.user.delete({ where: { id: userId } });

    if (existing.authUserId) {
      await this.supabase.deleteAuthUser(existing.authUserId).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Utente ${userId} rimosso dal gestionale ma eliminazione Auth fallita: ${message}`,
        );
      });
      this.profileCache.invalidate(existing.authUserId);
    }
  }

  private async removeAvatarStorage(storagePath: string | null): Promise<void> {
    if (!storagePath) {
      return;
    }
    const client = this.supabase.getStorageClient();
    if (!client) {
      return;
    }
    await client.storage.from(this.avatarBucket()).remove([storagePath]).catch(() => undefined);
  }

  private avatarBucket(): string {
    return this.config.get<string>('SUPABASE_USER_AVATARS_BUCKET') ?? 'user-avatars';
  }

  private async resolveAssignedLocationId(
    tenantId: string,
    role: UserRole,
    assignedLocationId: string | null | undefined,
  ): Promise<string | null> {
    if (hasUnrestrictedLocationAccess({ role })) {
      return null;
    }

    if (!assignedLocationId) {
      const activeCount = await this.prisma.location.count({
        where: { tenantId, licensedInVf: true, isActive: true },
      });
      if (activeCount > 0) {
        throw new BadRequestException(
          'Assegna una sede operativa per manager e commesso.',
        );
      }
      return null;
    }

    const location = await this.prisma.location.findFirst({
      where: {
        id: assignedLocationId,
        tenantId,
        licensedInVf: true,
        isActive: true,
      },
      select: { id: true },
    });
    if (!location) {
      throw new BadRequestException('Sede non valida o non attiva nel piano del cliente.');
    }

    return assignedLocationId;
  }

  private resolvePermissions(
    role: UserRole,
    permissions: readonly string[] | undefined,
  ): string[] {
    const sanitized = permissions?.filter(isTenantPermissionKey);
    return normalizeStoredPermissions(role, sanitized);
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

  private toDto(user: {
    id: string;
    email: string;
    displayName: string;
    role: UserRole;
    assignedLocationId: string | null;
    permissions: string[];
    isActive: boolean;
    createdAt: Date;
    assignedLocation?: { id: string; name: string } | null;
  }): TenantUserDto {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      assignedLocationId: user.assignedLocationId,
      assignedLocationName: user.assignedLocation?.name ?? null,
      permissions: (user.permissions ?? []).filter(isTenantPermissionKey),
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
