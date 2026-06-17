import type { ShopifySyncInventoryDto, ShopifySyncProductsDto } from './shopify-sync.dto';

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
