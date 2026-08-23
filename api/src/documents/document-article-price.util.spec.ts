import { describe, expect, it, vi } from 'vitest';

import { applyArticlePriceUpdates } from './document-article-price.util';

/**
 * Fetta 2 del contratto della riga: i prezzi di anagrafica scritti da un Arrivo
 * merce.
 *
 * Il difetto che questa fetta ha trovato era **un campo digitabile senza
 * destinazione**. Questi test guardano quindi due cose insieme: che il valore
 * arrivi dove deve, e che **non arrivi** dove non è stato chiesto.
 */
describe('prezzi di anagrafica da un Arrivo merce', () => {
  function createTx(currentSellingMinor = 1000, shopifyActive = true) {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    return {
      tx: {
        tenant: {
          findUnique: vi
            .fn()
            .mockResolvedValue({ channelProfile: shopifyActive ? 'shopify' : 'vestiflow' }),
        },
        productVariant: {
          findMany: vi
            .fn()
            .mockResolvedValue([{ id: 'var-1', sellingPriceMinor: currentSellingMinor }]),
          updateMany,
        },
      } as never,
      updateMany,
    };
  }

  const riga = (over: Record<string, unknown> = {}) => ({ variantId: 'var-1', ...over });

  it('con la spunta spenta non scrive niente', async () => {
    const { tx, updateMany } = createTx();

    await applyArticlePriceUpdates(tx, 'tenant-1', [riga({ sellingPriceMinor: 2500 })], { updateArticlePrices: false });

    expect(updateMany).not.toHaveBeenCalled();
  });

  it('con la spunta accesa scrive il prezzo al pubblico sulla variante', async () => {
    const { tx, updateMany } = createTx();

    await applyArticlePriceUpdates(tx, 'tenant-1', [riga({ sellingPriceMinor: 2500 })], { updateArticlePrices: true });

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'var-1', tenantId: 'tenant-1' },
      data: { sellingPriceMinor: 2500 },
    });
  });

  it('una riga senza articolo non tocca niente', async () => {
    const { tx, updateMany } = createTx();

    await applyArticlePriceUpdates(
      tx,
      'tenant-1',
      [{ variantId: null, sellingPriceMinor: 2500 }],
      { updateArticlePrices: true },
    );

    expect(updateMany).not.toHaveBeenCalled();
  });

  describe('Shopify attivo — il prezzo canale è un valore proprio', () => {
    it('scrive entrambi i prezzi, senza fonderli', async () => {
      const { tx, updateMany } = createTx();

      await applyArticlePriceUpdates(
        tx,
        'tenant-1',
        [riga({ sellingPriceMinor: 2500, shopifyPriceMinor: 2990 })],
        { updateArticlePrices: true },
      );

      expect(updateMany.mock.calls[0]![0].data).toEqual({
        sellingPriceMinor: 2500,
        shopifyPriceMinor: 2990,
      });
    });

    it('prezzo Shopify assente = non toccare, anche se il pubblico cambia', async () => {
      const { tx, updateMany } = createTx();

      await applyArticlePriceUpdates(tx, 'tenant-1', [riga({ sellingPriceMinor: 2500 })], { updateArticlePrices: true });

      // Con Shopify attivo il prezzo canale ha vita propria: non lo si allinea
      // di nascosto al prezzo al pubblico.
      expect(updateMany.mock.calls[0]![0].data).not.toHaveProperty('shopifyPriceMinor');
    });
  });

  describe('Shopify spento — il canale segue, ma solo se il prezzo cambia', () => {
    it('il prezzo canale segue quello di vendita quando questo cambia', async () => {
      const { tx, updateMany } = createTx(1000, false);

      await applyArticlePriceUpdates(tx, 'tenant-1', [riga({ sellingPriceMinor: 2500 })], { updateArticlePrices: true });

      expect(updateMany.mock.calls[0]![0].data).toEqual({
        sellingPriceMinor: 2500,
        shopifyPriceMinor: 2500,
      });
    });

    it('⭐ lo tocca se il prezzo cambia DENTRO il contratto, non solo al centesimo', async () => {
      // ⚠️ Questo test asseriva l'OPPOSTO fino al 22/08/2026, con la
      // motivazione «1000,000000 e 1000,4 sono lo stesso prezzo per chi
      // guarda». È vero per chi guarda, e infatti verso Shopify diventano
      // entrambi «10.00»: ma qui non si pubblica niente — si COPIA un valore
      // canonico interno in un'altra colonna `Decimal(16,6)`.
      //
      // ⛔ Col metro centesimale le due colonne restavano con valori diversi, e
      // il disallineamento non si vedeva da nessuna parte se non a database.
      // Il confronto è ora alla precisione del contratto.
      const { tx, updateMany } = createTx(1000, false);

      await applyArticlePriceUpdates(tx, 'tenant-1', [riga({ sellingPriceMinor: 1000.4 })], { updateArticlePrices: true });

      expect(updateMany.mock.calls[0]![0].data.shopifyPriceMinor).toBeCloseTo(1000.4, 4);
    });

    it('ignora un prezzo canale mandato per sbaglio', async () => {
      // A Shopify spento la colonna non esiste in maschera: se un valore arriva
      // lo stesso, non lo si scrive — sarebbe un campo che l'operatore non ha
      // potuto vedere.
      const { tx, updateMany } = createTx(1000, false);

      await applyArticlePriceUpdates(
        tx,
        'tenant-1',
        [riga({ shopifyPriceMinor: 9999 })],
        { updateArticlePrices: true },
      );

      expect(updateMany).not.toHaveBeenCalled();
    });
  });

  describe('⛔ la copia sul prezzo canale conserva il valore canonico', () => {
    /**
     * A Shopify spento, `shopifyPriceMinor` segue `sellingPriceMinor` quando
     * questo cambia. Sono due colonne `Decimal(16,6)` INTERNE: la copia deve
     * portare il valore intero, non la sua versione al centesimo.
     *
     * ⛔ Fino al 22/08/2026 il confronto era `sameAmountAtCent`: 2049,0000 e
     * 2049,1803 risultavano «uguali» e la copia non avveniva, lasciando le due
     * colonne con valori diversi. Non si vedeva da fuori — verso Shopify
     * entrambe diventano «20.49» — ma a database divergevano.
     */
    it('⭐ 2049,0000 → 2049,1803: cambiato, e la copia porta la coda', async () => {
      const { tx, updateMany } = createTx(2049, false);

      await applyArticlePriceUpdates(
        tx,
        'tenant-1',
        [riga({ sellingPriceMinor: 2049.1803 })],
        { updateArticlePrices: true },
      );

      expect(updateMany.mock.calls[0]![0].data.shopifyPriceMinor).toBeCloseTo(2049.1803, 4);
      expect(updateMany.mock.calls[0]![0].data.sellingPriceMinor).toBeCloseTo(2049.1803, 4);
    });

    it('lo stesso valore non fa scattare la copia', async () => {
      const { tx, updateMany } = createTx(2049.1803, false);

      await applyArticlePriceUpdates(
        tx,
        'tenant-1',
        [riga({ sellingPriceMinor: 2049.1803 })],
        { updateArticlePrices: true },
      );

      expect(updateMany.mock.calls[0]![0].data).not.toHaveProperty('shopifyPriceMinor');
    });

    it('⭐ valori diversi oltre il quarto decimale, uguali per il contratto: nessuna copia', async () => {
      const { tx, updateMany } = createTx(2049.18032786, false);

      await applyArticlePriceUpdates(
        tx,
        'tenant-1',
        [riga({ sellingPriceMinor: 2049.18031111 })],
        { updateArticlePrices: true },
      );

      expect(updateMany.mock.calls[0]![0].data).not.toHaveProperty('shopifyPriceMinor');
    });
  });
});
