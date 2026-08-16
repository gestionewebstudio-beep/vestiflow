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

    it('non lo tocca se il prezzo è lo stesso AL CENTESIMO', async () => {
      // 1000,000000 e 1000,4 sono lo stesso prezzo per chi guarda: una coda
      // decimale diversa non è un prezzo nuovo (§sei decimali).
      const { tx, updateMany } = createTx(1000, false);

      await applyArticlePriceUpdates(tx, 'tenant-1', [riga({ sellingPriceMinor: 1000.4 })], { updateArticlePrices: true });

      expect(updateMany.mock.calls[0]![0].data).not.toHaveProperty('shopifyPriceMinor');
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
});
