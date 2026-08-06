import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ButtonComponent } from '@shared/components/button/button.component';

import { PwaUpdateService } from '@core/services/pwa-update.service';

/**
 * Banner non bloccante quando una nuova versione PWA e' pronta.
 */
@Component({
  selector: 'app-pwa-update-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent],
  templateUrl: './pwa-update-banner.component.html',
  styleUrl: './pwa-update-banner.component.scss',
})
export class PwaUpdateBannerComponent {
  private readonly pwaUpdate = inject(PwaUpdateService);

  protected readonly updateReady = this.pwaUpdate.updateReady;

  protected applyUpdate(): void {
    this.pwaUpdate.applyUpdate();
  }
}
