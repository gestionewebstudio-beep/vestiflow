import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Identifica gli operatori VestiFlow autorizzati a provisionare tenant (onboarding
 * clienti). Lista da variabile d'ambiente PLATFORM_ADMIN_EMAILS, non ruolo DB.
 */
@Injectable()
export class PlatformAdminService {
  private readonly adminEmails: readonly string[];

  constructor(private readonly config: ConfigService) {
    const raw = this.config.get<string>('PLATFORM_ADMIN_EMAILS') ?? '';
    this.adminEmails = raw
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
  }

  isPlatformAdmin(email: string): boolean {
    if (this.adminEmails.length === 0) {
      return false;
    }
    return this.adminEmails.includes(email.trim().toLowerCase());
  }
}
