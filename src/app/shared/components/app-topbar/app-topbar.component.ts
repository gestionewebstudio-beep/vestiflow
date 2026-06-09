import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { ShopifyConnectionStatus } from '@core/models/shopify-connection.model';
import type { EntityId } from '@core/models/common.model';
import type { Location } from '@core/models/location.model';
import type { User } from '@core/models/user.model';
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
  imports: [NgClass],
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

  /** Toggle del drawer/sidebar (hamburger, mobile). */
  readonly menuToggle = output<void>();
  /** Richiesta di cambio modalita' tema. */
  readonly themeModeChange = output<ThemeMode>();
  /** Richiesta di cambio location attiva (null = tutte). */
  readonly locationChange = output<EntityId | null>();
  /** Click sull'indicatore sync (lo shell naviga alle impostazioni). */
  readonly syncClick = output<void>();
  /** Richiesta di logout (lo shell parla all'AuthService). */
  readonly logout = output<void>();

  protected readonly themeOptions: readonly ThemeOption[] = [
    { mode: 'light', icon: 'pi-sun', label: 'Tema chiaro' },
    { mode: 'dark', icon: 'pi-moon', label: 'Tema scuro' },
    { mode: 'system', icon: 'pi-desktop', label: 'Tema di sistema' },
  ];

  /** Etichetta accessibile dell'indicatore sync. */
  protected readonly syncLabel = computed(() => {
    const status = this.syncStatus();
    return status ? SYNC_LABELS[status] : '';
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

  protected onLocationSelect(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.locationChange.emit(value || null);
  }

  /** Nome visualizzato: displayName se presente, altrimenti email. */
  protected readonly displayName = computed(() => {
    const current = this.user();
    if (!current) {
      return '';
    }
    return current.displayName.trim() || current.email;
  });

  /** Iniziali per l'avatar: nome+cognome, fallback all'iniziale dell'email. */
  protected readonly initials = computed(() => {
    const current = this.user();
    if (!current) {
      return '';
    }
    const name = current.displayName.trim();
    if (name) {
      const parts = name.split(/\s+/).filter(Boolean);
      const first = parts[0]?.charAt(0) ?? '';
      const last = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? '') : '';
      return (first + last).toUpperCase();
    }
    return current.email.charAt(0).toUpperCase();
  });
}
