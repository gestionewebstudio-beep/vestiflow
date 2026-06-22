import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

/**
 * Evento leggero per invalidare UI e cache dopo disconnect/purge/sync location
 * senza accoppiare ShopifyConnectionService e ShopifySyncWatchService.
 */
@Injectable({ providedIn: 'root' })
export class ShopifyConnectionRefreshService {
  private readonly invalidated$ = new Subject<void>();

  watchInvalidated(): Observable<void> {
    return this.invalidated$.asObservable();
  }

  notifyInvalidated(): void {
    this.invalidated$.next();
  }
}
