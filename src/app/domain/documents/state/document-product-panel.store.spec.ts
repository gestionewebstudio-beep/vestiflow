import { describe, expect, it } from 'vitest';

import { DocumentProductPanelStore } from './document-product-panel.store';

describe('DocumentProductPanelStore', () => {
  it('parte chiuso, in creazione, senza riga né prodotto', () => {
    const store = new DocumentProductPanelStore();

    expect(store.isOpen()).toBe(false);
    expect(store.mode()).toBe('create');
    expect(store.lineIndex()).toBeNull();
    expect(store.editProductId()).toBeNull();
    expect(store.attachTargetLineIndex()).toBeNull();
    expect(store.attachDialogOpen()).toBe(false);
  });

  describe('openForNewProduct', () => {
    it('apre in creazione senza riga di destinazione', () => {
      const store = new DocumentProductPanelStore();

      store.openForNewProduct();

      expect(store.isOpen()).toBe(true);
      expect(store.mode()).toBe('create');
      expect(store.lineIndex()).toBeNull();
      expect(store.attachTargetLineIndex()).toBeNull();
    });

    it('dopo una modifica azzera il prodotto in edit', () => {
      const store = new DocumentProductPanelStore();
      store.openForEdit(2, 'prod-1');

      store.openForNewProduct();

      expect(store.editProductId()).toBeNull();
      expect(store.mode()).toBe('create');
    });
  });

  describe('openForLine', () => {
    it('apre in creazione con la riga come destinazione dell’aggancio', () => {
      const store = new DocumentProductPanelStore();

      store.openForLine(3);

      expect(store.isOpen()).toBe(true);
      expect(store.mode()).toBe('create');
      expect(store.lineIndex()).toBe(3);
      expect(store.attachTargetLineIndex()).toBe(3);
    });

    it('la riga 0 è una destinazione valida, non «nessuna»', () => {
      const store = new DocumentProductPanelStore();

      store.openForLine(0);

      expect(store.attachTargetLineIndex()).toBe(0);
    });
  });

  describe('openForEdit', () => {
    it('apre in modifica sul prodotto indicato', () => {
      const store = new DocumentProductPanelStore();

      store.openForEdit(1, 'prod-42');

      expect(store.isOpen()).toBe(true);
      expect(store.mode()).toBe('edit');
      expect(store.lineIndex()).toBe(1);
      expect(store.editProductId()).toBe('prod-42');
    });

    // Entrambi i form lo fanno: se dal pannello di modifica nasce una variante
    // nuova, deve poter tornare sulla riga da cui si è partiti.
    it('tiene la riga anche come destinazione di aggancio', () => {
      const store = new DocumentProductPanelStore();

      store.openForEdit(1, 'prod-42');

      expect(store.attachTargetLineIndex()).toBe(1);
    });
  });

  describe('close', () => {
    it('chiude e riporta in creazione', () => {
      const store = new DocumentProductPanelStore();
      store.openForEdit(1, 'prod-1');

      store.close();

      expect(store.isOpen()).toBe(false);
      expect(store.mode()).toBe('create');
      expect(store.lineIndex()).toBeNull();
      expect(store.editProductId()).toBeNull();
    });

    it('non tocca la destinazione di aggancio: serve al dialog che segue', () => {
      const store = new DocumentProductPanelStore();
      store.openForLine(4);

      store.close();

      expect(store.attachTargetLineIndex()).toBe(4);
    });
  });

  describe('savedWithoutAttach', () => {
    it('chiude il pannello e apre il dialog di aggancio', () => {
      const store = new DocumentProductPanelStore();
      store.openForLine(2);

      store.savedWithoutAttach('var-9');

      expect(store.isOpen()).toBe(false);
      expect(store.attachDialogOpen()).toBe(true);
      expect(store.pendingAttachVariantId()).toBe('var-9');
      // La riga di destinazione sopravvive alla chiusura del pannello.
      expect(store.attachTargetLineIndex()).toBe(2);
    });
  });

  describe('dismissAttach', () => {
    it('chiude il dialog e dimentica variante e destinazione', () => {
      const store = new DocumentProductPanelStore();
      store.openForLine(2);
      store.savedWithoutAttach('var-9');

      store.dismissAttach();

      expect(store.attachDialogOpen()).toBe(false);
      expect(store.pendingAttachVariantId()).toBeNull();
      expect(store.attachTargetLineIndex()).toBeNull();
    });
  });

  it('il dialog di aggancio può chiudersi da sé (binding bidirezionale)', () => {
    const store = new DocumentProductPanelStore();
    store.savedWithoutAttach('var-1');

    store.attachDialogOpen.set(false);

    expect(store.attachDialogOpen()).toBe(false);
    // Lo stato residuo non fa danno: ogni riapertura ripassa da savedWithoutAttach.
    expect(store.pendingAttachVariantId()).toBe('var-1');
  });
});
