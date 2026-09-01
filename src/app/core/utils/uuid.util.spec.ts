import { afterEach, describe, expect, it, vi } from 'vitest';

import { nuovoId } from './uuid.util';

const FORMA_UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('nuovoId — un identificativo anche fuori dal contesto sicuro', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('nel contesto sicuro usa `crypto.randomUUID`', () => {
    const finto = vi.fn(() => '11111111-2222-4333-8444-555555555555');
    vi.stubGlobal('crypto', { ...globalThis.crypto, randomUUID: finto });

    expect(nuovoId()).toBe('11111111-2222-4333-8444-555555555555');
    expect(finto).toHaveBeenCalledOnce();
  });

  /*
    ⛔ **È il caso che rompeva la Vendita al banco.** Misurato in Chrome:
    su `http://192.168.1.50` `crypto.randomUUID` è `undefined`, quindi
    chiamarla LANCIA — e lancia in mezzo a un'azione sincrona, dove nessun
    gestore d'errore la vede. A chi premeva «Concludi vendita» sembrava
    soltanto che non succedesse niente.
  */
  it('⛔ senza `randomUUID` non lancia: ripiega su `getRandomValues`', () => {
    const cripto = globalThis.crypto;
    vi.stubGlobal('crypto', {
      getRandomValues: (a: Uint8Array) => cripto.getRandomValues(a),
    });

    expect(() => nuovoId()).not.toThrow();
    expect(nuovoId()).toMatch(FORMA_UUID_V4);
  });

  it('⭐ il ripiego rispetta la forma della v4: versione e variante al posto giusto', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (a: Uint8Array) => {
        // Tutti i bit a uno: se versione e variante non venissero imposte, il
        // risultato sarebbe `ffffffff-ffff-ffff-ffff-…` e non una v4.
        a.fill(0xff);
        return a;
      },
    });

    const id = nuovoId();
    expect(id).toMatch(FORMA_UUID_V4);
    expect(id[14]).toBe('4');
    expect(['8', '9', 'a', 'b']).toContain(id[19]);
  });

  it('⚠️ due chiamate danno due identificativi diversi', () => {
    const cripto = globalThis.crypto;
    vi.stubGlobal('crypto', {
      getRandomValues: (a: Uint8Array) => cripto.getRandomValues(a),
    });

    expect(nuovoId()).not.toBe(nuovoId());
  });
});
