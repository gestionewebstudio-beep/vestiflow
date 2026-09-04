import { describe, expect, it } from 'vitest';

import { SalesOrderSource } from '@core/models/sales-order.model';
import { TenantChannelProfile } from '@core/models/tenant-channel-profile.model';
import { UserRole } from '@core/models/user.model';
import type { User } from '@core/models/user.model';

import { salesOrderRowPath } from './sales-order-routing.util';

/**
 * ⛔ Il difetto che queste prove inchiodano: elenco e ricerca globale mandavano
 * OGNI riga `SalesOrder` alla Modifica dell'Ordine cliente, qualunque fosse
 * l'origine. Gli ordini `online` e `pos` sono posseduti dal canale e sono
 * read-only per regola (`regole-gestionale`, ownership dei dati).
 */
describe('salesOrderRowPath', () => {
  const TITOLARE = {
    id: 'u1',
    role: UserRole.Owner,
    permissions: [],
    tenantChannelProfile: TenantChannelProfile.Shopify,
  } as unknown as User;

  it('⭐ origine MANUALE: la Modifica dell’Ordine cliente', () => {
    expect(salesOrderRowPath({ id: 'so-1', source: SalesOrderSource.Manual }, TITOLARE)).toBe(
      '/app/sales/so-1/edit',
    );
  });

  it('⭐ origine ONLINE e POS: la vista in sola lettura, mai la Modifica', () => {
    for (const source of [SalesOrderSource.Online, SalesOrderSource.Pos]) {
      const path = salesOrderRowPath({ id: 'so-2', source }, TITOLARE);
      expect(path).toBe('/app/sales/so-2');
      expect(path).not.toContain('/edit');
    }
  });

  /**
   * ⚠️ L'errore vicino, e va inchiodato perché è quello in cui si scivola:
   * `/app/sales/online/:id` appartiene alla **Vendita online** (`OnlineSale`,
   * documento interno generato dall'evasione), non a un Ordine di canale.
   */
  it('⛔ e NON usa il percorso della Vendita online', () => {
    for (const source of Object.values(SalesOrderSource)) {
      expect(salesOrderRowPath({ id: 'so-3', source }, TITOLARE)).not.toContain('/sales/online/');
    }
  });

  it('⭐ ogni origine dichiarata ha una destinazione, e sono due sole', () => {
    const destinazioni = new Set(
      Object.values(SalesOrderSource).map((source) =>
        salesOrderRowPath({ id: 'so-4', source }, TITOLARE),
      ),
    );
    expect(destinazioni).toEqual(new Set(['/app/sales/so-4/edit', '/app/sales/so-4']));
  });
});
