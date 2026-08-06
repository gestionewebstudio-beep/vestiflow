// Terminali di pagamento (POS) per l'adempimento 2026 del collegamento
// logico POS ↔ strumento di certificazione. L'associazione si fa SUL PORTALE
// dall'esercente: qui si tracciano terminali, finestre e stato.

import type { EntityId, IsoDateString } from '@core/models/common.model';

export type PosPortalStatus = 'linked' | 'upcoming' | 'open' | 'overdue';

export interface PosTerminal {
  readonly id: EntityId;
  readonly locationId: EntityId;
  readonly locationName: string;
  readonly terminalId: string;
  readonly acquirerName: string;
  readonly description: string | null;
  readonly activatedAt: IsoDateString;
  readonly portalLinkedAt: IsoDateString | null;
  readonly notes: string | null;
  readonly portalWindowFrom: IsoDateString;
  readonly portalWindowTo: IsoDateString;
  readonly portalStatus: PosPortalStatus;
}

export interface CreatePosTerminalPayload {
  readonly locationId: EntityId;
  readonly terminalId: string;
  readonly acquirerName: string;
  readonly description?: string;
  readonly activatedAt: IsoDateString;
  readonly notes?: string;
}

export interface UpdatePosTerminalPayload {
  readonly locationId?: EntityId;
  readonly acquirerName?: string;
  readonly description?: string;
  readonly activatedAt?: IsoDateString;
  readonly portalLinked?: boolean;
  readonly notes?: string;
}

const POS_PORTAL_STATUS_LABELS: Record<PosPortalStatus, string> = {
  linked: 'Comunicato',
  upcoming: 'Finestra futura',
  open: 'Da comunicare ORA',
  overdue: 'IN RITARDO',
};

export function posPortalStatusLabel(status: PosPortalStatus): string {
  return POS_PORTAL_STATUS_LABELS[status];
}
