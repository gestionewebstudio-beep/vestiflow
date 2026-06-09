import { firstValueFrom, type Observable } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import { AdjustmentDirection, StockMovementType } from '@core/models/stock-movement.model';

import { InventoryService, type RegisterMovementInput } from './inventory.service';

// Le chiamate mock hanno latenza simulata: i timer finti la azzerano.
async function settle<T>(source: Observable<T>): Promise<T> {
  const promise = firstValueFrom(source);
  await vi.runAllTimersAsync();
  return promise;
}

async function settleError(source: Observable<unknown>): Promise<unknown> {
  const promise = firstValueFrom(source).then(
    () => {
      throw new Error('Atteso un errore, la chiamata e riuscita.');
    },
    (err: unknown) => err,
  );
  await vi.runAllTimersAsync();
  return promise;
}

function movementInput(partial: Partial<RegisterMovementInput>): RegisterMovementInput {
  return {
    type: StockMovementType.Load,
    variantId: 'var-test',
    sku: 'TEST-SKU',
    locationId: 'loc-a',
    quantity: 5,
    createdBy: 'user-1',
    createdByName: 'Test User',
    ...partial,
  };
}

async function availableAt(
  service: InventoryService,
  variantId: string,
  locationId: string,
): Promise<number> {
  const levels = await settle(service.getLevelsByVariant(variantId));
  return levels.find((level) => level.locationId === locationId)?.available ?? 0;
}

describe('InventoryService.registerMovement', () => {
  let service: InventoryService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new InventoryService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('un carico aumenta available e onHand (crea la giacenza se mancante)', async () => {
    await settle(service.registerMovement(movementInput({ quantity: 7 })));
    const levels = await settle(service.getLevelsByVariant('var-test'));
    expect(levels).toHaveLength(1);
    expect(levels[0]?.available).toBe(7);
    expect(levels[0]?.onHand).toBe(7);
  });

  it('uno scarico diminuisce la giacenza (oversell negativo ammesso, come Shopify)', async () => {
    await settle(
      service.registerMovement(movementInput({ type: StockMovementType.Unload, quantity: 3 })),
    );
    expect(await availableAt(service, 'var-test', 'loc-a')).toBe(-3);
  });

  it('un trasferimento sposta la quantita tra origine e destinazione', async () => {
    await settle(service.registerMovement(movementInput({ quantity: 10 })));
    await settle(
      service.registerMovement(
        movementInput({
          type: StockMovementType.Transfer,
          targetLocationId: 'loc-b',
          quantity: 4,
        }),
      ),
    );
    expect(await availableAt(service, 'var-test', 'loc-a')).toBe(6);
    expect(await availableAt(service, 'var-test', 'loc-b')).toBe(4);
  });

  it('una rettifica applica il verso indicato', async () => {
    await settle(service.registerMovement(movementInput({ quantity: 10 })));
    await settle(
      service.registerMovement(
        movementInput({
          type: StockMovementType.Adjustment,
          direction: AdjustmentDirection.Decrease,
          reason: 'Capo danneggiato',
          quantity: 2,
        }),
      ),
    );
    expect(await availableAt(service, 'var-test', 'loc-a')).toBe(8);
  });

  it('ogni movimento registrato compare nello storico (audit, mai update silenziosi)', async () => {
    const created = await settle(service.registerMovement(movementInput({ quantity: 1 })));
    const movements = await settle(service.getMovements());
    const found = movements.find((movement) => movement.id === created.id);
    expect(found).toBeDefined();
    expect(found?.sku).toBe('TEST-SKU');
    expect(found?.createdByName).toBe('Test User');
  });

  describe('validazione (422, nessuna mutazione)', () => {
    it('quantita non intera o < 1', async () => {
      for (const quantity of [0, -1, 1.5]) {
        const err = await settleError(service.registerMovement(movementInput({ quantity })));
        expect(isAppError(err) && err.kind === AppErrorKind.Validation).toBe(true);
      }
      const levels = await settle(service.getLevelsByVariant('var-test'));
      expect(levels).toEqual([]);
    });

    it('rettifica senza motivo o senza verso', async () => {
      const noReason = await settleError(
        service.registerMovement(
          movementInput({
            type: StockMovementType.Adjustment,
            direction: AdjustmentDirection.Decrease,
          }),
        ),
      );
      expect(isAppError(noReason) && noReason.kind === AppErrorKind.Validation).toBe(true);

      const noDirection = await settleError(
        service.registerMovement(
          movementInput({ type: StockMovementType.Adjustment, reason: 'Motivo valido' }),
        ),
      );
      expect(isAppError(noDirection) && noDirection.kind === AppErrorKind.Validation).toBe(true);
    });

    it('trasferimento senza destinazione o con origine = destinazione', async () => {
      const noTarget = await settleError(
        service.registerMovement(movementInput({ type: StockMovementType.Transfer })),
      );
      expect(isAppError(noTarget) && noTarget.kind === AppErrorKind.Validation).toBe(true);

      const sameTarget = await settleError(
        service.registerMovement(
          movementInput({ type: StockMovementType.Transfer, targetLocationId: 'loc-a' }),
        ),
      );
      expect(isAppError(sameTarget) && sameTarget.kind === AppErrorKind.Validation).toBe(true);
    });
  });
});
