import { DocumentType } from '@prisma/client';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';

/**
 * **L'interruttore aziendale della Vendita manuale.**
 *
 * ## Perché esiste
 *
 * La Vendita manuale è l'unico documento che riduce la giacenza **senza**
 * generare uno `StockMovement` (deroga di `regole-gestionale`, implementata in
 * `document-stock-manual-unload.util.ts`). Il documento è l'unica evidenza dello
 * scarico, e la sua eliminazione non ripristina le giacenze.
 *
 * È quindi una capacità **sensibile**, e il titolare deve poterla spegnere.
 *
 * ## ⛔ `=== true`, mai `!== false`
 *
 * Il default è **spenta** (decisione del proprietario, 26/08/2026), e la riga di
 * `tenant_feature_settings` si materializza solo quando qualcuno apre il
 * pannello Impostazioni. «Riga assente», «colonna false» e «profilo senza il
 * campo» devono quindi dire tutte la stessa cosa: **spenta**.
 *
 * Scritta `!user?.manualUnloadEnabled === false` la funzione sarebbe accesa per
 * ogni tenant che non ha mai aperto le Impostazioni — cioè quasi tutti.
 *
 * ## ⚠️ Che cosa governa, e che cosa NO
 *
 * ```text
 * creazione     ⛔ vietata quando spenta
 * modifica      ⛔ vietata quando spenta
 * eliminazione  ✅ NON governata: permessi di sempre, comportamento di sempre
 * annullamento  —  non esiste per questo tipo, e non si inventa
 * consultazione ✅ sempre: lo storico resta, e si legge dal Dettaglio
 * ```
 *
 * L'eliminazione resta fuori per scelta esplicita del proprietario: infilarci il
 * flag avrebbe trasformato una semplice abilitazione in un sistema di stati
 * paralleli. Resta vero che eliminare una Vendita manuale non ripristina la
 * giacenza — è il comportamento del documento, non una conseguenza di questo
 * interruttore.
 */
export const MANUAL_UNLOAD_DISABLED_MESSAGE =
  'La Vendita manuale non è attiva per questa azienda. Il titolare può attivarla in Impostazioni.';

/**
 * `true` quando l'azione richiesta riguarda una Vendita manuale e la funzione
 * **non** è accesa per questa azienda.
 *
 * ⚠️ Utente assente = spenta. Le creazioni interne legittime non passano da qui:
 * usano `createDocumentRecord`, che sta a valle dei rifiuti per tipo.
 */
export function isManualUnloadDisabled(
  user: Pick<UserProfileDto, 'manualUnloadEnabled'> | undefined | null,
  type: DocumentType,
): boolean {
  return type === DocumentType.manual_unload && user?.manualUnloadEnabled !== true;
}
