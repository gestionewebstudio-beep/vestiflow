import { DOCUMENT, Injectable, computed, effect, inject, signal } from '@angular/core';

import type { ResolvedTheme, ThemeMode } from '@shared/models/theme.model';

const STORAGE_KEY = 'vestiflow-theme';
const THEME_MODES: readonly ThemeMode[] = ['light', 'dark', 'system'];

/**
 * Gestisce la preferenza tema (light | dark | system) e applica `data-theme`
 * su <html>. I valori visivi vivono nei design token; qui c'e' solo lo stato.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);

  /** Preferenza scelta dall'utente (puo' essere 'system'). */
  private readonly _mode = signal<ThemeMode>(this.readStoredMode());
  readonly mode = this._mode.asReadonly();

  /** Preferenza del sistema operativo; aggiornata dal listener matchMedia. */
  private readonly systemPrefersDark = signal<boolean>(this.getSystemPrefersDark());

  /** Tema effettivamente applicato, risolvendo 'system'. */
  readonly resolvedTheme = computed<ResolvedTheme>(() => {
    const mode = this._mode();
    if (mode === 'system') {
      return this.systemPrefersDark() ? 'dark' : 'light';
    }
    return mode;
  });

  constructor() {
    // Applica reattivamente data-theme a ogni cambio di tema effettivo
    // (gira anche al primo accesso, impostando lo stato iniziale).
    effect(() => {
      this.document.documentElement.setAttribute('data-theme', this.resolvedTheme());
    });

    this.listenToSystemChanges();
  }

  /** Imposta la preferenza e la persiste. */
  setMode(mode: ThemeMode): void {
    this._mode.set(mode);
    this.persistMode(mode);
  }

  /** Alterna tra light e dark in base al tema attualmente visibile. */
  toggle(): void {
    this.setMode(this.resolvedTheme() === 'dark' ? 'light' : 'dark');
  }

  private listenToSystemChanges(): void {
    this.matchDark()?.addEventListener('change', (event) => {
      this.systemPrefersDark.set(event.matches);
    });
  }

  private getSystemPrefersDark(): boolean {
    return this.matchDark()?.matches ?? false;
  }

  private matchDark(): MediaQueryList | null {
    const view = this.document.defaultView;
    return view?.matchMedia ? view.matchMedia('(prefers-color-scheme: dark)') : null;
  }

  private readStoredMode(): ThemeMode {
    try {
      const stored = this.document.defaultView?.localStorage.getItem(STORAGE_KEY);
      return THEME_MODES.includes(stored as ThemeMode) ? (stored as ThemeMode) : 'system';
    } catch {
      // localStorage non disponibile (private mode / blocco cookie): fallback sicuro.
      return 'system';
    }
  }

  private persistMode(mode: ThemeMode): void {
    try {
      this.document.defaultView?.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Fallback silenzioso: il tema funziona comunque, solo non persiste.
    }
  }
}
