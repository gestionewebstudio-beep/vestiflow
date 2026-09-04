import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { APP_CONFIG } from '../config/app-config.token';

import { BarcodeDetectionService } from './barcode-detection.service';
import { ViewportService } from './viewport.service';

/**
 * **Quando si offre il comando fotocamera** _(deciso dal proprietario il
 * 24/08/2026)_.
 *
 * ⛔ La regola non e' «c'e' una fotocamera»: e' «serve a qualcuno». Davanti a
 * un monitor la fotocamera del portatile inquadra l'operatore, non il capo — e
 * un pulsante che apre una finestra inutilizzabile e' un comando che non
 * comanda.
 *
 * ⚠️ **La scansione NON si spegne**: su scrivania si legge col lettore HID, che
 * scrive nel campo di ricerca come una tastiera e non passa da qui. Questa
 * proprieta' governa il COMANDO, non il motore.
 *
 * ⭐ Sta in un posto solo perche' il pulsante lo rendono **dodici** consumer —
 * sette maschere documento piu' cinque schermate di magazzino e catalogo.
 * Dodici `@if` da tenere allineati sono dodici occasioni di dimenticarne uno.
 */
function banco(opzioni: { bandiera?: boolean; fotocamera?: boolean; compatto?: boolean } = {}) {
  const compatto = signal(opzioni.compatto ?? false);

  if (opzioni.fotocamera ?? true) {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn() },
    });
  } else {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
  }

  TestBed.configureTestingModule({
    providers: [
      BarcodeDetectionService,
      { provide: ViewportService, useValue: { compact: compatto.asReadonly() } },
      {
        provide: APP_CONFIG,
        useValue: { features: { barcodeScanner: opzioni.bandiera ?? true } },
      },
    ],
  });

  return { servizio: TestBed.inject(BarcodeDetectionService), compatto };
}

afterEach(() => {
  TestBed.resetTestingModule();
});

describe('BarcodeDetectionService — quando si offre la fotocamera', () => {
  it('⭐ su schermo compatto, con fotocamera e bandiera accesa: si offre', () => {
    const { servizio } = banco({ compatto: true });
    expect(servizio.cameraScanOffered()).toBe(true);
  });

  it('⛔ su DESKTOP non si offre, anche se la fotocamera c e', () => {
    const { servizio } = banco({ compatto: false });
    expect(servizio.cameraScanOffered()).toBe(false);
  });

  it('senza fotocamera non si offre, nemmeno su schermo compatto', () => {
    const { servizio } = banco({ compatto: true, fotocamera: false });
    expect(servizio.cameraScanOffered()).toBe(false);
  });

  it('con la bandiera d ambiente spenta non si offre', () => {
    const { servizio } = banco({ compatto: true, bandiera: false });
    expect(servizio.cameraScanOffered()).toBe(false);
  });

  it('⭐ ruotando il tablet la risposta cambia da sola: e un segnale', () => {
    // Il confine non e' letto una volta all'avvio: se lo fosse, un 2-in-1 con
    // la tastiera staccata a meta' sessione resterebbe senza il comando.
    const { servizio, compatto } = banco({ compatto: false });
    expect(servizio.cameraScanOffered()).toBe(false);

    compatto.set(true);
    expect(servizio.cameraScanOffered()).toBe(true);
  });

  it('⚠️ il MOTORE resta disponibile ovunque: si spegne il comando, non la lettura', () => {
    // `cameraSupported` descrive il DISPOSITIVO e non deve seguire il
    // viewport: chi legge col lettore HID non passa da `cameraScanOffered`, e
    // il ponyfill WASM serve anche su scrivania.
    const { servizio } = banco({ compatto: false });
    expect(servizio.cameraSupported).toBe(true);
  });
});
