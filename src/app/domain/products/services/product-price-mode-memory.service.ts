import { DOCUMENT, Injectable, inject } from '@angular/core';

import { AuthService } from '@core/auth';

const STORAGE_PREFIX = 'vestiflow-product-price-mode';

/**
 * ⭐ La modalità Netti/Ivati della scheda articolo è una PREFERENZA
 *    DELL’OPERATORE, ricordata e riproposta anche sui nuovi articoli — deciso
 *    dal proprietario l’11/09/2026.
 *
 * ⚠️ Vive nel browser (`localStorage`, per utente), non nel database: è una
 *    preferenza di interfaccia, come la sede attiva. Quindi è ricordata per
 *    operatore SU QUEL BROWSER e NON si sincronizza fra dispositivi: su un
 *    altro PC o sul telefono si riparte dalla convenzione aziendale
 *    (`salesPricesIncludeVat`), che resta la proposta iniziale ovunque.
 *
 * ⛔ Non è la memoria personale ritirata il 16/08/2026 (`regole-gestionale`):
 *    quella decideva come LEGGERE i listini nell’anagrafica-vista; questa
 *    ricorda come l’operatore DIGITA i prezzi nella scheda che compila.
 */
@Injectable({ providedIn: 'root' })
export class ProductPriceModeMemoryService {
  private readonly document = inject(DOCUMENT);
  private readonly authService = inject(AuthService);

  /** `true` = ivati, `false` = netti, `null` = nessuna memoria per questo operatore. */
  remembered(): boolean | null {
    const key = this.key();
    if (!key) {
      return null;
    }
    try {
      const raw = this.document.defaultView?.localStorage.getItem(key);
      return raw === 'gross' ? true : raw === 'net' ? false : null;
    } catch {
      // localStorage non disponibile (modalità privata, blocco cookie): nessuna memoria.
      return null;
    }
  }

  remember(pricesIncludeVat: boolean): void {
    const key = this.key();
    if (!key) {
      return;
    }
    try {
      this.document.defaultView?.localStorage.setItem(key, pricesIncludeVat ? 'gross' : 'net');
    } catch {
      // Memoria non persistibile: la scelta vale per la scheda aperta.
    }
  }

  private key(): string | null {
    const user = this.authService.currentUser();
    return user ? `${STORAGE_PREFIX}:${user.id}` : null;
  }
}
