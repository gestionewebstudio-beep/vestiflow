/**
 * Il contratto della PRIMA CONNESSIONE (`docs/27`), specchio di
 * `api/src/shopify/shopify-setup.model.ts`. Chi cambia una forma là la cambia
 * anche qui: è un `fetch`, non un import, e il compilatore non se ne accorge.
 */

export type ShopifySetupDirection = 'shopify_to_vestiflow' | 'vestiflow_to_shopify';

export type ShopifySetupStatus =
  'scelte' | 'sedi' | 'controllo' | 'trasferimento' | 'interrotto' | 'trasferito' | 'attivato';

export type ShopifyLocationChoiceKind = 'collega' | 'crea' | 'lascia';

export interface ShopifySetupLocationDto {
  readonly shopifyLocationId: string;
  readonly name: string;
  readonly active: boolean;
  readonly choice: ShopifyLocationChoiceKind | null;
  readonly locationId: string | null;
  readonly locationName: string | null;
}

export interface ShopifySetupSedeVestiFlowDto {
  readonly id: string;
  readonly name: string;
  readonly code: string | null;
  /** Già collegata a UNA location Shopify (coppia attiva): non si può scegliere per un'altra. */
  readonly shopifyLocationId: string | null;
}

export interface ShopifySetupAmbiguoDto {
  readonly sku: string;
  readonly locale: { readonly productId: string; readonly nome: string };
  readonly remoto: { readonly shopifyProductId: string; readonly titolo: string };
}

export interface ShopifySetupQuantitaRigaDto {
  readonly sku: string | null;
  readonly articolo: string;
  readonly variante: string | null;
  readonly sede: string;
  readonly attuale: number;
  readonly prevista: number;
  readonly delta: number;
}

export interface ShopifySetupNonDeterminabileDto {
  readonly sku: string | null;
  readonly articolo: string;
  readonly sede: string;
  readonly motivo:
    'articolo_assente' | 'sede_non_stoccata' | 'quantita_assente' | 'lettura_fallita';
}

export interface ShopifySetupAnteprimaDto {
  readonly computedAt: string;
  readonly direction: ShopifySetupDirection;
  readonly catalogo: {
    readonly remoti: number;
    readonly locali: number;
    readonly collegati: number;
    readonly daImportare: number;
    readonly daAggiornare: number;
    readonly daPubblicare: number;
    readonly ambigui: readonly ShopifySetupAmbiguoDto[];
  };
  readonly sedi: {
    readonly collegate: readonly {
      readonly locationId: string;
      readonly nome: string;
      readonly shopifyLocationId: string;
      readonly shopifyName: string;
    }[];
    readonly lasciate: readonly {
      readonly shopifyLocationId: string;
      readonly shopifyName: string;
    }[];
    readonly daDecidere: readonly {
      readonly shopifyLocationId: string;
      readonly shopifyName: string;
    }[];
  };
  readonly quantita: {
    readonly coppie: number;
    readonly righe: readonly ShopifySetupQuantitaRigaDto[];
    readonly righeTotali: number;
    readonly nonDeterminabili: readonly ShopifySetupNonDeterminabileDto[];
    readonly articoliNuovi: number;
  };
  readonly ordini: {
    readonly aperti: number;
    readonly parziali: number;
    readonly senzaSede: number;
    readonly giaInVestiFlow: number;
    readonly elenco: readonly {
      readonly shopifyOrderId: string;
      readonly nome: string;
      readonly stato: 'aperto' | 'parziale';
      readonly righe: number;
      readonly sedeDeterminabile: boolean;
      readonly giaInVestiFlow: boolean;
    }[];
  };
  /** Ciò che impedisce di confermare. Vuoto = si può confermare. */
  readonly blocchi: readonly string[];
}

/**
 * L’esito di un allineamento delle quantità — o il suo FERMO (specchio dell’API).
 * `fermo` presente = nessuna coppia esaminata: ordini di canale aperti senza sede,
 * e scrivere il Disponibile avrebbe alzato l’on_hand Shopify di pezzi già promessi.
 */
export interface ShopifySetupAllineaDto {
  readonly totale: number;
  readonly allineate: number;
  readonly giaAllineate: number;
  readonly nonAllineate: number;
  readonly fermo?: { readonly motivo: string; readonly ordini: readonly string[] };
}

/** Un caso che l’attivazione NON risolve, nominato (specchio dell’API). */
export interface ShopifySetupIrrisoltoDto {
  readonly tipo: 'articolo' | 'coppia' | 'ordine';
  readonly riferimento: string;
  readonly nome: string;
  readonly motivo: string;
}

export interface ShopifySetupEsclusoDto {
  readonly tipo: 'articolo' | 'coppia';
  readonly riferimento: string;
  readonly nome: string;
  readonly motivo: string;
  readonly dettaglio?: string;
}

export interface ShopifySetupEsitoDto {
  readonly fase: 'catalogo' | 'quantita' | 'concluso';
  readonly startedAt: string;
  readonly finishedAt: string | null;
  /** Presente quando il trasferimento si è fermato prima della fine: MAI «completato». */
  readonly interruzione: { readonly at: string; readonly message: string } | null;
  readonly catalogo: {
    readonly imported: number;
    readonly updated: number;
    readonly skipped: number;
    readonly failed: number;
    readonly esclusiAmbigui: number;
  } | null;
  readonly quantita: {
    readonly coppie: number;
    readonly scritte: number;
    readonly invariate: number;
    readonly giaScritte: number;
    readonly nonDeterminabili: number;
  } | null;
  readonly allinea: ShopifySetupAllineaDto | null;
  readonly esclusi: readonly ShopifySetupEsclusoDto[];
  readonly attivazione?: {
    readonly ordini: {
      readonly totale: number;
      readonly acquisiti: number;
      readonly giaPresenti: number;
      readonly senzaSede: number;
      readonly parziali: number;
      readonly falliti: number;
    };
    readonly base: ShopifySetupAllineaDto;
    readonly ordersSinceId: string | null;
  };
}

/**
 * ⭐ La SITUAZIONE ATTUALE (13/09/2026): i problemi aperti, letti a ogni
 *    richiesta, ognuno con causa, conseguenza e azione. Distinta dall'esito
 *    dell'ultimo tentativo, che è una fotografia con la sua data (`docs/27` §4-bis).
 */
export type ShopifySetupProblemaTipo = 'ordine' | 'coppia' | 'articolo' | 'connessione';

export type ShopifySetupProblemaCausa =
  | 'ordine_permesso_fulfillment_orders'
  | 'ordine_assegnazione_in_attesa'
  | 'ordine_location_non_collegata'
  | 'ordine_riga_divisa'
  | 'ordine_lettura_fallita'
  | 'ordine_sede_da_rileggere'
  | 'ordini_acquisizione_fallita'
  | 'coppia_senza_base'
  | 'coppia_non_stoccata'
  | 'coppia_lettura_fallita'
  | 'coppia_ferma_ordine_senza_sede'
  | 'articolo_sku_ambiguo'
  | 'articolo_import_fallito'
  | 'articolo_pubblicazione_fallita'
  | 'connessione_ambiti_mancanti'
  | 'connessione_webhook_mancanti';

export type ShopifySetupProblemaAzioneTipo =
  | 'apri_ordine'
  | 'apri_articolo'
  | 'sedi'
  | 'permessi'
  | 'allinea'
  | 'importa_ordini'
  | 'webhook'
  /** Da fare SU SHOPIFY: distinto da `nessuna` (13/09/2026, `docs/29` §2.3). */
  | 'shopify'
  | 'nessuna';

export interface ShopifySetupProblemaAzione {
  readonly tipo: ShopifySetupProblemaAzioneTipo;
  readonly etichetta: string;
  readonly riferimento: string | null;
}

export interface ShopifySetupProblemaDto {
  readonly tipo: ShopifySetupProblemaTipo;
  readonly causa: ShopifySetupProblemaCausa;
  readonly riferimento: string;
  readonly nome: string;
  readonly dettaglio: string | null;
  readonly sede: string | null;
  readonly conseguenza: string;
  readonly azione: ShopifySetupProblemaAzione;
  readonly apri: ShopifySetupProblemaAzione | null;
  /** Quando è stato rilevato (fotografia); `null` = letto adesso. */
  readonly rilevatoAt: string | null;
}

export interface ShopifySetupSituazioneDto {
  readonly calcolataAt: string;
  readonly problemi: readonly ShopifySetupProblemaDto[];
}

export interface ShopifySetupDto {
  /** `false` = nessun percorso per questa connessione (nata prima, o mai iniziato). */
  readonly presente: boolean;
  readonly status: ShopifySetupStatus | null;
  readonly direction: ShopifySetupDirection | null;
  readonly locations: readonly ShopifySetupLocationDto[];
  readonly sediVestiFlow: readonly ShopifySetupSedeVestiFlowDto[];
  readonly anteprima: ShopifySetupAnteprimaDto | null;
  readonly esito: ShopifySetupEsitoDto | null;
  readonly confirmedAt: string | null;
  readonly activatedAt: string | null;
  /** Ciò che impedisce l’attivazione adesso. Vuoto = si può attivare. */
  readonly blocchiAttivazione: readonly string[];
  /** I casi che l’attivazione NON risolve: restano fuori e nominati, prima e dopo. */
  readonly irrisolti: readonly ShopifySetupIrrisoltoDto[];
  readonly trasferimentoInCorso: boolean;
  /** ⭐ I problemi aperti ADESSO (13/09/2026), distinti dall'esito dell'ultimo tentativo. */
  readonly situazione: ShopifySetupSituazioneDto;
}

/** Una scelta su una location Shopify, come la manda il client. */
export type ShopifySetupLocationChoiceInput =
  | { readonly choice: 'collega'; readonly locationId: string }
  | { readonly choice: 'crea'; readonly name?: string }
  | { readonly choice: 'lascia' };

/**
 * Le tre fasi VISIBILI del percorso (`docs/27` §1), e lo stato che le abita:
 * scelte → sedi → controllo (anteprima e conferma). Trasferimento, interruzione
 * ed esito stanno nella terza, perché è lì che si preme «Conferma».
 */
export type ShopifySetupFase = 'scelte' | 'sedi' | 'controllo';

export function faseDelPercorso(status: ShopifySetupStatus | null): ShopifySetupFase {
  switch (status) {
    case 'scelte':
    case null:
      return 'scelte';
    case 'sedi':
      return 'sedi';
    default:
      return 'controllo';
  }
}

/**
 * La situazione attuale del percorso, con tolleranza: un'API che non la porta
 * ancora (o una risposta di prova senza) vale «letta adesso, nessun problema»
 * — così il pannello non si spegne per un campo assente.
 */
export function situazioneDi(setup: ShopifySetupDto | null): ShopifySetupSituazioneDto {
  return setup?.situazione ?? { calcolataAt: '', problemi: [] };
}

/** Finché il percorso c’è e non è attivato, i comandi di sincronizzazione restano chiusi. */
export function percorsoBloccaSincronizzazione(setup: ShopifySetupDto | null): boolean {
  return setup?.presente === true && setup.status !== 'attivato';
}

/**
 * ⭐ Le scelte sulle sedi si fanno FUORI dal percorso quando il percorso non
 *    c’è (connessione nata prima) o è già attivato — cioè anche dopo una
 *    disconnessione e riconnessione, quando vanno riscelte (12/09/2026).
 *    Mentre il percorso è in corso le scelte stanno nella sua fase 2.
 */
export function sceltaSediFuoriPercorso(setup: ShopifySetupDto | null): boolean {
  return setup !== null && (!setup.presente || setup.status === 'attivato');
}
