import type { ParamMap } from '@angular/router';

import { MovementOrigin } from '@core/models/stock-movement.model';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

/**
 * Canale di vendita per l'export corrispettivi (omnichannel).
 * Distinto dal profilo tenant: un negozio Shopify può vendere anche in negozio
 * fisico o su altri marketplace online.
 */
export const CorrispettiviChannel = {
  /** Vendita al banco registrata nel gestionale. */
  Pos: 'pos',
  /** Ordini ecommerce sincronizzati da Shopify (importi reali). */
  Shopify: 'shopify',
  /** Vendite online registrate manualmente fuori da Shopify. */
  ExternalOnline: 'external_online',
  /** Ordini ecommerce sincronizzati da TikTok Shop. */
  Tiktok: 'tiktok',
} as const;

export type CorrispettiviChannel = (typeof CorrispettiviChannel)[keyof typeof CorrispettiviChannel];

const CHANNEL_VALUES = new Set<string>(Object.values(CorrispettiviChannel));

export const DEFAULT_CORRISPETTIVI_CHANNEL = CorrispettiviChannel.Pos;

export interface CorrispettiviExportConfig {
  readonly channel: CorrispettiviChannel;
  readonly kind: 'movements' | 'shopify';
  readonly origin?: MovementOrigin;
  readonly filePrefix: string;
}

export function parseCorrispettiviChannel(params: ParamMap): CorrispettiviChannel {
  const value = params.get('corrChannel') ?? '';
  return CHANNEL_VALUES.has(value)
    ? (value as CorrispettiviChannel)
    : DEFAULT_CORRISPETTIVI_CHANNEL;
}

/** Opzioni tipologia per la select in Report (registrazioni manuali nel gestionale). */
export function corrispettiviChannelOptions(): readonly SelectMenuOption[] {
  return [
    { value: CorrispettiviChannel.Pos, label: 'Negozio fisico' },
    {
      value: CorrispettiviChannel.ExternalOnline,
      label: 'Vendita online esterna',
    },
  ];
}

export function resolveCorrispettiviExport(
  channel: CorrispettiviChannel,
): CorrispettiviExportConfig {
  switch (channel) {
    case CorrispettiviChannel.Shopify:
      return {
        channel,
        kind: 'shopify',
        filePrefix: 'corrispettivi-shopify',
      };
    case CorrispettiviChannel.ExternalOnline:
      return {
        channel,
        kind: 'movements',
        origin: MovementOrigin.VestiflowOnline,
        filePrefix: 'corrispettivi-vendita-online-esterna',
      };
    case CorrispettiviChannel.Tiktok:
      return {
        channel,
        kind: 'movements',
        origin: MovementOrigin.Tiktok,
        filePrefix: 'corrispettivi-tiktok',
      };
    case CorrispettiviChannel.Pos:
    default:
      return {
        channel: CorrispettiviChannel.Pos,
        kind: 'movements',
        origin: MovementOrigin.VestiflowPos,
        filePrefix: 'corrispettivi-negozio-fisico',
      };
  }
}

export function corrispettiviChannelHint(channel: CorrispettiviChannel): string {
  switch (channel) {
    case CorrispettiviChannel.Shopify:
      return 'Ordini reali sincronizzati da Shopify, con importi corretti.';
    case CorrispettiviChannel.ExternalOnline:
      return 'Vendite e storni registrati manualmente su canali online esterni a Shopify. Usa il prezzo di vendita corrente della variante.';
    case CorrispettiviChannel.Tiktok:
      return 'Movimenti di vendita/reso con origine TikTok Shop.';
    case CorrispettiviChannel.Pos:
    default:
      return 'Vendite e storni registrati al banco nel negozio fisico. Usa il prezzo di vendita corrente della variante.';
  }
}
