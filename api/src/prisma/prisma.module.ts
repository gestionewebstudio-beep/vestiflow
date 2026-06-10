import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';

/** Globale: il client DB serve a (quasi) tutti i moduli. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
