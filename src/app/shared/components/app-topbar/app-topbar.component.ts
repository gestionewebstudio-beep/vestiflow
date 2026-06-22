import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { ShopifyConnectionStatus } from '@core/models/shopify-connection.model';
import type { IsoDateString } from '@core/models/common.model';
import { formatDateTimeShort } from '@core/utils/date.util';
import type { EntityId } from '@core/models/common.model';
import type { Location } from '@core/models/location.model';
import type { User } from '@core/models/user.model';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { UserAvatarComponent } from '@shared/components/user-avatar/user-avatar.component';
import type { ThemeMode } from '@shared/models/theme.model';

interface ThemeOption {
  readonly mode: ThemeMode;
  readonly icon: string;
  readonly label: string;
}

const SYNC_LABELS: Record<ShopifyConnectionStatus, string> = {
  [ShopifyConnectionStatus.NotConnected]: 'Shopify non connesso',
  [ShopifyConnectionStatus.Connected]: 'Shopify connesso',
  [ShopifyConnectionStatus.ReauthRequired]: 'Shopify: riautorizzazione richiesta',
  [ShopifyConnectionStatus.Error]: 'Shopify: errore di connessione',
};

/**
 * Topbar applicativa. Componente dumb puro: nessuna iniezione di servizi,
 * nessuna logica di business. Stato via input(), richieste via output().
 */
@Component({
  selector: 'app-topbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgClass, SelectMenuComponent, UserAvatarComponent],
  templateUrl: './app-topbar.component.html',
  styleUrl: './app-topbar.component.scss',
})
export class AppTopbarComponent {
  /** Modalita' tema corrente (riflette fedelmente il ThemeService). */
  readonly themeMode = input.required<ThemeMode>();
  /** Utente autenticato corrente (solo per la resa di nome/iniziali). */
  readonly user = input<User | null>(null);
  /** Location selezionabili (vuoto = selettore nascosto). */
  readonly locations = input<readonly Location[]>([]);
  /** Location attiva corrente; null = tutte. */
  readonly activeLocationId = input<EntityId | null>(null);
  /** Stato connessione Shopify; null = non ancora caricato (indicatore nascosto). */
  readonly syncStatus = input<ShopifyConnectionStatus | null>(null);
  /** Timestamp ultimo sync Shopify (ISO), se disponibile. */
  readonly shopifyLastSyncAt = input<IsoDateString | null | undefined>(null);
  /** Webhook / aggiornamenti automatici attivi. */
  readonly shopifyAutoSyncEnabled = input<boolean | undefined>(undefined);
  /** Messaggio errore connessione/sync (display-safe). */
  readonly shopifyLastError = input<string | null | undefined>(null);

  /** Toggle del drawer/sidebar (hamburger, mobile). */
  readonly menuToggle = output<void>();
  /** Richiesta di cambio modalita' tema. */
  readonly themeModeChange = output<ThemeMode>();
  /** Richiesta di cambio location attiva (null = tutte). */
  readonly locationChange = output<EntityId | null>();
  /** Click sull'indicatore sync (lo shell naviga alle impostazioni). */
  readonly syncClick = output<void>();
  /** Click sull'avatar utente (lo shell naviga alle impostazioni). */
  readonly settingsClick = output<void>();
  /** Richiesta di logout (lo shell parla all'AuthService). */
  readonly logout = output<void>();

  protected readonly themeOptions: readonly ThemeOption[] = [
    { mode: 'light', icon: 'pi-sun', label: 'Tema chiaro' },
    { mode: 'dark', icon: 'pi-moon', label: 'Tema scuro' },
    { mode: 'system', icon: 'pi-desktop', label: 'Tema di sistema' },
  ];

  protected readonly locationOptions = computed((): readonly SelectMenuOption[] =>
    this.locations().map((location) => ({
      value: location.id,
      label: location.name,
    })),
  );

  /** Valore stringa per il select-menu (EntityId o vuoto). */
  protected readonly activeLocationValue = computed(() => this.activeLocationId() ?? '');

  /** Etichetta accessibile dell'indicatore sync. */
  protected readonly syncLabel = computed(() => {
    const status = this.syncStatus();
    return status ? SYNC_LABELS[status] : '';
  });

  protected readonly syncLastSyncLabel = computed(() => {
    const lastSyncAt = this.shopifyLastSyncAt();
    return lastSyncAt ? formatDateTimeShort(lastSyncAt) : null;
  });

  /** Tooltip sul pulsante sync: stato, ultimo sync ed eventuale errore. */
  protected readonly syncTooltip = computed(() => {
    const parts = [this.syncLabel()];
    const lastSync = this.syncLastSyncLabel();
    if (lastSync) {
      parts.push(`Ultimo sync: ${lastSync}`);
    }
    const enabled = this.shopifyAutoSyncEnabled();
    if (enabled === true) {
      parts.push('Aggiornamenti automatici attivi');
    } else if (enabled === false) {
      parts.push('Sync manuale');
    }
    const lastError = this.shopifyLastError()?.trim();
    if (lastError) {
      parts.push(`Errore: ${lastError}`);
    }
    return parts.filter(Boolean).join(' · ');
  });

  /** Modificatore BEM del pallino di stato sync. */
  protected readonly syncToneClass = computed(() => {
    switch (this.syncStatus()) {
      case ShopifyConnectionStatus.Connected:
        return 'app-topbar__sync-dot--ok';
      case ShopifyConnectionStatus.ReauthRequired:
        return 'app-topbar__sync-dot--warning';
      case ShopifyConnectionStatus.Error:
        return 'app-topbar__sync-dot--error';
      default:
        return 'app-topbar__sync-dot--neutral';
    }
  });

  protected onLocationChange(value: string | null): void {
    this.locationChange.emit(value);
  }

  protected onSettingsClick(): void {
    this.settingsClick.emit();
  }
}
