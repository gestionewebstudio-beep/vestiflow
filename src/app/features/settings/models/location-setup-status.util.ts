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
    // ⛔ Qui c'era «Sedi non attivate — Sincronizza le location da Shopify e
    //    seleziona fino a N sedi operative»: il testo del flusso vecchio, in cui il
    //    sync creava le sedi e l'operatore ne «selezionava» alcune. Dall'11/09 la
    //    scelta è per location — collega, crea, lascia — e si fa nella tabella
    //    «Sedi»; il testo dice quello (`docs/29` §6, 14/09/2026).
    const piano =
      limit === 1
        ? 'Il piano prevede una sede operativa.'
        : `Il piano prevede fino a ${limit} sedi operative.`;
    return {
      active: false,
      label: 'Nessuna sede collegata',
      detail: `Per ogni location del negozio scegli nella tabella: collega una sede, creane una nuova o lasciala fuori. ${piano}`,
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
      ? '1 sede collegata a una location del negozio'
      : `${synced.length} sedi collegate a una location del negozio`;
  const timeLabel = lastSyncedAt ? ` · ultima lettura ${formatDateTime(lastSyncedAt)}` : '';

  return {
    active: true,
    label: 'Sedi collegate',
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
