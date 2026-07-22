import { Location } from '@angular/common';
import { computed, inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';

/**
 * Stato della cronologia di navigazione interna all'app, per il pulsante
 * «Indietro» generico. `canGoBack` è falso quando la pagina è stata aperta da
 * link diretto o in una nuova scheda (nessuna navigazione interna precedente):
 * in quel caso `history.back()` uscirebbe dall'app, quindi il pulsante si
 * nasconde. Si basa sull'id incrementale della navigazione del Router (signal
 * reattivo), stabile a prescindere da quando il servizio viene istanziato.
 */
@Injectable({ providedIn: 'root' })
export class NavigationHistoryService {
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  /** True se esiste una pagina precedente nella sessione dell'app. */
  readonly canGoBack = computed(() => (this.router.lastSuccessfulNavigation()?.id ?? 1) > 1);

  /** Torna alla pagina precedente nella cronologia del browser. */
  back(): void {
    this.location.back();
  }
}
