import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Client Prisma come provider Nest: una sola istanza, connessa al boot e
 * chiusa allo shutdown. Tutto l'accesso al DB passa da qui (query
 * parametrizzate by design, regole-sicurezza).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      transactionOptions: {
        // Supabase pooler: attesa connessione libera con richieste concorrenti (E2E, sync).
        maxWait: 10_000,
        timeout: 30_000,
      },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
