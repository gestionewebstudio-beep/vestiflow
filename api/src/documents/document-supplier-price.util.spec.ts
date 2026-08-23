import { describe, expect, it, vi } from 'vitest';

import type { Prisma } from '@prisma/client';

import { applySupplierPriceUpdates } from './document-supplier-price.util';

/**
 * **Il costo che va in anagrafica conserva la coda dello scorporo.**
 *
 * ⛔ Fino al 22/08/2026 qui c'era `Math.round(Number(line.unitPriceMinor))`, e
 * c'era per una ragione sola: `ProductVariant.purchasePriceMinor` e
 * `SupplierVariantLink.lastPurchasePriceMinor` erano `Int`. Migrate a
 * `NUMERIC(16,6)`, quell'arrotondamento butterebbe via proprio il valore che la
 * migration serviva a conservare — 1,03 € ivati al 22% valgono 84,4262
 * centesimi netti, non 84.
 */
describe('applySupplierPriceUpdates — la coda arriva in anagrafica', () => {
  function mockTx() {
    const variantUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const linkUpsert = vi.fn().mockResolvedValue({});
    const productUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      productVariant: { updateMany: variantUpdate },
      supplierVariantLink: { upsert: linkUpsert },
      product: { updateMany: productUpdate, update: productUpdate },
    } as unknown as Prisma.TransactionClient;
    return { tx, variantUpdate, linkUpsert, productUpdate };
  }

  const riga = (unitPriceMinor: number) => ({
    variantId: 'var-1',
    quantity: 1,
    unitPriceMinor,
    loadsStock: true,
  });

  /** Il costo scritto su ProductVariant. */
  const costoVariante = (m: ReturnType<typeof mockTx>) =>
    m.variantUpdate.mock.calls[0]?.[0]?.data?.purchasePriceMinor;

  /** Il costo scritto su SupplierVariantLink. */
  const costoFornitore = (m: ReturnType<typeof mockTx>) =>
    m.linkUpsert.mock.calls[0]?.[0]?.update?.lastPurchasePriceMinor;

  it('⭐ 1,03 € ivati @22% → 84,4262 su variante e fornitore', async () => {
    const m = mockTx();
    await applySupplierPriceUpdates(m.tx, 'ten-1', 'sup-1', [riga(84.4262)] as never, true);

    expect(costoVariante(m)).toBeCloseTo(84.4262, 4);
    expect(costoFornitore(m)).toBeCloseTo(84.4262, 4);
  });

  it('⭐ 25,00 € ivati @22% → 2049,1803', async () => {
    const m = mockTx();
    await applySupplierPriceUpdates(m.tx, 'ten-1', 'sup-1', [riga(2049.1803)] as never, true);

    expect(costoVariante(m)).toBeCloseTo(2049.1803, 4);
  });

  it('⛔ oltre 4 cifre di centesimo si riduce: è il contratto, non un troncamento', async () => {
    const m = mockTx();
    await applySupplierPriceUpdates(m.tx, 'ten-1', 'sup-1', [riga(2049.18032786885)] as never, true);

    expect(costoVariante(m)).toBe(2049.1803);
  });

  it('un costo intero resta intero', async () => {
    const m = mockTx();
    await applySupplierPriceUpdates(m.tx, 'ten-1', 'sup-1', [riga(2500)] as never, true);

    expect(costoVariante(m)).toBe(2500);
  });

  describe('⛔ le regole di propagazione NON cambiano con la precisione', () => {
    it('senza la spunta, la VARIANTE non si tocca', async () => {
      const m = mockTx();
      await applySupplierPriceUpdates(m.tx, 'ten-1', 'sup-1', [riga(84.4262)] as never, false);

      expect(m.variantUpdate).not.toHaveBeenCalled();
    });

    it('⭐ …ma l’ultimo costo del FORNITORE si aggiorna comunque', async () => {
      // Non è governato dalla spunta: «quanto l'ho pagato l'ultima volta» resta
      // vero anche scegliendo di non aggiornare il costo dell'articolo.
      const m = mockTx();
      await applySupplierPriceUpdates(m.tx, 'ten-1', 'sup-1', [riga(84.4262)] as never, false);

      expect(costoFornitore(m)).toBeCloseTo(84.4262, 4);
    });

    it('⛔ il PRODOTTO PADRE non si tocca MAI: è il seed di nascita', async () => {
      // Regressione che questo test previene: `Product.purchasePriceMinor` è il
      // valore con cui nascono le nuove varianti, non un costo che i carichi
      // riscrivono. Migrare la colonna non lo rende un bersaglio.
      const m = mockTx();
      await applySupplierPriceUpdates(m.tx, 'ten-1', 'sup-1', [riga(84.4262)] as never, true);

      expect(m.productUpdate).not.toHaveBeenCalled();
    });

    it('senza fornitore, nessun aggancio al link', async () => {
      const m = mockTx();
      await applySupplierPriceUpdates(m.tx, 'ten-1', null, [riga(84.4262)] as never, true);

      expect(m.linkUpsert).not.toHaveBeenCalled();
      expect(costoVariante(m)).toBeCloseTo(84.4262, 4);
    });
  });
});

/**
 * ⛔ **La change detection del costo, dopo la migration a `NUMERIC(16,6)`.**
 *
 * Il confronto era `sameAmountAtCent`, e con quello 84,0000 e 84,4262
 * risultavano «uguali»: la variante avrebbe conservato il vecchio costo intero.
 */
describe('applySupplierPriceUpdates — «il costo è cambiato?»', () => {
  function mockTx() {
    const variantUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const linkUpsert = vi.fn().mockResolvedValue({});
    const tx = {
      productVariant: { updateMany: variantUpdate },
      supplierVariantLink: { upsert: linkUpsert },
      product: { updateMany: vi.fn(), update: vi.fn() },
    } as unknown as Prisma.TransactionClient;
    return { tx, variantUpdate, linkUpsert };
  }

  const riga = (unitPriceMinor: number) => ({
    variantId: 'var-1',
    quantity: 1,
    unitPriceMinor,
    loadsStock: true,
  });

  it('⭐ variante a 84,0000 + costo 84,4262 → scrive 84,4262', async () => {
    const m = mockTx();
    await applySupplierPriceUpdates(m.tx, 'ten-1', 'sup-1', [riga(84.4262)] as never, true);

    expect(m.variantUpdate.mock.calls[0]?.[0]?.data?.purchasePriceMinor).toBeCloseTo(84.4262, 4);
  });

  it('⭐ e il link fornitore riceve lo stesso costo preciso', async () => {
    const m = mockTx();
    await applySupplierPriceUpdates(m.tx, 'ten-1', 'sup-1', [riga(84.4262)] as never, true);

    expect(m.linkUpsert.mock.calls[0]?.[0]?.update?.lastPurchasePriceMinor).toBeCloseTo(
      84.4262,
      4,
    );
  });

  it('⛔ senza la spunta la variante non si tocca, il fornitore sì', async () => {
    const m = mockTx();
    await applySupplierPriceUpdates(m.tx, 'ten-1', 'sup-1', [riga(84.4262)] as never, false);

    expect(m.variantUpdate).not.toHaveBeenCalled();
    expect(m.linkUpsert.mock.calls[0]?.[0]?.update?.lastPurchasePriceMinor).toBeCloseTo(
      84.4262,
      4,
    );
  });

  describe('⭐ due righe dello stesso articolo: vince l’ULTIMA', () => {
    /**
     * ⛔ Difetto misurato su dati reali il 22/08/2026: un Arrivo merce con due
     * righe dello stesso articolo a costi diversi (0,84 e 0,94) lasciava in
     * anagrafica uno dei due **a seconda dell'ordine di iterazione della
     * mappa** — non per una regola. Il commento del codice dichiarava
     * l'assunzione sbagliata: «ogni variante compare una volta sola».
     *
     * Il proprietario ha deciso: vince l'ultima riga inserita.
     */
    function mockTx2() {
      const variantUpdate = vi.fn().mockResolvedValue({ count: 1 });
      const linkUpsert = vi.fn().mockResolvedValue({});
      const tx = {
        productVariant: { updateMany: variantUpdate },
        supplierVariantLink: { upsert: linkUpsert },
        product: { updateMany: vi.fn(), update: vi.fn() },
      } as unknown as Prisma.TransactionClient;
      return { tx, variantUpdate, linkUpsert };
    }

    const r = (unitPriceMinor: number, variantId = 'var-1') => ({
      variantId,
      quantity: 1,
      unitPriceMinor,
      loadsStock: true,
    });

    it('⛔ costo: 0,84 poi 0,94 → in anagrafica finisce 94', async () => {
      const m = mockTx2();

      await applySupplierPriceUpdates(m.tx, 'ten-1', 'sup-1', [r(84), r(94)] as never, true);

      // UNA sola scrittura per la variante, col costo dell'ultima riga.
      expect(m.variantUpdate).toHaveBeenCalledTimes(1);
      expect(m.variantUpdate.mock.calls[0]![0].data.purchasePriceMinor).toBe(94);
    });

    it('⛔ e invertendo l’ordine finisce 84: la regola è l’ORDINE, non il valore', async () => {
      const m = mockTx2();

      await applySupplierPriceUpdates(m.tx, 'ten-1', 'sup-1', [r(94), r(84)] as never, true);

      expect(m.variantUpdate.mock.calls[0]![0].data.purchasePriceMinor).toBe(84);
    });

    it('⭐ anche l’ultimo costo del fornitore segue l’ultima riga, una volta sola', async () => {
      const m = mockTx2();

      await applySupplierPriceUpdates(m.tx, 'ten-1', 'sup-1', [r(84), r(94)] as never, true);

      expect(m.linkUpsert).toHaveBeenCalledTimes(1);
      expect(m.linkUpsert.mock.calls[0]![0].update.lastPurchasePriceMinor).toBe(94);
    });

    it('due VARIANTI diverse restano due scritture distinte', async () => {
      const m = mockTx2();

      await applySupplierPriceUpdates(
        m.tx,
        'ten-1',
        'sup-1',
        [r(84, 'var-1'), r(94, 'var-2')] as never,
        true,
      );

      expect(m.linkUpsert).toHaveBeenCalledTimes(2);
    });

    it('⭐ e con la coda decimale: 84,4262 poi 2049,1803 → vince 2049,1803', async () => {
      const m = mockTx2();

      await applySupplierPriceUpdates(
        m.tx,
        'ten-1',
        'sup-1',
        [r(84.4262), r(2049.1803)] as never,
        true,
      );

      expect(m.variantUpdate.mock.calls[0]![0].data.purchasePriceMinor).toBeCloseTo(2049.1803, 4);
    });
  });
});
