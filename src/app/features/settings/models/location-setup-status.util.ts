import type { IsoDateString } from '@core/models/common.model';
import type { Location } from '@core/models/location.model';
import { formatDateTime } from '@core/utils/date.util';
import { isShopifyManagedLocation } from '@core/utils/location-selection.util';

import type { SetupStatusItem } from './setup-status.model';

/**
 * Lo stato «Sedi» che il pannello Shopify mostra fra i passi di configurazione.
 *
 * ⭐ Estratto dalla pagina Impostazioni l’11/09/2026, quando il pannello Shopify
 * ha preso una pagina propria (`/app/settings/shopify`): due pagine lo
 * calcolano, e la regola sta in un posto solo.
 */
export function locationSetupStatusOf(
  locations: readonly Location[],
  licensedLocationCount: number,
): SetupStatusItem {
  const limit = licensedLocationCount;
  // ⭐ «Collegata» = ha la location Shopify (l'id segue la coppia dello storico).
  //    ⛔ Qui si contavano le sole `synced`, cioè quelle i cui DATI sono stati
  //    letti da Shopify: una sede collegata dal percorso di prima connessione
  //    non lo è ancora, e la Configurazione diceva «Sedi non attivate» mentre il
  //    percorso diceva «1 collegata» (collaudo, 13/09/2026). Due lettori, una
  //    regola: `isShopifyManagedLocation`.
  const synced = locations.filter(
    (location) => location.isActive && location.licensedInVf && isShopifyManagedLocation(location),
  );
  if (synced.length === 0) {
    return {
      active: false,
      label: 'Sedi non attivate',
      detail:
        limit === 1
          ? 'Sincronizza le location da Shopify e seleziona la sede operativa inclusa nel piano.'
          : `Sincronizza le location da Shopify e seleziona fino a ${limit} sedi operative.`,
    };
  }

  const lastSyncedAt = synced.reduce<IsoDateString | undefined>((latest, location) => {
    const at = location.shopify?.lastSyncedAt;
    if (!at) {
      return latest;
    }
    return !latest || at > latest ? at : latest;
  }, undefined);

  const countLabel =
    synced.length === 1
      ? '1 location collegata a Shopify'
      : `${synced.length} location collegate a Shopify`;
  const timeLabel = lastSyncedAt ? ` · ${formatDateTime(lastSyncedAt)}` : '';

  return {
    active: true,
    label: 'Location collegate',
    detail: `${countLabel}${timeLabel}`,
  };
}

/**
 * Il tenant deve ancora scegliere quali sedi attivare: piano multi-sede,
 * oppure nessuna sede attiva. Serve al pannello Shopify per completare il
 * messaggio dopo la sync delle location.
 */
export function mustChooseLocationsOf(
  licensedLocationCount: number,
  licensedLocationActiveCount: number,
): boolean {
  return licensedLocationCount > 1 || licensedLocationActiveCount === 0;
}
