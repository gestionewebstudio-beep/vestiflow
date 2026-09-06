import { describe, expect, it, vi } from 'vitest';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { testClerkUser } from '../test/fixtures/user-profile.fixture';

import type { StoreSaleLookupService } from './store-sale-lookup.service';
import type { StoreSalesService } from './store-sales.service';
import { StoreSalesController } from './store-sales.controller';

/**
 * ⛔ **La rotta deve PROPAGARE l'utente al servizio.**
 *
 * Misurato il 28/08/2026, ed è la terza occorrenza dello stesso schema — dopo
 * gli impegni di magazzino e le vendite online:
 *
 * ```text
 * servizio:    user?: UserProfileDto   +   assertLocation…(user, …)
 * controller:  non riceve @CurrentUser(), oppure non lo propaga
 * risultato:   guardia presente nel codice, assente nell'esecuzione
 * ```
 *
 * ⚠️ **Un test di servizio verde non dimostra che la rotta sia protetta.** Il
 * servizio della cassa aveva la guardia, un commento che descriveva per esteso
 * l'attacco, e sei prove verdi: la rotta non le passava l'utente e la cassa di
 * un negozio leggeva la giacenza di qualunque altra sede.
 *
 * ⭐ Rendere il parametro obbligatorio aiuta ma non basta: `undefined` compila
 * lo stesso. Questa prova sta sul boundary, che è il punto che può dimenticarlo.
 */

describe('StoreSalesController — la propagazione dell’utente al servizio', () => {
  const tenantId = 'tenant-1';
  const user: UserProfileDto = testClerkUser({ assignedLocationIds: ['loc-mia'] });

  function createController() {
    const storeSales = {};
    const lookup = { lookupItems: vi.fn().mockResolvedValue([]) };
    const controller = new StoreSalesController(
      storeSales as unknown as StoreSalesService,
      lookup as unknown as StoreSaleLookupService,
    );
    return { controller, lookup };
  }

  it('lookupItem propaga l’utente al servizio di ricerca', async () => {
    const { controller, lookup } = createController();
    const query = { code: '8000000000001', locationId: 'loc-altrui' };

    await controller.lookupItem(tenantId, user, query as never);

    expect(lookup.lookupItems).toHaveBeenCalledWith(tenantId, query, user);
  });

  // ⚠️ L'asserzione che coglie la regressione più probabile: chi «sistema»
  // l'errore del compilatore scrivendo `undefined` riaprirebbe la falla, e
  // `toHaveBeenCalledWith(tenantId, query, user)` sopra fallirebbe — ma solo se
  // qualcuno guarda il terzo argomento. Qui lo si guarda esplicitamente.
  it('e l’utente propagato non è undefined', async () => {
    const { controller, lookup } = createController();

    await controller.lookupItem(tenantId, user, { code: 'X', locationId: 'loc-x' } as never);

    const terzoArgomento = lookup.lookupItems.mock.calls[0]![2];
    expect(terzoArgomento).toBeDefined();
    expect(terzoArgomento).toBe(user);
  });
});
