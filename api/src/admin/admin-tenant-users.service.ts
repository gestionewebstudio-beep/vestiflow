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
import { normalizeStoredPermissions } from '../auth/user-permissions.util';
import { isTenantPermissionKey } from '../auth/tenant-permission.constants';

import type { CreateTenantUserDto, TenantUserDto, UpdateTenantUserDto } from './dto/tenant-user.dto';

const USER_LOCATIONS_INCLUDE = {
  locations: { include: { location: { select: { id: true, name: true } } } },
} as const;

interface LocationAssignment {
  readonly hasAllLocationsAccess: boolean;
  readonly assignedLocationIds: readonly string[];
}

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
      include: USER_LOCATIONS_INCLUDE,
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

    const locationAssignment = await this.resolveLocationAssignment(tenantId, dto.role, {
      hasAllLocationsAccess: dto.hasAllLocationsAccess,
      assignedLocationIds: dto.assignedLocationIds,
    });
    const defaultLocationId = await this.resolveDefaultLocationId(
      tenantId,
      locationAssignment,
      dto.defaultLocationId ?? null,
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
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            tenantId,
            authUserId,
            email,
            displayName: dto.displayName.trim(),
            role: dto.role,
            hasAllLocationsAccess: locationAssignment.hasAllLocationsAccess,
            defaultLocationId,
            permissions,
            stores: { create: { storeId: store.id } },
          },
        });

        if (locationAssignment.assignedLocationIds.length > 0) {
          await tx.userLocation.createMany({
            data: locationAssignment.assignedLocationIds.map((locationId) => ({
              userId: created.id,
              locationId,
              tenantId,
            })),
          });
        }

        return tx.user.findUniqueOrThrow({
          where: { id: created.id },
          include: USER_LOCATIONS_INCLUDE,
        });
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
      include: USER_LOCATIONS_INCLUDE,
    });
    if (!existing) {
      throw new NotFoundException('Utente non trovato');
    }

    const nextRole = dto.role ?? existing.role;
    const existingAssignedLocationIds = existing.locations.map((row) => row.locationId);

    const locationInputProvided =
      dto.hasAllLocationsAccess !== undefined || dto.assignedLocationIds !== undefined;

    let locationAssignment: LocationAssignment;
    if (locationInputProvided) {
      locationAssignment = await this.resolveLocationAssignment(tenantId, nextRole, {
        hasAllLocationsAccess: dto.hasAllLocationsAccess,
        assignedLocationIds: dto.assignedLocationIds,
      });
    } else if (dto.role !== undefined) {
      // Cambio ruolo senza nuovo input sedi: rivalida la sede attuale nel
      // contesto del nuovo ruolo (es. da admin con tutte le sedi a manager
      // richiede assegnazione esplicita).
      locationAssignment = await this.resolveLocationAssignment(tenantId, nextRole, {
        hasAllLocationsAccess: existing.hasAllLocationsAccess,
        assignedLocationIds: existingAssignedLocationIds,
      });
    } else {
      locationAssignment = {
        hasAllLocationsAccess: existing.hasAllLocationsAccess,
        assignedLocationIds: existingAssignedLocationIds,
      };
    }

    const permissions =
      dto.permissions !== undefined || dto.role !== undefined
        ? this.resolvePermissions(nextRole, dto.permissions ?? existing.permissions)
        : existing.permissions;

    // Sede predefinita: input esplicito validato contro la nuova assegnazione;
    // senza input, quella esistente sopravvive SOLO se ancora autorizzata
    // (cambio assegnazioni/ruolo che la esclude -> azzerata, mai errore).
    let defaultLocationId: string | null;
    if (dto.defaultLocationId !== undefined) {
      defaultLocationId = await this.resolveDefaultLocationId(
        tenantId,
        locationAssignment,
        dto.defaultLocationId,
      );
    } else {
      const stillAuthorized = await this.isDefaultLocationAuthorized(
        tenantId,
        locationAssignment,
        existing.defaultLocationId,
      );
      defaultLocationId = stillAuthorized ? existing.defaultLocationId : null;
    }

    const user = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          ...(dto.displayName !== undefined ? { displayName: dto.displayName.trim() } : {}),
          ...(dto.role !== undefined ? { role: dto.role } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          hasAllLocationsAccess: locationAssignment.hasAllLocationsAccess,
          defaultLocationId,
          permissions,
        },
      });

      await tx.userLocation.deleteMany({ where: { userId } });
      if (locationAssignment.assignedLocationIds.length > 0) {
        await tx.userLocation.createMany({
          data: locationAssignment.assignedLocationIds.map((locationId) => ({
            userId,
            locationId,
            tenantId,
          })),
        });
      }

      return tx.user.findUniqueOrThrow({
        where: { id: userId },
        include: USER_LOCATIONS_INCLUDE,
      });
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

  /**
   * Deriva l'assegnazione sedi definitiva per un utente in base al ruolo:
   * - owner: sempre tutte le sedi, nessuna riga UserLocation.
   * - admin: tutte le sedi salvo `hasAllLocationsAccess === false` esplicito,
   *   nel qual caso richiede assegnazioni esplicite valide.
   * - manager/clerk: mai tutte le sedi, richiede sempre assegnazioni esplicite valide.
   */
  private async resolveLocationAssignment(
    tenantId: string,
    role: UserRole,
    input: { hasAllLocationsAccess?: boolean; assignedLocationIds?: readonly string[] },
  ): Promise<LocationAssignment> {
    if (role === UserRole.owner) {
      return { hasAllLocationsAccess: true, assignedLocationIds: [] };
    }

    if (role === UserRole.admin && input.hasAllLocationsAccess !== false) {
      return { hasAllLocationsAccess: true, assignedLocationIds: [] };
    }

    const assignedLocationIds = await this.requireValidAssignedLocationIds(
      tenantId,
      input.assignedLocationIds,
    );
    return { hasAllLocationsAccess: false, assignedLocationIds };
  }

  /**
   * Valida un elenco di sedi da assegnare: devono esistere, appartenere al
   * tenant ed essere licenziate/attive. Richiede almeno una sede, a meno che
   * il tenant non abbia ancora nessuna sede attiva nel piano (in quel caso
   * non blocca il provisioning: non c'è nulla da assegnare).
   */
  private async requireValidAssignedLocationIds(
    tenantId: string,
    assignedLocationIds: readonly string[] | undefined,
  ): Promise<string[]> {
    const unique = [...new Set(assignedLocationIds ?? [])];

    if (unique.length === 0) {
      const activeCount = await this.prisma.location.count({
        where: { tenantId, licensedInVf: true, isActive: true },
      });
      if (activeCount > 0) {
        throw new BadRequestException('Assegna almeno una sede operativa per questo ruolo.');
      }
      return [];
    }

    const found = await this.prisma.location.findMany({
      where: {
        id: { in: unique },
        tenantId,
        licensedInVf: true,
        isActive: true,
      },
      select: { id: true },
    });
    if (found.length !== unique.length) {
      throw new BadRequestException('Una o più sedi non sono valide o non attive nel piano del cliente.');
    }

    return unique;
  }

  /**
   * Valida la sede predefinita richiesta: deve essere autorizzata per l'utente
   * (tra le assegnate; con accesso pieno qualunque sede licenziata e attiva del
   * tenant). `null` = nessuna predefinita. Input non autorizzato -> 400.
   */
  private async resolveDefaultLocationId(
    tenantId: string,
    assignment: LocationAssignment,
    requested: string | null,
  ): Promise<string | null> {
    if (!requested) {
      return null;
    }
    const authorized = await this.isDefaultLocationAuthorized(tenantId, assignment, requested);
    if (!authorized) {
      throw new BadRequestException(
        'La sede predefinita deve essere una sede autorizzata per questo utente.',
      );
    }
    return requested;
  }

  /** True se la sede è utilizzabile come predefinita per l'assegnazione data. */
  private async isDefaultLocationAuthorized(
    tenantId: string,
    assignment: LocationAssignment,
    locationId: string | null,
  ): Promise<boolean> {
    if (!locationId) {
      return false;
    }
    if (!assignment.hasAllLocationsAccess) {
      return assignment.assignedLocationIds.includes(locationId);
    }
    const count = await this.prisma.location.count({
      where: { id: locationId, tenantId, licensedInVf: true, isActive: true },
    });
    return count > 0;
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
    hasAllLocationsAccess: boolean;
    defaultLocationId?: string | null;
    permissions: string[];
    isActive: boolean;
    createdAt: Date;
    locations?: readonly { location: { id: string; name: string } }[];
  }): TenantUserDto {
    const assignedLocations = (user.locations ?? []).map((row) => row.location);
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      hasAllLocationsAccess: user.hasAllLocationsAccess,
      assignedLocationIds: assignedLocations.map((location) => location.id),
      assignedLocations,
      defaultLocationId: user.defaultLocationId ?? null,
      permissions: (user.permissions ?? []).filter(isTenantPermissionKey),
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
