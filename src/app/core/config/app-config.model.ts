// Configurazione applicativa: SOLO valori pubblici (inclusi nel bundle JS).
// VIETATO inserire qui segreti/token (regole-sicurezza). I valori reali vivono
// in src/environments/* e, in produzione, nelle env del provider.

/** Feature flags pubblici. */
export interface FeatureFlags {
  readonly barcodeScanner: boolean;
  readonly shopify: boolean;
}

/** Config pubblica Supabase (anon key — ok nel bundle con restrizioni referrer). */
export interface SupabasePublicConfig {
  readonly url: string;
  readonly anonKey: string;
}

/** Config applicativa pubblica, iniettata via APP_CONFIG. */
export interface AppConfig {
  readonly production: boolean;
  readonly appName: string;
  /** Base URL del backend (solo origine fidata, nessuna credenziale). */
  readonly apiBaseUrl: string;
  /** Se presente, auth via Supabase; altrimenti fallback mock (solo dev). */
  readonly supabase?: SupabasePublicConfig;
  readonly features: FeatureFlags;
}
