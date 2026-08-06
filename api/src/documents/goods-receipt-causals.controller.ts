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
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  DOCUMENTS_VIEW_PERMISSIONS,
  TenantPermission,
} from '../auth/tenant-permission.constants';
import {
  RequireAnyPermissions,
  RequirePermissions,
} from '../common/auth/tenant-permissions.decorator';
import { TenantPermissionsGuard } from '../common/auth/tenant-permissions.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';
import {
  CreateGoodsReceiptCausalDto,
  ReorderGoodsReceiptCausalsDto,
  UpdateGoodsReceiptCausalDto,
} from './dto/goods-receipt-causal.dto';
import { GoodsReceiptCausalsService } from './goods-receipt-causals.service';

@Controller('goods-receipt-causals')
@UseGuards(JwtAuthGuard, TenantPermissionsGuard)
export class GoodsReceiptCausalsController {
  constructor(private readonly causals: GoodsReceiptCausalsService) {}

  @Get()
  @RequireAnyPermissions(DOCUMENTS_VIEW_PERMISSIONS)
  list(@CurrentTenant() tenantId: string) {
    return this.causals.list(tenantId);
  }

  @Post()
  @RequirePermissions(TenantPermission.DocumentsManage)
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateGoodsReceiptCausalDto) {
    return this.causals.create(tenantId, dto);
  }

  @Post('reorder')
  @RequirePermissions(TenantPermission.DocumentsManage)
  reorder(@CurrentTenant() tenantId: string, @Body() dto: ReorderGoodsReceiptCausalsDto) {
    return this.causals.reorder(tenantId, dto.orderedIds);
  }

  @Patch(':id')
  @RequirePermissions(TenantPermission.DocumentsManage)
  update(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGoodsReceiptCausalDto,
  ) {
    return this.causals.update(tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(TenantPermission.DocumentsManage)
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.causals.delete(tenantId, id);
  }
}
