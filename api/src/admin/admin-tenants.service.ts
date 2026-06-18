import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { SupabaseService } from '../auth/supabase.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateTenantDto } from './dto/create-tenant.dto';
import type { ProvisionedTenantDto } from './dto/provisioned-tenant.dto';
import type { TenantDetailDto } from './dto/tenant-detail.dto';
import type { TenantSummaryDto } from './dto/tenant-summary.dto';
import type { UpdateTenantDto } from './dto/update-tenant.dto';
import {
  locationAddressFromProfile,
  tenantProfileCreateData,
  tenantProfileReplaceData,
} from './tenant-profile.util';

@Injectable()
export class AdminTenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
  ) {}

  async listTenants(): Promise<TenantSummaryDto[]> {
    const tenants = await this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        users: {
          where: { role: 'owner' },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });

    return tenants.map((tenant) => ({
      id: tenant.id,
      name: tenant.name,
      createdAt: tenant.createdAt.toISOString(),
      ownerEmail: tenant.users[0]?.email ?? null,
      ownerDisplayName: tenant.users[0]?.displayName ?? null,
      vatNumber: tenant.vatNumber,
    }));
  }

  async getTenantById(tenantId: string): Promise<TenantDetailDto> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        users: {
          where: { role: 'owner' },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
        stores: { orderBy: { createdAt: 'asc' }, take: 1 },
        locations: { orderBy: { createdAt: 'asc' }, take: 1 },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Cliente non trovato');
    }

    const owner = tenant.users[0] ?? null;
    const store = tenant.stores[0] ?? null;
    const location = tenant.locations[0] ?? null;

    return {
      id: tenant.id,
      name: tenant.name,
      createdAt: tenant.createdAt.toISOString(),
      profile: {
        legalName: tenant.legalName,
        vatNumber: tenant.vatNumber,
        fiscalCode: tenant.fiscalCode,
        phone: tenant.phone,
        pec: tenant.pec,
        sdiCode: tenant.sdiCode,
        addressLine1: tenant.addressLine1,
        addressLine2: tenant.addressLine2,
        city: tenant.city,
        province: tenant.province,
        postalCode: tenant.postalCode,
        countryCode: tenant.countryCode,
      },
      owner: owner
        ? {
            id: owner.id,
            email: owner.email,
            displayName: owner.displayName,
          }
        : null,
      store: store ? { id: store.id, name: store.name } : null,
      location: location
        ? {
            id: location.id,
            name: location.name,
            addressLine1: location.addressLine1,
            addressLine2: location.addressLine2,
            city: location.city,
            province: location.province,
            postalCode: location.postalCode,
            countryCode: location.countryCode,
          }
        : null,
    };
  }

  async updateTenant(tenantId: string, dto: UpdateTenantDto): Promise<TenantDetailDto> {
    const existing = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        users: { where: { role: 'owner' }, orderBy: { createdAt: 'asc' }, take: 1 },
        stores: { orderBy: { createdAt: 'asc' }, take: 1 },
        locations: { orderBy: { createdAt: 'asc' }, take: 1 },
      },
    });

    if (!existing) {
      throw new NotFoundException('Cliente non trovato');
    }

    const profileUpdate = tenantProfileReplaceData(dto);
    const locationAddress = locationAddressFromProfile(dto);

    await this.prisma.$transaction(async (tx) => {
      await tx.tenant.update({
        where: { id: tenantId },
        data: {
          ...(dto.tenantName ? { name: dto.tenantName.trim() } : {}),
          ...profileUpdate,
        },
      });

      if (dto.ownerDisplayName && existing.users[0]) {
        await tx.user.update({
          where: { id: existing.users[0].id },
          data: { displayName: dto.ownerDisplayName.trim() },
        });
      }

      if (dto.storeName && existing.stores[0]) {
        await tx.store.update({
          where: { id: existing.stores[0].id },
          data: { name: dto.storeName.trim() },
        });
      }

      if (existing.locations[0]) {
        await tx.location.update({
          where: { id: existing.locations[0].id },
          data: {
            ...(dto.locationName ? { name: dto.locationName.trim() } : {}),
            ...locationAddress,
          },
        });
      }
    });

    return this.getTenantById(tenantId);
  }

  async createTenant(dto: CreateTenantDto): Promise<ProvisionedTenantDto> {
    if (!this.supabase.isConfigured()) {
      throw new BadRequestException(
        'Supabase non configurato: impossibile creare credenziali di accesso',
      );
    }

    const ownerEmail = dto.ownerEmail.trim().toLowerCase();
    const storeName = dto.storeName?.trim() || 'Negozio principale';
    const locationName = dto.locationName?.trim() || storeName;
    const profileData = tenantProfileCreateData(dto);
    const locationAddress = locationAddressFromProfile(dto);

    const existingAppUser = await this.prisma.user.findFirst({
      where: { email: { equals: ownerEmail, mode: 'insensitive' } },
    });
    if (existingAppUser) {
      throw new ConflictException('Esiste già un utente con questa email');
    }

    let authUserId: string;
    try {
      authUserId = await this.supabase.createAuthUser(ownerEmail, dto.ownerPassword);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'CREATION_FAILED';
      if (message === 'EMAIL_ALREADY_REGISTERED') {
        throw new ConflictException('Email già registrata in Supabase Auth');
      }
      throw new InternalServerErrorException('Creazione utente di accesso non riuscita');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: {
            name: dto.tenantName.trim(),
            ...profileData,
          },
        });

        const store = await tx.store.create({
          data: {
            tenantId: tenant.id,
            name: storeName,
            code: 'NEG-01',
          },
        });

        const location = await tx.location.create({
          data: {
            tenantId: tenant.id,
            storeId: store.id,
            name: locationName,
            code: 'LOC-01',
            ...locationAddress,
          },
        });

        const owner = await tx.user.create({
          data: {
            tenantId: tenant.id,
            authUserId,
            email: ownerEmail,
            displayName: dto.ownerDisplayName.trim(),
            role: 'owner',
            stores: { create: { storeId: store.id } },
          },
        });

        return {
          tenantId: tenant.id,
          tenantName: tenant.name,
          ownerUserId: owner.id,
          ownerEmail: owner.email,
          ownerDisplayName: owner.displayName,
          storeId: store.id,
          storeName: store.name,
          locationId: location.id,
          locationName: location.name,
        };
      });
    } catch (error) {
      await this.supabase.deleteAuthUser(authUserId).catch(() => undefined);
      throw error;
    }
  }
}
