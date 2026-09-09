import { ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { assertLocalOnlyTrash, SHOPIFY_LINKED_TRASH_MESSAGE } from './product-trash.util';

/**
 * La regola «solo articoli locali», prima tranche del cestino.
 *
 * ⛔ **La prova che conta e' quella dei falsi positivi**: un test che verifica
 *    solo i rifiuti passerebbe anche con una funzione che rifiuta sempre, e il
 *    cestino non funzionerebbe per nessuno.
 */
describe('assertLocalOnlyTrash', () => {
  describe('lascia passare cio` che e` SOLO locale', () => {
    it('nessun identificativo remoto', () => {
      expect(() => assertLocalOnlyTrash([null])).not.toThrow();
    });

    it('due identificativi entrambi assenti — il caso della variante', () => {
      expect(() => assertLocalOnlyTrash([null, null])).not.toThrow();
    });

    it('campo non selezionato (`undefined`) vale come assente', () => {
      expect(() => assertLocalOnlyTrash([undefined, undefined])).not.toThrow();
    });

    it('stringa vuota: un identificativo vuoto non e` un collegamento', () => {
      expect(() => assertLocalOnlyTrash([''])).not.toThrow();
    });

    it('elenco vuoto', () => {
      expect(() => assertLocalOnlyTrash([])).not.toThrow();
    });
  });

  describe('rifiuta cio` che e` collegato', () => {
    it('il prodotto ha un identificativo remoto', () => {
      expect(() => assertLocalOnlyTrash(['gid-prodotto'])).toThrow(ConflictException);
    });

    it('la VARIANTE ha il proprio identificativo, il prodotto no', () => {
      expect(() => assertLocalOnlyTrash(['gid-variante', null])).toThrow(ConflictException);
    });

    // ⚠️ Il caso misurato: `persistShopifyIds` non scrive `shopifyVariantId`
    //    per le varianti senza SKU. Il collegamento del PRODOTTO deve bastare.
    it('la variante NON ha il proprio identificativo, ma il prodotto si`', () => {
      expect(() => assertLocalOnlyTrash([null, 'gid-prodotto'])).toThrow(ConflictException);
    });

    // ⚠️ Si confronta con la COSTANTE, non con frammenti di testo: due
    //    scritture della stessa lettera accentata possono differire per
    //    normalizzazione Unicode, e la prova fallirebbe su stringhe identiche
    //    a vedersi. Misurato l'08/09/2026.
    it('il messaggio dice che e` temporaneo e indica la strada', () => {
      expect(() => assertLocalOnlyTrash(['gid'])).toThrow(SHOPIFY_LINKED_TRASH_MESSAGE);
      expect(SHOPIFY_LINKED_TRASH_MESSAGE).toContain('ancora disponibile');
      expect(SHOPIFY_LINKED_TRASH_MESSAGE).toContain('Non attivo');
      expect(SHOPIFY_LINKED_TRASH_MESSAGE).toContain('ritiro dalla vendita');
    });
  });
});
