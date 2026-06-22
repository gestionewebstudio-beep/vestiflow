import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { AuthService } from '@core/auth';
import { APP_CONFIG } from '@core/config/app-config.token';
import { PLATFORM_OPERATOR_ROLE_LABEL } from '@core/models/user-role-labels.util';
import { canManageMfa } from '@core/permissions/tenant-permissions.util';
import { ThemeService } from '@core/services/theme.service';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { ProfileAvatarUploadComponent } from '@shared/components/profile-avatar-upload/profile-avatar-upload.component';
import type { ThemeMode } from '@shared/models/theme.model';

import { MfaSettingsComponent } from '@features/settings/components/mfa-settings/mfa-settings.component';

const THEME_OPTIONS: readonly { readonly value: ThemeMode; readonly label: string }[] = [
  { value: 'light', label: 'Chiaro' },
  { value: 'dark', label: 'Scuro' },
  { value: 'system', label: 'Sistema' },
];

/** Impostazioni account operatore piattaforma (tema, MFA, profilo) — senza dati tenant negozio. */
@Component({
  selector: 'app-operator-account',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent, MfaSettingsComponent, ProfileAvatarUploadComponent],
  templateUrl: './operator-account.component.html',
  styleUrl: '../../../settings/settings.component.scss',
})
export class OperatorAccountComponent {
  private readonly authService = inject(AuthService);
  private readonly themeService = inject(ThemeService);
  private readonly appConfig = inject(APP_CONFIG);

  protected readonly themeOptions = THEME_OPTIONS;
  protected readonly themeMode = this.themeService.mode;
  protected readonly currentUser = this.authService.currentUser;
  protected readonly mfaAvailable = Boolean(this.appConfig.supabase?.anonKey);
  protected readonly platformOperatorRoleLabel = PLATFORM_OPERATOR_ROLE_LABEL;
  protected readonly canManageMfa = computed(() => canManageMfa(this.currentUser()));

  protected onThemeChange(mode: ThemeMode): void {
    this.themeService.setMode(mode);
  }
}
