import { describe, expect, it } from 'vitest';

import { documentHasLinesWithoutEffect } from './document-line-effect.util';

describe('documentHasLinesWithoutEffect', () => {
  it('⭐ nessuna riga: il documento e’ VUOTO, e un documento vuoto si salva', () => {
    // La decisione del 25/08/2026 vive qui: zero righe non e’ un motivo di
    // rifiuto. Prima cinque maschere su sette lo rifiutavano, ognuna con parole
    // proprie, per un divieto che veniva dal backend.
    expect(documentHasLinesWithoutEffect(0, false)).toBe(false);
  });

  it('⛔ righe presenti ma NESSUNA con effetto: resta un errore', () => {
    // Un trasferimento con tre righe descrittive e nessuna variante sembra
    // pieno e non sposta un pezzo. L’operatore ha scritto qualcosa e si
    // aspetta un effetto: il silenzio sarebbe peggio del rifiuto.
    expect(documentHasLinesWithoutEffect(3, false)).toBe(true);
  });

  it('righe presenti e almeno una con effetto: tutto a posto', () => {
    expect(documentHasLinesWithoutEffect(3, true)).toBe(false);
  });

  it('⚠️ zero righe vince anche se il chiamante dice «nessun effetto»', () => {
    // La condizione di guardia e’ il CONTEGGIO, non l’effetto: con zero righe
    // «hasEffectiveLine» e’ per forza falso, e leggerlo come rifiuto
    // rimetterebbe il divieto esattamente dov’era.
    expect(documentHasLinesWithoutEffect(0, false)).toBe(false);
  });
});
