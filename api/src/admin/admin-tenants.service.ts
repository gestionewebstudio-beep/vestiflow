import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import { SupabaseService } from '../auth/supabase.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateTenantDto } from './dto/create-tenant.dto';
import type { ProvisionedTenantDto } from './dto/provisioned-tenant.dto';
import type { TenantSummaryDto } from './dto/tenant-summary.dto';

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
    }));
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
          data: { name: dto.tenantName.trim() },
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
            countryCode: 'IT',
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
