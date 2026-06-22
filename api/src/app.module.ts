import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { CustomersModule } from './customers/customers.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { TenantModule } from './tenant/tenant.module';
import { SalesOrdersModule } from './sales-orders/sales-orders.module';
import { ShopifyModule } from './shopify/shopify.module';
import { TikTokModule } from './tiktok/tiktok.module';
import { validateEnv } from './config/env.validation';
import { PlatformAdminModule } from './common/platform-admin/platform-admin.module';
import { HealthModule } from './health/health.module';
import { InventoryModule } from './inventory/inventory.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { SupplierOrdersModule } from './supplier-orders/supplier-orders.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    // Rate limiting globale (anti brute-force / DoS). 300 req/min per IP:
    // sufficiente per un operatore di gestionale, blocca abusi automatizzati.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PlatformAdminModule,
    PrismaModule,
    AuthModule,
    HealthModule,
    ProductsModule,
    InventoryModule,
    SupplierOrdersModule,
    CustomersModule,
    SalesOrdersModule,
    ShopifyModule,
    TikTokModule,
    DashboardModule,
    TenantModule,
    AdminModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
