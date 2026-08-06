import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { PaymentOption, PaymentOptionKind } from '@prisma/client';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CUSTOMERS_VIEW_PERMISSIONS,
  DOCUMENTS_VIEW_PERMISSIONS,
  SUPPLIER_ORDERS_VIEW_PERMISSIONS,
  TenantPermission,
} from '../auth/tenant-permission.constants';
import {
  RequireAnyPermissions,
  RequirePermissions,
} from '../common/auth/tenant-permissions.decorator';
import { TenantPermissionsGuard } from '../common/auth/tenant-permissions.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import { CreatePaymentOptionDto, UpdatePaymentOptionDto } from './dto/payment-option.dto';
import { PaymentOptionsService } from './payment-options.service';

/** Lettura consentita a chi gestisce anagrafiche o compila documenti. */
const PAYMENT_OPTIONS_READ_PERMISSIONS = [
  ...CUSTOMERS_VIEW_PERMISSIONS,
  ...SUPPLIER_ORDERS_VIEW_PERMISSIONS,
  ...DOCUMENTS_VIEW_PERMISSIONS,
] as const;

@Controller('payment-options')
@UseGuards(JwtAuthGuard, TenantPermissionsGuard)
export class PaymentOptionsController {
  constructor(private readonly paymentOptions: PaymentOptionsService) {}

  @Get()
  @RequireAnyPermissions(PAYMENT_OPTIONS_READ_PERMISSIONS)
  list(
    @CurrentTenant() tenantId: string,
    @Query('kind') kind?: PaymentOptionKind,
  ): Promise<PaymentOption[]> {
    const filter = kind === 'method' || kind === 'terms' ? kind : undefined;
    return this.paymentOptions.list(tenantId, filter);
  }

  @Post()
  @RequirePermissions(TenantPermission.SettingsCompany)
  create(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreatePaymentOptionDto,
  ): Promise<PaymentOption> {
    return this.paymentOptions.create(tenantId, dto.kind, dto.name);
  }

  @Patch(':id')
  @RequirePermissions(TenantPermission.SettingsCompany)
  update(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePaymentOptionDto,
  ): Promise<PaymentOption> {
    return this.paymentOptions.update(tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(TenantPermission.SettingsCompany)
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.paymentOptions.delete(tenantId, id);
  }
}
