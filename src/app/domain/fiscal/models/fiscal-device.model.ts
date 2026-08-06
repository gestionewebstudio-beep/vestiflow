// Dispositivo fiscale (stampante RT) configurato su una sede. Fondazione del
// modulo cassa fiscale: la configurazione vive qui, l'emissione del documento
// commerciale arriverà col driver di stampa (Tranche 2).

import type { EntityId, IsoDateString } from '@core/models/common.model';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

export type FiscalDeviceBrand = 'epson' | 'custom' | 'rch' | 'olivetti' | 'other';

/** Mappa aliquota IVA → reparto configurato a bordo stampante. */
export interface FiscalVatDepartment {
  readonly ratePercent: number;
  readonly department: number;
}

export interface FiscalDevice {
  readonly locationId: EntityId;
  readonly locationName: string;
  readonly brand: FiscalDeviceBrand;
  readonly model: string | null;
  /** Endpoint LAN della stampante (es. `https://192.168.1.50`). */
  readonly endpoint: string;
  /** Matricola fiscale (finisce sul documento commerciale). */
  readonly serialNumber: string | null;
  readonly enabled: boolean;
  readonly vatDepartments: readonly FiscalVatDepartment[] | null;
  readonly notes: string | null;
  readonly lastSeenAt: IsoDateString | null;
  readonly lastError: string | null;
  readonly updatedAt: IsoDateString;
}

export interface UpsertFiscalDevicePayload {
  readonly brand: FiscalDeviceBrand;
  readonly model?: string;
  readonly endpoint: string;
  readonly serialNumber?: string;
  readonly enabled?: boolean;
  readonly vatDepartments?: readonly FiscalVatDepartment[];
  readonly notes?: string;
}

const FISCAL_DEVICE_BRAND_LABELS: Record<FiscalDeviceBrand, string> = {
  epson: 'Epson',
  custom: 'Custom',
  rch: 'RCH',
  olivetti: 'Olivetti',
  other: 'Altra marca',
};

export function isFiscalDeviceBrand(value: string): value is FiscalDeviceBrand {
  return value in FISCAL_DEVICE_BRAND_LABELS;
}

/** Etichetta leggibile della marca; il valore grezzo se non riconosciuta. */
export function fiscalDeviceBrandLabel(value: string): string {
  return isFiscalDeviceBrand(value) ? FISCAL_DEVICE_BRAND_LABELS[value] : value;
}

export const FISCAL_DEVICE_BRAND_OPTIONS: readonly SelectMenuOption[] = Object.entries(
  FISCAL_DEVICE_BRAND_LABELS,
).map(([value, label]) => ({ value, label }));
