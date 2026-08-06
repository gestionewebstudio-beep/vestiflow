import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { formatDate } from '@core/utils/date.util';
import { formatMoney } from '@core/utils/money.util';

import type { CorrispettiviDelivery } from '../../models/corrispettivi.model';

const CHANNEL_LABELS: Record<string, string> = {
  online: 'Solo online',
  pos: 'Solo negozio',
  all: 'Tutti i canali',
};

@Component({
  selector: 'app-corrispettivi-deliveries',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './corrispettivi-deliveries.component.html',
  styleUrl: './corrispettivi-deliveries.component.scss',
})
export class CorrispettiviDeliveriesComponent {
  readonly deliveries = input.required<readonly CorrispettiviDelivery[]>();

  protected readonly formatMoney = formatMoney;
  protected readonly formatDate = formatDate;

  protected channelLabel(filter: string): string {
    return CHANNEL_LABELS[filter] ?? filter;
  }
}
