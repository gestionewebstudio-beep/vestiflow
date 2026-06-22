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

  /**
   * Email degli operatori VestiFlow che possono creare tenant (onboarding clienti).
   * Separate da virgola, confronto case-insensitive.
   */
  @IsString()
  @IsOptional()
  PLATFORM_ADMIN_EMAILS?: string;

  /** Bucket Supabase Storage per immagini prodotto (public). Default: product-media */
  @IsString()
  @IsOptional()
  SUPABASE_PRODUCT_MEDIA_BUCKET?: string;

  /** Bucket Supabase Storage public per foto profilo utente. Default: user-avatars */
  @IsString()
  @IsOptional()
  SUPABASE_USER_AVATARS_BUCKET?: string;

  /** Integrazione TikTok Shop (opzionale — senza queste variabili OAuth resta disabilitato). */
  @IsString()
  @IsOptional()
  TIKTOK_APP_KEY?: string;

  @IsString()
  @IsOptional()
  TIKTOK_APP_SECRET?: string;

  @IsString()
  @IsOptional()
  TIKTOK_SERVICE_ID?: string;

  @IsString()
  @IsOptional()
  TIKTOK_API_BASE_URL?: string;

  @IsString()
  @IsOptional()
  TIKTOK_AUTH_BASE_URL?: string;

  @IsString()
  @IsOptional()
  TIKTOK_AUTHORIZE_BASE_URL?: string;

  @IsString()
  @IsOptional()
  TIKTOK_API_VERSION?: string;

  @IsString()
  @IsOptional()
  TIKTOK_APP_URL?: string;

  @IsString()
  @IsOptional()
  TIKTOK_OAUTH_CALLBACK_URL?: string;

  @IsString()
  @IsOptional()
  TIKTOK_TOKEN_ENCRYPTION_KEY?: string;

  /** Categoria TikTok di default se il prodotto non ne ha una (id Partner API). */
  @IsString()
  @IsOptional()
  TIKTOK_DEFAULT_CATEGORY_ID?: string;
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
