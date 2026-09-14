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

/**
 * ⭐ **I SALTATI non sono errori, e non sono nemmeno un successo.**
 *
 * Un prodotto saltato è un prodotto che una regola ha escluso: un collegamento
 * chiuso, un'identità eliminata definitivamente, un identificativo che appartiene
 * a un altro articolo. ⛔ Chiamarlo errore manderebbe l'operatore a cercare un
 * guasto che non c'è; tacerlo — com'era fino al 09/09/2026 — gli fa credere che
 * il catalogo sia allineato quando metà non è entrata.
 */
function skippedSuffix(skipped: number): string {
  if (skipped <= 0) {
    return '';
  }
  return skipped === 1
    ? ' 1 prodotto è stato saltato per una regola di collegamento: non è un errore, ma non è entrato.'
    : ` ${skipped} prodotti sono stati saltati per una regola di collegamento: non sono errori, ma non sono entrati.`;
}

/**
 * L'esito dell'import catalogo, in cinque casi che non si confondono.
 *
 * ```text
 *   vuoto              su Shopify non c'era niente da leggere
 *   interamente fallito ha tentato e non è entrato niente
 *   parziale            qualcosa è entrato, qualcosa è fallito
 *   solo saltati        nessun errore, ma nessun prodotto entrato
 *   riuscito            è entrato ciò che doveva entrare
 * ```
 *
 * ⛔ **La fine del tentativo non è la conferma della sincronizzazione**: era
 *    questo il difetto, e si vedeva quando ogni prodotto falliva.
 */
export function formatShopifyProductsSyncFeedback(
  result: ShopifySyncProductsDto,
): ShopifySyncFeedback {
  const failedCount = result.failed.length;
  const changedCount = result.imported + result.updated;
  const skipped = result.skipped ?? 0;
  const saltati = skippedSuffix(skipped);

  // 1 · vuoto: si dice prima di tutto, perché spiega da solo ogni altro zero.
  if (result.remoteProductCount === 0) {
    return {
      tone: 'warning',
      message:
        'Nessun prodotto trovato su Shopify. Verifica che il catalogo sia salvato nello store collegato.',
    };
  }

  // 2 · interamente fallito: nessun prodotto entrato, e non per una regola.
  if (failedCount > 0 && changedCount === 0 && skipped === 0) {
    const firstError = result.failed[0]?.message;
    const errorHint = firstError ? ` Dettaglio: ${firstError}.` : '';
    return {
      tone: 'warning',
      message: `Import non riuscito: nessuno dei ${failedCount} prodotti è entrato in VestiFlow.${errorHint}`,
    };
  }

  // 3 · parziale: qualcosa è entrato, qualcosa no.
  if (failedCount > 0) {
    const firstError = result.failed[0]?.message;
    const errorHint = firstError ? ` Dettaglio: ${firstError}.` : '';
    return {
      tone: 'warning',
      message: `Import parziale: ${result.imported} nuovi, ${result.updated} aggiornati, ${failedCount} falliti.${saltati}${errorHint}`,
    };
  }

  // 4 · solo saltati: nessun errore, e nessun prodotto entrato.
  if (changedCount === 0 && skipped > 0) {
    return {
      tone: 'warning',
      message: `Nessun prodotto è entrato: ${skipped} su ${result.remoteProductCount} sono stati saltati per una regola di collegamento. Non sono errori.`,
    };
  }

  // 5 · nessuna modifica e nessun saltato: il catalogo è già allineato, oppure
  //     qualcosa non torna. ⚠️ Qui il messaggio resta prudente com'era.
  if (changedCount === 0) {
    return {
      tone: 'warning',
      message: `Shopify ha ${result.remoteProductCount} prodotti ma nessuna modifica in VestiFlow. Controlla i filtri o i log di sync.`,
    };
  }

  return {
    tone: skipped > 0 ? 'warning' : 'success',
    message: `Catalogo sincronizzato: ${result.imported} nuovi, ${result.updated} aggiornati (${result.remoteProductCount} su Shopify).${saltati}`,
  };
}

/**
 * Coda del messaggio sui disallineamenti ripubblicati.
 *
 * Prima questa informazione non usciva da nessuna parte: la ripubblicazione era
 * un tentativo solo e, se falliva, restava un flag nel database che nessuno
 * leggeva. Quello che resta in coda va detto — è l'unico modo in cui l'operatore
 * può sapere che VestiFlow e Shopify non dicono ancora la stessa cosa.
 */
function republishSuffix(result: ShopifySyncInventoryDto): string {
  const republished = result.republishedLevels ?? 0;
  const refused = result.refusedLevels ?? 0;
  const failed = result.failedLevels ?? 0;
  const remaining = result.pendingMismatches ?? 0;
  if (republished === 0 && refused === 0 && failed === 0 && remaining === 0) {
    return '';
  }
  const fatte =
    republished === 1
      ? ' Ripubblicata su Shopify 1 giacenza disallineata.'
      : republished > 1
        ? ` Ripubblicate su Shopify ${republished} giacenze disallineate.`
        : '';
  // ⭐ **Il rifiuto ha un rimedio diverso dal fallimento**, e dirlo insieme
  //    manderebbe l'operatore a ritentare una cosa che ritentare non risolve:
  //    un collegamento chiuso resta chiuso finché non lo si riaggancia.
  const rifiutate =
    refused === 1
      ? ' 1 non è stata inviata perché il collegamento con Shopify non è utilizzabile.'
      : refused > 1
        ? ` ${refused} non sono state inviate perché il collegamento con Shopify non è utilizzabile.`
        : '';
  const fallite =
    failed === 1
      ? ' 1 non è arrivata per un errore del canale.'
      : failed > 1
        ? ` ${failed} non sono arrivate per un errore del canale.`
        : '';
  const restano =
    remaining === 1
      ? ' 1 resta disallineata.'
      : remaining > 1
        ? ` ${remaining} restano disallineate.`
        : '';
  // ⚠️ «Riprova» si propone solo se ritentare può servire: con soli rifiuti non
  //    serve, ed è la differenza che questo blocco esiste per dire.
  const consiglio = remaining > 0 && failed > 0 ? ' Riprova la sincronizzazione.' : '';
  return `${fatte}${rifiutate}${fallite}${restano}${consiglio}`;
}

export function formatShopifyInventorySyncFeedback(
  result: ShopifySyncInventoryDto,
): ShopifySyncFeedback {
  // `imported` non entra nel conteggio: il ramo che lo alimenta e' codice
  // morto lato server, quindi vale sempre zero. Mostrarlo come «N nuove»
  // prometteva giacenze entrate in VestiFlow, che questa operazione non fa
  // mai — legge Shopify e semmai corregge Shopify (registro difetti 1.2).
  const changedCount = result.updated;
  const republish = republishSuffix(result);
  // Se qualcosa resta disallineato il tono non può essere di successo: la
  // sincronizzazione è finita, ma i due sistemi non dicono la stessa cosa.
  const tone = (result.pendingMismatches ?? 0) > 0 ? 'warning' : 'success';

  if (result.remoteLevelCount === 0) {
    return {
      tone: 'warning',
      message:
        'Nessuna giacenza trovata su Shopify per le varianti e location collegate. Verifica che il tracking quantità sia attivo su Shopify.' +
        republish,
    };
  }

  if (changedCount === 0) {
    return {
      tone,
      message: `Giacenze già allineate (${result.unchanged} righe invariate su Shopify).${republish}`,
    };
  }

  return {
    tone,
    message: `Giacenze confrontate con Shopify: ${result.updated} disallineate su ${result.remoteLevelCount} livelli letti. Le giacenze di VestiFlow non cambiano.${republish}`,
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
