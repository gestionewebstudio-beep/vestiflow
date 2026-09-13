import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { AuthService } from '@core/auth';

import { ProductPriceModeMemoryService } from './product-price-mode-memory.service';

/** Un `localStorage` finto: una mappa, e su richiesta un deposito che rifiuta. */
function documentoCon(storage: Pick<Storage, 'getItem' | 'setItem'> | 'rotto') {
  const localStorage =
    storage === 'rotto'
      ? {
          getItem: () => {
            throw new Error('accesso negato');
          },
          setItem: () => {
            throw new Error('accesso negato');
          },
        }
      : storage;
  return { defaultView: { localStorage } } as unknown as Document;
}

function servizio(utenteId: string | null, documento: Document): ProductPriceModeMemoryService {
  TestBed.configureTestingModule({
    providers: [
      { provide: DOCUMENT, useValue: documento },
      {
        provide: AuthService,
        useValue: { currentUser: () => (utenteId ? { id: utenteId } : null) },
      },
    ],
  });
  return TestBed.inject(ProductPriceModeMemoryService);
}

describe('ProductPriceModeMemoryService — la modalità Netti/Ivati ricordata per operatore', () => {
  it('senza memoria risponde null: vale la convenzione aziendale', () => {
    const deposito = new Map<string, string>();
    const memoria = servizio(
      'user-1',
      documentoCon({
        getItem: (k) => deposito.get(k) ?? null,
        setItem: (k, v) => deposito.set(k, v),
      }),
    );

    expect(memoria.remembered()).toBeNull();
  });

  it('ricorda la scelta, per utente: un altro operatore non la eredita', () => {
    const deposito = new Map<string, string>();
    const doc = documentoCon({
      getItem: (k) => deposito.get(k) ?? null,
      setItem: (k, v) => deposito.set(k, v),
    });
    const primo = servizio('user-1', doc);
    primo.remember(true);
    expect(primo.remembered()).toBe(true);
    primo.remember(false);
    expect(primo.remembered()).toBe(false);

    TestBed.resetTestingModule();
    const secondo = servizio('user-2', doc);
    expect(secondo.remembered()).toBeNull();
  });

  it('senza utente non ricorda e non risponde: nessuna chiave anonima', () => {
    const deposito = new Map<string, string>();
    const memoria = servizio(
      null,
      documentoCon({
        getItem: (k) => deposito.get(k) ?? null,
        setItem: (k, v) => deposito.set(k, v),
      }),
    );

    memoria.remember(true);
    expect(memoria.remembered()).toBeNull();
    expect(deposito.size).toBe(0);
  });

  it('con il deposito inaccessibile non lancia: la scelta vale per la scheda aperta', () => {
    const memoria = servizio('user-1', documentoCon('rotto'));

    expect(() => memoria.remember(true)).not.toThrow();
    expect(memoria.remembered()).toBeNull();
  });
});
