import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { installNumberInputWheelGuard } from './number-input-wheel-guard';

/**
 * Il difetto che questa guardia toglie non fa rumore: nessun errore, nessun
 * clic, nessun avviso — il numero cambia e basta. Per questo le prove partono
 * dalla dimostrazione che senza guardia il fuoco resta, e quindi il browser
 * avrebbe applicato l'incremento.
 */
describe('installNumberInputWheelGuard', () => {
  let disinstalla: (() => void) | null = null;
  let campo: HTMLInputElement;

  function creaCampo(tipo: string): HTMLInputElement {
    const el = document.createElement('input');
    el.type = tipo;
    document.body.appendChild(el);
    return el;
  }

  function rotella(su: HTMLElement): void {
    su.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 100 }));
  }

  beforeEach(() => {
    document.body.innerHTML = '';
    campo = creaCampo('number');
  });

  afterEach(() => {
    disinstalla?.();
    disinstalla = null;
    document.body.innerHTML = '';
  });

  it('senza guardia il campo tiene il fuoco, e la rotella lo raggiunge', () => {
    campo.focus();
    expect(document.activeElement).toBe(campo);

    rotella(campo);

    // È lo stato in cui il browser applica l'incremento: il difetto.
    expect(document.activeElement).toBe(campo);
  });

  it('con la guardia, la rotella toglie il fuoco al campo numerico', () => {
    disinstalla = installNumberInputWheelGuard();
    campo.focus();

    rotella(campo);

    expect(document.activeElement).not.toBe(campo);
  });

  it('non tocca un campo numerico che NON ha il fuoco', () => {
    disinstalla = installNumberInputWheelGuard();
    const altro = creaCampo('text');
    altro.focus();

    rotella(campo);

    // Il fuoco resta dov'era: togliere il fuoco a chi non ce l'ha sarebbe un
    // effetto collaterale gratuito.
    expect(document.activeElement).toBe(altro);
  });

  it('non tocca gli altri tipi di campo: solo `number` reagisce alla rotella', () => {
    disinstalla = installNumberInputWheelGuard();
    const testo = creaCampo('text');
    testo.focus();

    rotella(testo);

    expect(document.activeElement).toBe(testo);
  });

  it('non annulla l’evento: la pagina deve continuare a scorrere', () => {
    disinstalla = installNumberInputWheelGuard();
    campo.focus();

    const evento = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100 });
    campo.dispatchEvent(evento);

    // `preventDefault` bloccherebbe lo scorrimento della pagina: sarebbe un
    // secondo difetto al posto del primo.
    expect(evento.defaultPrevented).toBe(false);
  });

  it('disinstallandola, il difetto torna — la prova che era lei a toglierlo', () => {
    const stop = installNumberInputWheelGuard();
    stop();
    campo.focus();

    rotella(campo);

    expect(document.activeElement).toBe(campo);
  });
});
