import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { ViewportService } from './viewport.service';

type Ascoltatore = (event: MediaQueryListEvent) => void;

/**
 * Un documento finto con la sola superficie che il servizio tocca: il valore
 * del token e `matchMedia`. Serve a poter dire «il token c'è» e «il token non
 * c'è», che sono i due casi che contano.
 */
function documentoFinto(options: { readonly token: string; readonly matches?: boolean }) {
  const ascoltatori: Ascoltatore[] = [];
  const query = {
    matches: options.matches ?? false,
    addEventListener: vi.fn((_: string, fn: Ascoltatore) => ascoltatori.push(fn)),
    removeEventListener: vi.fn(),
  };
  const matchMedia = vi.fn(() => query);
  return {
    query,
    matchMedia,
    ascoltatori,
    documento: {
      documentElement: {},
      defaultView: {
        matchMedia,
        getComputedStyle: () => ({ getPropertyValue: () => options.token }),
      },
    },
  };
}

function creaServizio(finto: ReturnType<typeof documentoFinto>): ViewportService {
  TestBed.configureTestingModule({
    providers: [{ provide: DOCUMENT, useValue: finto.documento }],
  });
  return TestBed.inject(ViewportService);
}

describe('ViewportService', () => {
  it('la soglia arriva dal CSS, non da un valore scritto qui', () => {
    const finto = documentoFinto({ token: ' 63.9375rem ' });

    creaServizio(finto);

    // Spazi tolti: `getPropertyValue` li restituisce, e una media query con
    // uno spazio di troppo non corrisponde a niente.
    expect(finto.matchMedia).toHaveBeenCalledWith('(max-width: 63.9375rem)');
  });

  it('parte dallo stato corrente della media query', () => {
    const servizio = creaServizio(documentoFinto({ token: '63.9375rem', matches: true }));

    expect(servizio.compact()).toBe(true);
  });

  it('segue il cambio di larghezza', () => {
    const finto = documentoFinto({ token: '63.9375rem', matches: false });
    const servizio = creaServizio(finto);

    finto.ascoltatori.forEach((fn) => fn({ matches: true } as MediaQueryListEvent));

    expect(servizio.compact()).toBe(true);
  });

  // Senza foglio di stile — nei test, o se il token sparisse — resta la vista
  // estesa: è il default anche del CSS, che nasconde la tabella solo dentro la
  // media query. Il nome del token è sorvegliato da `check:tokens`.
  it('senza il token non interroga la media query e resta sulla vista estesa', () => {
    const finto = documentoFinto({ token: '' });

    const servizio = creaServizio(finto);

    expect(finto.matchMedia).not.toHaveBeenCalled();
    expect(servizio.compact()).toBe(false);
  });

  it('senza matchMedia non esplode', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: DOCUMENT, useValue: { documentElement: {}, defaultView: {} } }],
    });

    expect(TestBed.inject(ViewportService).compact()).toBe(false);
  });
});
