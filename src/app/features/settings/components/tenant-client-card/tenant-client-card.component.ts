import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  tenantChannelProfileBadgeTone,
  tenantChannelProfileLabel,
} from '@core/models/tenant-channel-profile.model';
import { BadgeComponent } from '@shared/components/badge/badge.component';

import {
  buildTenantClientExtendedFields,
  tenantClientExtendedDetailsMeta,
  type TenantCompany,
} from '@domain/tenant/models/tenant-company.model';

/** Riga sintetica + dettagli espandibili per l’anagrafica commerciale del tenant. */
@Component({
  selector: 'app-tenant-client-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent, RouterLink],
  templateUrl: './tenant-client-card.component.html',
  styleUrl: './tenant-client-card.component.scss',
})
export class TenantClientCardComponent {
  readonly company = input.required<TenantCompany>();

  /**
   * Partita IVA, PEC, IBAN del **contratto**: li vede solo il titolare, che sa
   * distinguerli dai Dati azienda. A un operatore sarebbero solo una seconda
   * partita IVA senza spiegazione.
   */
  readonly showFiscalDetails = input<boolean>(false);

  protected readonly channelProfileLabel = computed(() =>
    tenantChannelProfileLabel(this.company().channelProfile),
  );

  protected readonly channelProfileTone = computed(() =>
    tenantChannelProfileBadgeTone(this.company().channelProfile),
  );

  protected readonly extendedFields = computed(() =>
    buildTenantClientExtendedFields(this.company()),
  );

  protected readonly hasExtendedDetails = computed(() => this.extendedFields().length > 0);

  protected readonly extendedDetailsMeta = computed(() =>
    tenantClientExtendedDetailsMeta(this.extendedFields().length),
  );

  protected displayCell(value: string | null | undefined): string {
    const trimmed = value?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : '—';
  }
}
