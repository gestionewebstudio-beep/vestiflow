import { describe, expect, it } from 'vitest';

import type { Location } from '@core/models/location.model';
import { ShopifySyncStatus } from '@core/models/shopify.model';

import { locationSetupStatusOf, mustChooseLocationsOf } from './location-setup-status.util';

function sede(partial: Partial<Location> & Pick<Location, 'id' | 'name'>): Location {
  return {
    tenantId: 'tenant-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    isActive: true,
    licensedInVf: true,
    ...partial,
  };
}

/**
 * ⭐ Lo stato «Sedi» parla del flusso di OGGI (14/09/2026, `docs/29` §6): la
 *    scelta per location nella tabella, non «sincronizza e seleziona» del flusso
 *    vecchio in cui il sync creava le sedi.
 */
describe('locationSetupStatusOf', () => {
  it('senza sedi collegate dice che la scelta è per location, nella tabella, e quante sedi prevede il piano', () => {
    const stato = locationSetupStatusOf([sede({ id: 'l1', name: 'Magazzino' })], 3);
    expect(stato.active).toBe(false);
    expect(stato.label).toBe('Nessuna sede collegata');
    expect(stato.detail).toBe(
      'Per ogni location del negozio scegli nella tabella: collega una sede, creane una nuova o lasciala fuori. Il piano prevede fino a 3 sedi operative.',
    );
    expect(stato.detail).not.toMatch(/Sincronizza|seleziona/);
  });

  it('con una sede sola nel piano lo dice al singolare', () => {
    expect(locationSetupStatusOf([], 1).detail).toMatch(/Il piano prevede una sede operativa\.$/);
  });

  /**
   * ⛔ Sul tenant di prova (14/09/2026) il titolo diceva «1 sede collegata» sopra una tabella
   *    con cinque «Collegata»: contava solo le attive nel piano. Le collegate si contano
   *    tutte; le operative si dicono a parte, solo quando sono di meno.
   */
  it('conta TUTTE le sedi collegate; quante sono attive nel piano lo dice a parte; e l’ultima lettura', () => {
    const stato = locationSetupStatusOf(
      [
        sede({
          id: 'l1',
          name: 'Negozio',
          shopify: {
            status: ShopifySyncStatus.Synced,
            shopifyId: '11',
            lastSyncedAt: '2026-09-14T08:00:00.000Z',
          },
        }),
        sede({
          id: 'l2',
          name: 'Deposito',
          shopify: {
            status: ShopifySyncStatus.Synced,
            shopifyId: '22',
            lastSyncedAt: '2026-09-14T10:30:00.000Z',
          },
        }),
        // Collegata ma fuori dal piano: è collegata (la tabella la dice tale), non operativa.
        sede({
          id: 'l3',
          name: 'Fuori piano',
          licensedInVf: false,
          shopify: { status: ShopifySyncStatus.Synced, shopifyId: '33' },
        }),
        // Non collegata: non conta.
        sede({ id: 'l4', name: 'Solo VestiFlow' }),
      ],
      3,
    );
    expect(stato.active).toBe(true);
    expect(stato.label).toBe('Sedi collegate');
    expect(stato.detail).toMatch(
      /^3 sedi collegate a una location del negozio · 2 attive nel piano · ultima lettura /,
    );
  });

  it('collegate tutte operative: nessun secondo conteggio; collegate ma nessuna operativa: lo stato non è attivo', () => {
    const collegata = (id: string, licensedInVf = true, isActive = true) =>
      sede({
        id,
        name: id,
        licensedInVf,
        isActive,
        shopify: { status: ShopifySyncStatus.Synced, shopifyId: id },
      });
    expect(locationSetupStatusOf([collegata('a'), collegata('b')], 2).detail).toBe(
      '2 sedi collegate a una location del negozio',
    );
    const nessunaOperativa = locationSetupStatusOf(
      [collegata('a', false), collegata('b', true, false)],
      2,
    );
    expect(nessunaOperativa.label).toBe('Sedi collegate');
    expect(nessunaOperativa.active).toBe(false);
    expect(nessunaOperativa.detail).toBe(
      '2 sedi collegate a una location del negozio · 0 attive nel piano',
    );
  });

  it('una sede collegata dal percorso, senza ancora una lettura dei dati, conta lo stesso', () => {
    const stato = locationSetupStatusOf(
      [
        sede({
          id: 'l1',
          name: 'Negozio',
          shopify: { status: ShopifySyncStatus.NotConnected, shopifyId: '11' },
        }),
      ],
      1,
    );
    expect(stato.active).toBe(true);
    expect(stato.detail).toBe('1 sede collegata a una location del negozio');
  });
});

describe('mustChooseLocationsOf', () => {
  it('chiede di scegliere con un piano multi-sede o senza sedi attive', () => {
    expect(mustChooseLocationsOf(3, 1)).toBe(true);
    expect(mustChooseLocationsOf(1, 0)).toBe(true);
    expect(mustChooseLocationsOf(1, 1)).toBe(false);
  });
});
