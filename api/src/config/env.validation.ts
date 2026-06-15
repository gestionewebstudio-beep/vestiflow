import { plainToInstance } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUrl, Max, Min, validateSync } from 'class-validator';

/**
 * Variabili d'ambiente richieste dall'API. Validate all'avvio: una config
 * mancante o malformata deve far fallire il boot, non una request a runtime.
 * I valori reali vivono in .env (locale) o nelle variabili Railway (prod).
 */
export class EnvironmentVariables {
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  /** Connection string PostgreSQL (Supabase, pooler in produzione). */
  @IsString()
  DATABASE_URL!: string;

  /**
   * Origini CORS consentite, separate da virgola (es. http://localhost:4200).
   * Mai wildcard su endpoint con credenziali (regole-sicurezza).
   */
  @IsString()
  CORS_ORIGINS: string = 'http://localhost:4200';

  /** URL pubblico del progetto Supabase (verifica JWT). */
  @IsUrl({ require_tld: false })
  @IsOptional()
  SUPABASE_URL?: string;

  /** Service role key — SOLO backend, mai nel frontend (regole-sicurezza). */
  @IsString()
  @IsOptional()
  SUPABASE_SERVICE_ROLE_KEY?: string;

  /**
   * JWT secret (HS256) — Project Settings → API → JWT Settings → JWT Secret.
   * Verifica locale senza chiamata getUser. Se omesso, usa JWKS cacheato.
   */
  @IsString()
  @IsOptional()
  SUPABASE_JWT_SECRET?: string;

  /** Integrazione Shopify (opzionale — senza queste variabili OAuth/webhook restano disabilitati). */
  @IsString()
  @IsOptional()
  SHOPIFY_API_KEY?: string;

  @IsString()
  @IsOptional()
  SHOPIFY_API_SECRET?: string;

  @IsString()
  @IsOptional()
  SHOPIFY_API_VERSION?: string;

  @IsString()
  @IsOptional()
  SHOPIFY_SCOPES?: string;

  /** URL pubblico dell'API (es. https://xxx.railway.app o http://localhost:3000). */
  @IsString()
  @IsOptional()
  SHOPIFY_APP_URL?: string;

  @IsString()
  @IsOptional()
  SHOPIFY_OAUTH_CALLBACK_URL?: string;

  @IsString()
  @IsOptional()
  SHOPIFY_WEBHOOK_URL?: string;

  /** Chiave per cifrare i token OAuth a riposo (min 16 caratteri). */
  @IsString()
  @IsOptional()
  SHOPIFY_TOKEN_ENCRYPTION_KEY?: string;

  /** Redirect post-OAuth (frontend Angular). */
  @IsString()
  @IsOptional()
  FRONTEND_URL?: string;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const details = errors
      .map((error) => `${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`)
      .join('; ');
    throw new Error(`Configurazione ambiente non valida — ${details}`);
  }
  return validated;
}
