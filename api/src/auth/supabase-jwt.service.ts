import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

import type { VerifiedAccessToken } from './verified-access-token.model';

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

  /** Verifica JWT Supabase Auth e ne estrae identità + livello MFA (`aal`). */
  async verifyAccessToken(accessToken: string): Promise<VerifiedAccessToken | null> {
    if (!this.issuer || (!this.hs256Secret && !this.jwks)) {
      return null;
    }

    const verifyOptions = {
      issuer: this.issuer,
      audience: 'authenticated' as const,
    };

    // Supabase recente emette JWT ES256 (JWKS). I progetti legacy usano HS256
    // con JWT secret: proviamo entrambi (HS256 prima, poi JWKS se fallisce).
    if (this.hs256Secret) {
      try {
        const { payload } = await jwtVerify(accessToken, this.hs256Secret, verifyOptions);
        return this.toVerifiedAccessToken(payload);
      } catch {
        // Token asimmetrico o secret non allineato: fallback JWKS sotto.
      }
    }

    if (this.jwks) {
      try {
        const { payload } = await jwtVerify(accessToken, this.jwks, verifyOptions);
        return this.toVerifiedAccessToken(payload);
      } catch {
        return null;
      }
    }

    return null;
  }

  private toVerifiedAccessToken(payload: {
    sub?: unknown;
    aal?: unknown;
  }): VerifiedAccessToken | null {
    if (typeof payload.sub !== 'string') {
      return null;
    }

    return {
      authUserId: payload.sub,
      assuranceLevel: payload.aal === 'aal2' ? 'aal2' : 'aal1',
    };
  }
}
