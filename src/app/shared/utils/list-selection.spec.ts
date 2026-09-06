import { describe, expect, it } from 'vitest';

import { createListSelection } from './list-selection';

/**
 * Lo stato di selezione comune degli elenchi (`14` parte D).
 *
 * ⛔ Perché queste prove contano più di quanto sembri: questo stato era
 * duplicato in `document-list` e in `sales-order-list`, e stava per essere
 * copiato in altri cinque elenchi. Ogni copia avrebbe potuto sbagliare la
 * potatura in modo diverso, e la potatura è la parte che, quando cede, fa
 * agire un'azione su righe che l'operatore credeva di aver lasciato indietro.
 */
describe('createListSelection', () => {
  it('parte vuota', () => {
    const s = createListSelection();
    expect(s.count()).toBe(0);
    expect(s.ids().size).toBe(0);
  });

  it('seleziona e deseleziona una riga', () => {
    const s = createListSelection();
    s.toggle('a', true);
    s.toggle('b', true);
    expect(s.count()).toBe(2);
    expect(s.has('a')).toBe(true);

    s.toggle('a', false);
    expect(s.count()).toBe(1);
    expect(s.has('a')).toBe(false);
  });

  it('la checkbox di testata prende e lascia le righe passate', () => {
    const s = createListSelection();
    s.setAll(['a', 'b', 'c'], true);
    expect(s.count()).toBe(3);
    s.setAll(['a', 'b', 'c'], false);
    expect(s.count()).toBe(0);
  });

  describe('potatura al cambio del dataset', () => {
    it('⛔ toglie ciò che non c’è più', () => {
      const s = createListSelection();
      s.setAll(['a', 'b', 'c'], true);

      // Cambia il filtro: restano solo «a» e «c».
      s.prune(['a', 'c']);

      expect([...s.ids()]).toEqual(['a', 'c']);
    });

    /**
     * ⚠️ Se la potatura restituisse un insieme NUOVO anche quando nulla è
     * cambiato, ogni ricarica dell'elenco notificherebbe un cambiamento che non
     * c'è stato — e con `OnPush` significa ridisegnare la barra a ogni giro.
     */
    it('⚠️ non cambia riferimento se non ha tolto niente', () => {
      const s = createListSelection();
      s.setAll(['a', 'b'], true);
      const prima = s.ids();

      s.prune(['a', 'b', 'c']);

      expect(s.ids()).toBe(prima);
    });

    it('potatura a insieme vuoto: la selezione sparisce', () => {
      const s = createListSelection();
      s.setAll(['a', 'b'], true);
      s.prune([]);
      expect(s.count()).toBe(0);
    });
  });

  describe('modo', () => {
    /**
     * ⛔ In modo singolo la selezione NON si accumula: la riga nuova sostituisce
     * quella vecchia, o la checkbox mentirebbe sul proprio significato.
     */
    it('⛔ «single»: la riga nuova sostituisce la precedente', () => {
      const s = createListSelection('single');
      s.toggle('a', true);
      s.toggle('b', true);
      expect([...s.ids()]).toEqual(['b']);
    });

    it('«single»: la checkbox di testata non fa niente', () => {
      const s = createListSelection('single');
      s.setAll(['a', 'b'], true);
      expect(s.count()).toBe(0);
    });

    it('«none»: non si seleziona nulla', () => {
      const s = createListSelection('none');
      s.toggle('a', true);
      s.setAll(['a', 'b'], true);
      expect(s.count()).toBe(0);
    });
  });

  it('clear azzera', () => {
    const s = createListSelection();
    s.setAll(['a', 'b'], true);
    s.clear();
    expect(s.count()).toBe(0);
  });
});
