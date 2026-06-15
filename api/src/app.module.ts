import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from './auth/auth.module';
import { CustomersModule } from './customers/customers.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { SalesOrdersModule } from './sales-orders/sales-orders.module';
import { ShopifyModule } from './shopify/shopify.module';
import { validateEnv } from './config/env.validation';
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
    PrismaModule,
    AuthModule,
    HealthModule,
    ProductsModule,
    InventoryModule,
    SupplierOrdersModule,
    CustomersModule,
    SalesOrdersModule,
    ShopifyModule,
    DashboardModule,
  ],
})
export class AppModule {}
