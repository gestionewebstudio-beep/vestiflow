import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantChannelProfile } from '@prisma/client';

import type { LocationLicenseSummaryDto } from '../inventory/location-licensing.service';
import { LocationLicensingService } from '../inventory/location-licensing.service';
import { SupabaseService } from '../auth/supabase.service';
import { isSupabaseOwnerEmailInviteEnabled } from '../auth/supabase-owner-provisioning.util';
import { assertTenantChannelProfileChangeAllowed } from '../common/tenant-channel-profile.util';
import { PlatformAdminService } from '../common/platform-admin/platform-admin.service';
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
import {
  TENANT_LICENSED_LOCATION_MIN,
} from '../common/tenant-location-license.constants';
import { deleteTenantData } from './tenant-delete.util';

@Injectable()
export class AdminTenantsService {
  private readonly logger = new Logger(AdminTenantsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
    private readonly platformAdmin: PlatformAdminService,
    private readonly config: ConfigService,
    private readonly locationLicensing: LocationLicensingService,
  ) {}

  async listTenants(): Promise<TenantSummaryDto[]> {
    const tenants = await this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        users: {
          orderBy: { createdAt: 'asc' },
          select: { email: true, displayName: true, createdAt: true },
        },
      },
    });

    return tenants
      .filter((tenant) => !this.isOperatorTenant(tenant.users))
      .map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        channelProfile: tenant.channelProfile,
        createdAt: tenant.createdAt.toISOString(),
        ownerEmail: tenant.users[0]?.email ?? null,
        ownerDisplayName: tenant.users[0]?.displayName ?? null,
        vatNumber: tenant.vatNumber,
      }));
  }

  /** Tenant di test/operatore: almeno un utente ha email platform admin. */
  private isOperatorTenant(users: readonly { email: string }[]): boolean {
    return users.some((user) => this.platformAdmin.isPlatformAdmin(user.email));
  }

  private async assertProvisionedClientTenant(tenantId: string): Promise<void> {
    const users = await this.prisma.user.findMany({
      where: { tenantId },
      select: { email: true },
    });

    if (this.isOperatorTenant(users)) {
      throw new NotFoundException('Cliente non trovato');
    }
  }

  async getTenantById(tenantId: string): Promise<TenantDetailDto> {
    await this.assertProvisionedClientTenant(tenantId);

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        users: {
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
    const licenseSummary = await this.locationLicensing.getSummary(tenantId);
    const activeLocationRows = await this.prisma.location.findMany({
      where: { tenantId, licensedInVf: true },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        code: true,
        isActive: true,
        shopifyLocationId: true,
      },
    });

    return {
      id: tenant.id,
      name: tenant.name,
      channelProfile: tenant.channelProfile,
      licensedLocationCount: licenseSummary.licensedLocationCount,
      licensedLocationActiveCount: licenseSummary.licensedLocationActiveCount,
      locationSelectionLocked: licenseSummary.locationSelectionLocked,
      locationSelectionChangeGranted: licenseSummary.locationSelectionChangeGranted,
      canChangeLicensedLocations: licenseSummary.canChangeLicensedLocations,
      createdAt: tenant.createdAt.toISOString(),
      profile: {
        legalName: tenant.legalName,
        vatNumber: tenant.vatNumber,
        fiscalCode: tenant.fiscalCode,
        phone: tenant.phone,
        pec: tenant.pec,
        sdiCode: tenant.sdiCode,
        iban: tenant.iban,
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
            role: owner.role,
          }
        : null,
      store: store ? { id: store.id, name: store.name } : null,
      activeLocations: activeLocationRows.map((row) => ({
        id: row.id,
        name: row.name,
        code: row.code,
        isActive: row.isActive,
        shopifyLocationId: row.shopifyLocationId,
      })),
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
    await this.assertProvisionedClientTenant(tenantId);

    const existing = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        users: { orderBy: { createdAt: 'asc' }, take: 1 },
        stores: { orderBy: { createdAt: 'asc' }, take: 1 },
        locations: { orderBy: { createdAt: 'asc' }, take: 1 },
      },
    });

    if (!existing) {
      throw new NotFoundException('Cliente non trovato');
    }

    if (dto.channelProfile) {
      await assertTenantChannelProfileChangeAllowed(this.prisma, tenantId, dto.channelProfile);
    }

    if (dto.licensedLocationCount !== undefined) {
      this.locationLicensing.assertLicensedLocationCount(dto.licensedLocationCount);
    }

    const profileUpdate = tenantProfileReplaceData(dto);
    const locationAddress = locationAddressFromProfile(dto);

    await this.prisma.$transaction(async (tx) => {
      await tx.tenant.update({
        where: { id: tenantId },
        data: {
          ...(dto.tenantName ? { name: dto.tenantName.trim() } : {}),
          ...(dto.channelProfile ? { channelProfile: dto.channelProfile } : {}),
          ...(dto.licensedLocationCount !== undefined
            ? { licensedLocationCount: dto.licensedLocationCount }
            : {}),
          ...profileUpdate,
        },
      });

      if (dto.licensedLocationCount !== undefined) {
        await this.locationLicensing.applyAdminLicensedLocationLimit(
          tenantId,
          dto.licensedLocationCount,
          tx,
        );
      }

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

  async deleteTenant(tenantId: string): Promise<void> {
    await this.assertProvisionedClientTenant(tenantId);

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        users: { select: { authUserId: true } },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Cliente non trovato');
    }

    const authUserIds = tenant.users
      .map((user) => user.authUserId)
      .filter((id): id is string => Boolean(id));

    await this.prisma.$transaction(async (tx) => {
      await deleteTenantData(tx, tenantId);
    });

    if (this.supabase.isConfigured()) {
      await Promise.all(
        authUserIds.map((authUserId) =>
          this.supabase.deleteAuthUser(authUserId).catch(() => undefined),
        ),
      );
    }
  }

  async createTenant(dto: CreateTenantDto): Promise<ProvisionedTenantDto> {
    if (!this.supabase.isConfigured()) {
      throw new BadRequestException(
        'Supabase non configurato: impossibile creare credenziali di accesso',
      );
    }

    const ownerEmail = dto.ownerEmail.trim().toLowerCase();
    if (this.platformAdmin.isPlatformAdmin(ownerEmail)) {
      throw new BadRequestException('Non puoi provisionare un cliente con email Admin Vestiflow');
    }
    const role = dto.role ?? 'owner';
    const channelProfile = dto.channelProfile ?? TenantChannelProfile.shopify;
    const storeName = dto.storeName?.trim() || 'Negozio principale';
    const locationName =
      channelProfile === TenantChannelProfile.shopify
        ? 'Sede temporanea'
        : dto.locationName?.trim() || storeName;
    const profileData = tenantProfileCreateData(dto);
    const locationAddress = locationAddressFromProfile(dto);
    const licensedLocationCount = dto.licensedLocationCount ?? TENANT_LICENSED_LOCATION_MIN;
    this.locationLicensing.assertLicensedLocationCount(licensedLocationCount);

    const existingAppUser = await this.prisma.user.findFirst({
      where: { email: { equals: ownerEmail, mode: 'insensitive' } },
    });
    if (existingAppUser) {
      throw new ConflictException('Esiste già un utente con questa email');
    }

    const redirectTo = this.buildOwnerInviteRedirectUrl();
    const ownerInviteEnabled = isSupabaseOwnerEmailInviteEnabled(this.config);
    let authUserId: string;
    let ownerInviteSent = false;

    if (ownerInviteEnabled) {
      try {
        const provisioned = await this.supabase.provisionAuthUserForInvite(ownerEmail, redirectTo);
        authUserId = provisioned.authUserId;
        ownerInviteSent = provisioned.inviteSent;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'INVITE_FAILED';
        if (message === 'EMAIL_ALREADY_REGISTERED') {
          throw new ConflictException(
            'Email già registrata in Supabase Auth. Elimina l’utente da Supabase → Authentication → Users oppure usa un’altra email.',
          );
        }
        if (message === 'EMAIL_RATE_LIMIT') {
          throw new HttpException(
            'Limite invii email Supabase raggiunto (piano free: ~2/ora). Attendi un’ora o configura SMTP custom in Supabase.',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        if (message === 'REDIRECT_NOT_ALLOWED') {
          throw new BadRequestException(
            'Redirect URL non autorizzato in Supabase. Aggiungi /login/reset-password in Authentication → URL Configuration.',
          );
        }
        this.logger.error(`Invio invito fallito per ${ownerEmail}: ${message}`);
        throw new InternalServerErrorException('Invio invito accesso non riuscito');
      }
    } else {
      const ownerPassword = dto.ownerPassword?.trim();
      if (!ownerPassword) {
        throw new BadRequestException('Password iniziale obbligatoria');
      }
      try {
        authUserId = await this.supabase.createAuthUser(ownerEmail, ownerPassword);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'CREATION_FAILED';
        if (message === 'EMAIL_ALREADY_REGISTERED') {
          throw new ConflictException('Email già registrata in Supabase Auth');
        }
        this.logger.error(`Creazione utente Auth fallita per ${ownerEmail}: ${message}`);
        throw new InternalServerErrorException('Creazione utente di accesso non riuscita');
      }
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: {
            name: dto.tenantName.trim(),
            channelProfile,
            licensedLocationCount,
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
            licensedInVf: channelProfile !== TenantChannelProfile.shopify,
            ...locationAddress,
          },
        });

        const owner = await tx.user.create({
          data: {
            tenantId: tenant.id,
            authUserId,
            email: ownerEmail,
            displayName: dto.ownerDisplayName.trim(),
            role,
            stores: { create: { storeId: store.id } },
          },
        });

        return {
          tenantId: tenant.id,
          tenantName: tenant.name,
          channelProfile: tenant.channelProfile,
          ownerUserId: owner.id,
          ownerEmail: owner.email,
          ownerDisplayName: owner.displayName,
          role: owner.role,
          storeId: store.id,
          storeName: store.name,
          locationId: location.id,
          locationName: location.name,
          ownerInviteSent,
        };
      });
    } catch (error) {
      await this.supabase.deleteAuthUser(authUserId).catch(() => undefined);
      throw error;
    }
  }

  async grantLocationSelectionChange(tenantId: string): Promise<LocationLicenseSummaryDto> {
    await this.assertProvisionedClientTenant(tenantId);
    return this.locationLicensing.grantLocationSelectionChange(tenantId);
  }

  async resendOwnerInvite(tenantId: string): Promise<{ readonly ownerEmail: string }> {
    if (!isSupabaseOwnerEmailInviteEnabled(this.config)) {
      throw new BadRequestException(
        'Invito email disabilitato: imposta SUPABASE_OWNER_EMAIL_INVITE=true su Railway oppure reimposta la password da Supabase.',
      );
    }
    if (!this.supabase.isConfigured()) {
      throw new BadRequestException(
        'Supabase non configurato: impossibile inviare inviti di accesso',
      );
    }

    const tenant = await this.getTenantById(tenantId);
    const ownerEmail = tenant.owner?.email;
    if (!ownerEmail) {
      throw new NotFoundException('Utente titolare non trovato per questo cliente');
    }

    try {
      await this.supabase.resendAuthInvite(ownerEmail, this.buildOwnerInviteRedirectUrl());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'INVITE_FAILED';
      if (message === 'EMAIL_RATE_LIMIT') {
        throw new HttpException(
          'Limite invii email Supabase raggiunto (piano free: ~2/ora). Attendi un’ora o configura SMTP custom in Supabase.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      this.logger.error(`Reinvio invito fallito per ${ownerEmail}: ${message}`);
      throw new InternalServerErrorException('Reinvio invito accesso non riuscito');
    }

    return { ownerEmail };
  }

  private buildOwnerInviteRedirectUrl(): string {
    const base = (this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:4200').replace(
      /\/$/,
      '',
    );
    return `${base}/login/reset-password`;
  }
}
