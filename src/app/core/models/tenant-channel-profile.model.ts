import type { BadgeTone } from '@shared/components/badge/badge.component';

/** Profilo canale scelto in provisioning piattaforma (allineato a Prisma `TenantChannelProfile`). */
export const TenantChannelProfile = {
  Gestionale: 'gestionale',
  Shopify: 'shopify',
  TikTokShop: 'tiktok_shop',
} as const;

export type TenantChannelProfile = (typeof TenantChannelProfile)[keyof typeof TenantChannelProfile];

export interface TenantChannelProfileOption {
  readonly value: TenantChannelProfile;
  readonly label: string;
  readonly description: string;
}

export const TENANT_CHANNEL_PROFILE_OPTIONS: readonly TenantChannelProfileOption[] = [
  {
    value: TenantChannelProfile.Gestionale,
    label: 'Solo gestionale',
    description: 'Magazzino, prodotti e ordini fornitori senza integrazione ecommerce.',
  },
  {
    value: TenantChannelProfile.Shopify,
    label: 'Shopify',
    description: 'Il cliente collega lo shop Shopify da Impostazioni.',
  },
  {
    value: TenantChannelProfile.TikTokShop,
    label: 'TikTok Shop (in manutenzione)',
    description:
      'Integrazione in preparazione: il cliente vedrà TikTok Shop in Impostazioni quando sarà disponibile.',
  },
];

const PROFILE_LABELS: Record<TenantChannelProfile, string> = {
  [TenantChannelProfile.Gestionale]: 'Solo gestionale',
  [TenantChannelProfile.Shopify]: 'Shopify',
  [TenantChannelProfile.TikTokShop]: 'TikTok Shop',
};

export function tenantChannelProfileLabel(profile: TenantChannelProfile): string {
  return PROFILE_LABELS[profile];
}

/** Allineato al badge «Fonte» in catalogo prodotti (`catalogOriginTone`). */
export function tenantChannelProfileBadgeTone(profile: TenantChannelProfile): BadgeTone {
  switch (profile) {
    case TenantChannelProfile.Shopify:
      return 'info';
    case TenantChannelProfile.Gestionale:
      return 'vestiflow';
    default:
      return 'neutral';
  }
}

export function showShopifyIntegration(profile: TenantChannelProfile | undefined): boolean {
  return profile === TenantChannelProfile.Shopify;
}

export function showTikTokIntegration(profile: TenantChannelProfile | undefined): boolean {
  return profile === TenantChannelProfile.TikTokShop;
}

/** Vendita/storno al banco (tutti i profili canale). */
export function showRetailSalesRegister(profile: TenantChannelProfile | undefined): boolean {
  return (
    profile === TenantChannelProfile.Gestionale ||
    profile === TenantChannelProfile.Shopify ||
    profile === TenantChannelProfile.TikTokShop
  );
}

/**
 * Vendite online registrate manualmente fuori dal canale ecommerce integrato
 * (es. Amazon, eBay). Con Shopify le vendite online/POS arrivano dalla sync;
 * con TikTok Shop resta per marketplace esterni oltre al canale integrato.
 */
export function showOnlineSalesRegister(profile: TenantChannelProfile | undefined): boolean {
  return profile === TenantChannelProfile.Gestionale || profile === TenantChannelProfile.TikTokShop;
}

/** Etichetta sidebar per la registrazione vendite online manuali. */
export function onlineSalesRegisterLabel(profile: TenantChannelProfile | undefined): string {
  if (profile === TenantChannelProfile.Gestionale) {
    return 'Registra vendita online';
  }
  return 'Registra vendita online esterna';
}

/**
 * Etichetta breve vendite online manuali (filtri, origini movimento, corrispettivi).
 * Con profilo solo gestionale non serve distinguere da Shopify.
 */
export function onlineSalesChannelLabel(profile: TenantChannelProfile | undefined): string {
  if (profile === TenantChannelProfile.Gestionale) {
    return 'Vendita online';
  }
  return 'Vendita online esterna';
}

/** Hint export corrispettivi per vendite online manuali. */
export function onlineSalesCorrispettiviHint(profile: TenantChannelProfile | undefined): string {
  if (profile === TenantChannelProfile.Gestionale) {
    return 'Vendite e storni registrati online nel gestionale. Usa il prezzo di vendita corrente della variante.';
  }
  return 'Vendite e storni registrati manualmente su canali online esterni a Shopify. Usa il prezzo di vendita corrente della variante.';
}

/** Sottotitolo pagina Report. */
export function reportPageSubtitle(profile: TenantChannelProfile | undefined): string {
  if (profile === TenantChannelProfile.Gestionale) {
    return 'Analytics commerciali, export corrispettivi e snapshot magazzino.';
  }
  return 'Analytics commerciali, corrispettivi manuali e giacenze per location.';
}

/** Hint pannello Sede fisica in Impostazioni. */
export function tenantCompanyPanelHint(profile: TenantChannelProfile | undefined): string {
  if (showShopifyIntegration(profile)) {
    return 'Anagrafica registrata in VestiFlow dall’operatore. Identifica l’azienda del cliente ed è indipendente dalle sedi operative collegate a Shopify.';
  }
  return 'Anagrafica registrata in VestiFlow dall’operatore. Identifica l’azienda del cliente ed è indipendente dalle sedi operative del magazzino.';
}

export function productImportIntro(profile: TenantChannelProfile | undefined): string {
  if (showShopifyIntegration(profile)) {
    return 'Carica un file CSV in formato Shopify. VestiFlow valida righe e SKU, crea prodotti e varianti nel gestionale e tenta la sincronizzazione con Shopify se collegato.';
  }
  return 'Carica un file CSV prodotti. VestiFlow valida righe e SKU e crea prodotti e varianti nel gestionale.';
}

export function productImportFormatHint(profile: TenantChannelProfile | undefined): string {
  return showShopifyIntegration(profile)
    ? 'Formato Shopify · max 15 MB · UTF-8'
    : 'CSV prodotti · max 15 MB · UTF-8';
}

/** Frammento intro step opzioni prodotto (asse Taglia/Colore). */
export function productOptionsStandardLabel(profile: TenantChannelProfile | undefined): string {
  return showShopifyIntegration(profile) ? 'standard Shopify' : 'Taglia e Colore';
}

export function businessAnalyticsPricingHint(profile: TenantChannelProfile | undefined): string {
  if (showShopifyIntegration(profile)) {
    return 'Le vendite manuali usano il prezzo di vendita corrente; Shopify usa importi ordine.';
  }
  return 'Le vendite manuali usano il prezzo di vendita corrente al momento della registrazione.';
}

export function businessAnalyticsRevenueHint(profile: TenantChannelProfile | undefined): string {
  return showShopifyIntegration(profile)
    ? 'Shopify + vendite manuali (pagate)'
    : 'Vendite negozio e online (pagate)';
}

export function inventoryCountCloseHint(profile: TenantChannelProfile | undefined): string {
  return showShopifyIntegration(profile)
    ? 'tracciate e, se collegato, le giacenze verranno sincronizzate con Shopify.'
    : 'tracciate e le giacenze verranno aggiornate nel gestionale.';
}

export function corrispettiviReportSubtitle(profile: TenantChannelProfile | undefined): string {
  if (showShopifyIntegration(profile)) {
    return 'Riepilogo vendite online Shopify con stati fiscali, export e storico consegne. Le vendite POS sono escluse (gestite da cassa).';
  }
  return 'Riepilogo vendite online registrate nel gestionale, con stati fiscali, export e storico consegne. Le vendite POS sono escluse (gestite da cassa).';
}

export function corrispettiviReportFilterSubtitle(
  profile: TenantChannelProfile | undefined,
): string {
  return showShopifyIntegration(profile)
    ? 'Filtra vendite Shopify per periodo. Di default mostra solo vendite online.'
    : 'Filtra vendite online per periodo. Di default mostra solo vendite online.';
}

export function corrispettiviReportEmptyHint(profile: TenantChannelProfile | undefined): string {
  return showShopifyIntegration(profile)
    ? 'Modifica i filtri o sincronizza le vendite da Shopify.'
    : 'Modifica i filtri o registra vendite online nel gestionale.';
}

export function userGuidePageIntro(profile: TenantChannelProfile | undefined): string {
  if (showShopifyIntegration(profile)) {
    return 'Manuale del gestionale: menu, Shopify, prodotti, magazzino, ordini, vendite e clienti.';
  }
  if (showTikTokIntegration(profile)) {
    return 'Manuale del gestionale: menu, TikTok Shop, prodotti, magazzino, ordini e vendite.';
  }
  return 'Manuale del gestionale: prodotti, magazzino, documenti, ordini fornitore e vendite al banco.';
}

/** Lista ordini sincronizzati da canale ecommerce (oggi solo Shopify). */
export function showSalesOrderHistory(profile: TenantChannelProfile | undefined): boolean {
  return profile === TenantChannelProfile.Shopify;
}
