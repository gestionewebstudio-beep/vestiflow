import { describe, expect, it } from 'vitest';

import { listActionState, listActionTarget } from './list-selection.model';
import type { ListAction } from './list-selection.model';

const azione = (parziale: Partial<ListAction> = {}): ListAction =>
  ({
    id: 'x',
    label: 'X',
    requires: 'none',
    run: () => undefined,
    ...parziale,
  }) as ListAction;

/**
 * ⛔ Le regole vivono nel modello e non nel componente apposta: le usa la barra
 * per rendere i comandi **e** queste prove per verificarle senza rendere nulla.
 * Nel template sarebbero verificabili solo montando una tabella, ed è il genere
 * di regola che poi nessuno prova.
 *
 * ⚠️ Qui c'era `listActionAppliesTo`, che rispondeva «si vede o no». Non esiste
 * più: dal 20/08/2026 **le azioni della pagina sono sempre visibili** (`14`
 * §5.1), e ciò che cambia è lo stato.
 */
describe('listActionState', () => {
  describe("requires: 'none' — sa lavorare sul risultato filtrato", () => {
    it('è attiva anche senza selezione', () => {
      expect(listActionState(azione({ requires: 'none' }), 0)).toEqual({ disabled: false });
    });

    it('resta attiva con una selezione', () => {
      expect(listActionState(azione({ requires: 'none' }), 5)).toEqual({ disabled: false });
    });
  });

  describe("requires: 'oneOrMore' — pretende una selezione", () => {
    it('⛔ a zero è spenta, e dice perché', () => {
      expect(listActionState(azione({ requires: 'oneOrMore' }), 0)).toEqual({
        disabled: true,
        reason: 'Seleziona almeno un elemento',
      });
    });

    it('da uno in su è attiva', () => {
      expect(listActionState(azione({ requires: 'oneOrMore' }), 1).disabled).toBe(false);
      expect(listActionState(azione({ requires: 'oneOrMore' }), 9).disabled).toBe(false);
    });
  });

  describe("requires: 'one' — pretende esattamente un elemento", () => {
    it('a zero: «Seleziona un elemento»', () => {
      expect(listActionState(azione({ requires: 'one' }), 0).reason).toBe('Seleziona un elemento');
    });

    it('a uno è attiva', () => {
      expect(listActionState(azione({ requires: 'one' }), 1)).toEqual({ disabled: false });
    });

    /** ⚠️ Due motivi diversi per due situazioni diverse: non una frase sola. */
    it('⚠️ a due o più: «Seleziona un solo elemento»', () => {
      expect(listActionState(azione({ requires: 'one' }), 3).reason).toBe(
        'Seleziona un solo elemento',
      );
    });
  });

  /**
   * ⚠️ Il vincolo di DOMINIO vince su quello di arità: è più specifico, e
   * quindi più utile all'operatore. «Seleziona almeno un elemento» quando il
   * vero problema è il tipo dei documenti scelti sarebbe una bugia gentile.
   */
  it('⚠️ il motivo della pagina prevale su quello standard', () => {
    const a = azione({
      requires: 'oneOrMore',
      disabled: true,
      disabledReason: 'La selezione contiene documenti che non si eliminano.',
    });
    expect(listActionState(a, 3)).toEqual({
      disabled: true,
      reason: 'La selezione contiene documenti che non si eliminano.',
    });
  });

  it("un'azione in corso è spenta", () => {
    expect(listActionState(azione({ busy: true }), 2).disabled).toBe(true);
  });
});

/**
 * ⛔ L'ambito NON è un array che a volte è vuoto: è un'unione discriminata. Con
 * `ids: string[]` il caso «tutto il filtrato» sarebbe indistinguibile da «non
 * c'è niente da fare», e il primo handler scritto male esporterebbe zero righe
 * invece di centoventisette senza che nessun tipo lo dica (`14` §5.3).
 */
describe('listActionTarget', () => {
  it('nessuna selezione → il risultato filtrato', () => {
    expect(listActionTarget([])).toEqual({ scope: 'filtered' });
  });

  it('una o più → soltanto quelle', () => {
    expect(listActionTarget(['a', 'b'])).toEqual({ scope: 'selection', ids: ['a', 'b'] });
  });
});
