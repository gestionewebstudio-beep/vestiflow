import type { EntityId, IsoDateString } from '@core/models/common.model';

/** Canale origine dell'impegno (allineato all'API: SalesOrderSource). */
export type ReservationChannel = 'shopify_online' | 'shopify_pos' | 'manual';

/** Ordine che compone la quantità Impegnata di una variante × location (§10 fase 1). */
export interface StockReservationRow {
  readonly id: EntityId;
  readonly orderNumber: string;
  readonly channel: ReservationChannel;
  readonly quantity: number;
  readonly sku: string;
  readonly locationName: string;
  readonly placedAt: IsoDateString;
  readonly createdAt: IsoDateString;
}

const CHANNEL_LABELS: Record<ReservationChannel, string> = {
  shopify_online: 'Shopify',
  shopify_pos: 'Shopify POS',
  manual: 'Manuale',
};

export function reservationChannelLabel(channel: ReservationChannel): string {
  return CHANNEL_LABELS[channel] ?? channel;
}
