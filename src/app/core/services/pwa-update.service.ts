import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';

import { SwUpdate } from '@angular/service-worker';

/**
 * Gestisce aggiornamenti dell'app installata (service worker).
 * Non cache API: solo shell e asset statici.
 */
@Injectable({ providedIn: 'root' })
export class PwaUpdateService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly swUpdate = inject(SwUpdate);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _updateReady = signal(false);
  readonly updateReady = this._updateReady.asReadonly();

  constructor() {
    if (!isPlatformBrowser(this.platformId) || !this.swUpdate.isEnabled) {
      return;
    }

    this.swUpdate.versionUpdates
      .pipe(
        filter((event) => event.type === 'VERSION_READY'),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this._updateReady.set(true));
  }

  readonly isEnabled = this.swUpdate.isEnabled;

  applyUpdate(): void {
    globalThis.location.reload();
  }
}
