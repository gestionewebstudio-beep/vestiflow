import type {
  ShopifySyncInventoryDto,
  ShopifySyncCustomersDto,
  ShopifySyncOrdersDto,
  ShopifySyncProductsDto,
} from './shopify-sync.dto';

export interface ShopifySyncFeedback {
  readonly message: string;
  readonly tone: 'success' | 'warning';
}

export function formatShopifyProductsSyncFeedback(
  result: ShopifySyncProductsDto,
): ShopifySyncFeedback {
  const failedCount = result.failed.length;
  const changedCount = result.imported + result.updated;

  if (failedCount > 0) {
    const firstError = result.failed[0]?.message;
    const errorHint = firstError ? ` Dettaglio: ${firstError}.` : '';
    return {
      tone: 'warning',
      message: `Catalogo importato con ${failedCount} errori: ${result.imported} nuovi, ${result.updated} aggiornati.${errorHint}`,
    };
  }

  if (result.remoteProductCount > 0 && changedCount === 0) {
    return {
      tone: 'warning',
      message: `Shopify ha ${result.remoteProductCount} prodotti ma nessuna modifica in VestiFlow. Controlla i filtri o i log di sync.`,
    };
  }

  if (result.remoteProductCount === 0) {
    return {
      tone: 'warning',
      message:
        'Nessun prodotto trovato su Shopify. Verifica che il catalogo sia salvato nello store collegato.',
    };
  }

  return {
    tone: 'success',
    message: `Catalogo sincronizzato: ${result.imported} nuovi, ${result.updated} aggiornati (${result.remoteProductCount} su Shopify).`,
  };
}

export function formatShopifyInventorySyncFeedback(
  result: ShopifySyncInventoryDto,
): ShopifySyncFeedback {
  const changedCount = result.imported + result.updated;

  if (result.remoteLevelCount === 0) {
    return {
      tone: 'warning',
      message:
        'Nessuna giacenza trovata su Shopify per le varianti e location collegate. Verifica che il tracking quantità sia attivo su Shopify.',
    };
  }

  if (changedCount === 0) {
    return {
      tone: 'success',
      message: `Giacenze già allineate (${result.unchanged} righe invariate su Shopify).`,
    };
  }

  return {
    tone: 'success',
    message: `Giacenze sincronizzate da Shopify: ${result.imported} nuove, ${result.updated} aggiornate (${result.remoteLevelCount} livelli letti).`,
  };
}

export function formatShopifyCustomersSyncFeedback(
  result: ShopifySyncCustomersDto,
): ShopifySyncFeedback {
  const failedCount = result.failed.length;
  const changedCount = result.imported + result.updated;

  if (failedCount > 0) {
    const firstError = result.failed[0]?.message;
    const errorHint = firstError ? ` Dettaglio: ${firstError}.` : '';
    return {
      tone: 'warning',
      message: `Clienti importati con ${failedCount} errori: ${result.imported} nuovi, ${result.updated} aggiornati.${errorHint}`,
    };
  }

  if (result.remoteCustomerCount === 0) {
    return {
      tone: 'warning',
      message: 'Nessun cliente trovato su Shopify per lo store collegato.',
    };
  }

  if (changedCount === 0) {
    return {
      tone: 'success',
      message: `Clienti già allineati (${result.remoteCustomerCount} su Shopify).`,
    };
  }

  return {
    tone: 'success',
    message: `Clienti sincronizzati da Shopify: ${result.imported} nuovi, ${result.updated} aggiornati (${result.remoteCustomerCount} su Shopify).`,
  };
}

/**
 * Coda del messaggio quando la riconciliazione ha trovato ordini che su Shopify
 * non risultano più. Non è un errore: è una cosa da sapere, e va detta insieme
 * all'esito dell'importazione invece che in un avviso a parte.
 */
function missingOnChannelSuffix(result: ShopifySyncOrdersDto): string {
  // Il controllo non eseguito va detto: l'operatore si aspetta che il
  // «sincronizza» gli dica anche cosa è sparito, e il silenzio verrebbe letto
  // come «non è sparito niente».
  if (result.missingCheckInconclusive) {
    return ` ${result.missingCheckInconclusive}`;
  }
  const missing = result.missingOnChannel ?? 0;
  if (missing === 0) {
    return '';
  }
  const quali =
    missing === 1
      ? '1 ordine non risulta più su Shopify'
      : `${missing} ordini non risultano più su Shopify`;
  const released = result.reservationsReleased ?? 0;
  const impegni =
    released === 0
      ? ''
      : released === 1
        ? ', e per 1 sono stati liberati gli impegni di magazzino'
        : `, e per ${released} sono stati liberati gli impegni di magazzino`;
  return ` ${quali}${impegni}: li trovi nell'elenco come «Non su Shopify».`;
}

export function formatShopifyOrdersSyncFeedback(result: ShopifySyncOrdersDto): ShopifySyncFeedback {
  const failedCount = result.failed.length;
  const changedCount = result.imported + result.updated;
  const missing = missingOnChannelSuffix(result);

  if (failedCount > 0) {
    const firstError = result.failed[0]?.message;
    const errorHint = firstError ? ` Dettaglio: ${firstError}.` : '';
    return {
      tone: 'warning',
      message: `Vendite importate con ${failedCount} errori: ${result.imported} nuove, ${result.updated} aggiornate.${errorHint}`,
    };
  }

  if (result.remoteOrderCount === 0) {
    return {
      tone: 'warning',
      message: 'Nessun ordine trovato su Shopify per lo store collegato.',
    };
  }

  if (changedCount === 0) {
    return {
      tone: missing ? 'warning' : 'success',
      message: `Vendite già allineate (${result.remoteOrderCount} ordini su Shopify).${missing}`,
    };
  }

  return {
    tone: missing ? 'warning' : 'success',
    message: `Vendite sincronizzate da Shopify: ${result.imported} nuove, ${result.updated} aggiornate (${result.remoteOrderCount} ordini su Shopify).${missing}`,
  };
}
