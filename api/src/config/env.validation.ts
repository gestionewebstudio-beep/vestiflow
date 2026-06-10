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

  /** URL pubblico del progetto Supabase (per la verifica JWT, step auth). */
  @IsUrl({ require_tld: false })
  @IsOptional()
  SUPABASE_URL?: string;
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
