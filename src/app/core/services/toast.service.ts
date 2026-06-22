import { Injectable, signal } from '@angular/core';

import type { ToastMessage, ToastTone } from '@shared/models/toast.model';

const DEFAULT_DURATION_MS: Record<ToastTone, number> = {
  error: 6_000,
  info: 4_000,
};

/**
 * Notifiche toast globali non bloccanti (errori imprevisti, fallback HTTP).
 * Una sola istanza in root; il container UI vive in AppComponent.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly _toasts = signal<readonly ToastMessage[]>([]);
  readonly toasts = this._toasts.asReadonly();

  private readonly dismissTimers = new Map<string, ReturnType<typeof setTimeout>>();

  showError(message: string, durationMs = DEFAULT_DURATION_MS.error): void {
    this.push(message, 'error', durationMs);
  }

  showInfo(message: string, durationMs = DEFAULT_DURATION_MS.info): void {
    this.push(message, 'info', durationMs);
  }

  dismiss(id: string): void {
    const timer = this.dismissTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.dismissTimers.delete(id);
    }
    this._toasts.update((items) => items.filter((item) => item.id !== id));
  }

  private push(message: string, tone: ToastTone, durationMs: number): void {
    const trimmed = message.trim();
    if (!trimmed) {
      return;
    }

    const toast: ToastMessage = {
      id: crypto.randomUUID(),
      message: trimmed,
      tone,
      durationMs,
    };

    this._toasts.update((items) => [...items, toast]);

    const timer = setTimeout(() => this.dismiss(toast.id), durationMs);
    this.dismissTimers.set(toast.id, timer);
  }
}
