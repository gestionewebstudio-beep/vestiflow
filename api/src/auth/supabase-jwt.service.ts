import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

/**
 * Verifica locale dei JWT Supabase Auth (nessuna chiamata HTTP per getUser).
 * Preferisce HS256 con JWT secret; fallback JWKS (chiavi scaricate e cacheate da jose).
 */
@Injectable()
export class SupabaseJwtService {
  private readonly issuer: string | undefined;
  private readonly hs256Secret: Uint8Array | undefined;
  private readonly jwks: JWTVerifyGetKey | undefined;

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('SUPABASE_URL');
    if (url) {
      this.issuer = `${url.replace(/\/$/, '')}/auth/v1`;
      const jwtSecret = this.config.get<string>('SUPABASE_JWT_SECRET');
      if (jwtSecret) {
        this.hs256Secret = new TextEncoder().encode(jwtSecret);
      }
      this.jwks = createRemoteJWKSet(new URL(`${this.issuer}/.well-known/jwks.json`));
    }
  }

  isConfigured(): boolean {
    return Boolean(this.issuer && (this.hs256Secret || this.jwks));
  }

  /** Estrae `sub` (auth user id) se il token è valido e non scaduto. */
  async verifyAccessToken(accessToken: string): Promise<string | null> {
    if (!this.issuer || (!this.hs256Secret && !this.jwks)) {
      return null;
    }

    try {
      const { payload } = this.hs256Secret
        ? await jwtVerify(accessToken, this.hs256Secret, {
            issuer: this.issuer,
            audience: 'authenticated',
          })
        : await jwtVerify(accessToken, this.jwks!, {
            issuer: this.issuer,
            audience: 'authenticated',
          });
      return typeof payload.sub === 'string' ? payload.sub : null;
    } catch {
      return null;
    }
  }
}
