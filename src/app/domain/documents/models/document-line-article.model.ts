import type { EntityId } from '@core/models/common.model';
import type { VatCode } from '@core/models/vat-code.model';

import type { DocumentListinoChoice } from '../utils/document-listino.util';

/**
 * **Il gesto «un articolo entra nella riga», in un contratto solo.**
 *
 * Contratto normativo: `docs/03c-contratto-risolutore-riga.md`, approvato con
 * correzioni il 24/08/2026. Sopra di lui stanno
 * `docs/03-specifica-unificazione-righe-documento.md` e
 * `docs/CONTRATTO-COMUNE-DOCUMENTI.md`, che prevalgono.
 *
 * ── I due confini, e non sono formali ──────────────────────────────────────
 *
 * ⛔ **L'anagrafica si LEGGE, non si scrive.** Il risolutore può restituire
 * anche i valori d'anagrafica che servono all'Arrivo merce — prezzo di vendita,
 * Shopify, barrato — ma non scrive mai in `Product`/`ProductVariant`. Se
 * potesse, ogni documento che lo usa erediterebbe quella facoltà, e «scelgo un
 * articolo» diventerebbe una modifica del catalogo su sei maschere che non
 * devono poterla fare. La scrittura all'indietro resta una policy dell'Arrivo
 * merce, eseguita dal suo flusso quando le sue spunte lo autorizzano.
 *
 * ⛔ **Numerazione e serie non lo riguardano.** Numero, serie, contatori e
 * riferimento sono dati di TESTATA, con un motore e una specifica propri: il
 * gesto «un articolo entra nella riga» non li sfiora, e non compaiono qui.
 *
 * ── Cosa resta fuori, e a chi appartiene ───────────────────────────────────
 *
 * ```text
 * acquisizione   →  DOVE atterra l'articolo, e se si somma a una riga esistente
 * risolutore     →  COSA quell'articolo propone alla riga          ← questo file
 * maschera       →  scrive i FormControl, dirty, emitEvent, fuoco
 * ```
 *
 * La **quantità** non compare nell'uscita: la scrive l'acquisizione, che è
 * l'unica a sapere se si sta aggiungendo una riga o sommando a una esistente.
 */

/**
 * ⭐ **L'unica policy con una ragione fiscale.**
 *
 * Vendita e acquisto sono due famiglie **disgiunte**: un codice di vendita su un
 * Ordine fornitore non è scomodo, è sbagliato. E l'acquisto ha un anello che la
 * vendita non ha — il fornitore porta un `defaultVatCodeId`, il cliente no.
 *
 * `nessuna` non è assenza per pigrizia: un trasferimento fra sedi proprie non
 * ha imponibile, e produrre un codice IVA lì significa produrre un campo che
 * nessun payload persiste.
 */
export type FamigliaIva = 'vendita' | 'acquisto' | 'nessuna';

/**
 * Cosa la riga di questo documento **sa ospitare**. L'uscita è già filtrata su
 * questo insieme: chi chiama non deve chiedersi se un campo lo riguarda.
 */
export type CampoArticolo =
  | 'sku'
  | 'articleCode'
  | 'barcode'
  /** ⛔ Il NOME, mai il display completo: la variante sta in un campo suo. */
  | 'nomeProdotto'
  | 'variantLabel'
  | 'unitaDiMisura'
  | 'codiceIva'
  /** Valore economico di VENDITA della riga. */
  | 'prezzoUnitario'
  /** Valore economico di ACQUISTO della riga. */
  | 'costoUnitario'
  /** I tre che l'Arrivo merce LEGGE per scrivere all'indietro: vedi confine 1. */
  | 'prezzoVenditaAnagrafica'
  | 'prezzoShopifyAnagrafica'
  | 'prezzoBarratoAnagrafica'
  /** ⛔ ELEGGIBILITÀ, non una spunta: vedi `ValoriArticoloDaScrivere`. */
  | 'gestisceMagazzino'
  | 'sconto'
  | 'codiceFornitore';

export interface PolicyRichiamoArticolo {
  readonly famigliaIva: FamigliaIva;
  /**
   * ⛔ **NON è un insieme statico del profilo: è la capacità EFFETTIVA.**
   *
   * ```text
   * profilo base  +  feature gate del tenant  +  permessi  =  campi
   * ```
   *
   * Senza la composizione due cose vanno storte, e nessuna si vede: un tenant
   * senza Shopify riceverebbe un campo che per lui non esiste, e a un utente a
   * cui il costo è mascherato il risolutore proporrebbe un valore che non ha il
   * diritto di vedere — o, peggio, un vuoto che glielo cancella.
   */
  readonly campi: ReadonlySet<CampoArticolo>;
}

/**
 * Quattro profili per sette maschere.
 *
 * I due d'acquisto differiscono per due sole cose — i tre prezzi d'anagrafica e
 * la spunta di carico — e restano separati: fonderli produrrebbe su un ordine
 * fornitore tre prezzi che nessuno scrive.
 */
export type ProfiloRigaDocumento =
  'vendita' | 'acquisto-ordine' | 'acquisto-arrivo' | 'movimento-interno';

const CAMPI_IDENTITA: readonly CampoArticolo[] = [
  'sku',
  'articleCode',
  'barcode',
  'nomeProdotto',
  'variantLabel',
];

/**
 * I profili BASE. ⚠️ Non usarli direttamente: passano da `campiEffettivi`, che
 * ci applica sopra i feature gate del tenant e i permessi dell'utente.
 *
 * `Record` esaustivo: un profilo nuovo che non si dichiara qui non compila.
 */
export const PROFILI_RIGA_DOCUMENTO: Record<ProfiloRigaDocumento, PolicyRichiamoArticolo> = {
  vendita: {
    famigliaIva: 'vendita',
    campi: new Set<CampoArticolo>([
      ...CAMPI_IDENTITA,
      'unitaDiMisura',
      'codiceIva',
      'prezzoUnitario',
      'gestisceMagazzino',
      'sconto',
      'codiceFornitore',
    ]),
  },
  'acquisto-ordine': {
    famigliaIva: 'acquisto',
    campi: new Set<CampoArticolo>([
      ...CAMPI_IDENTITA,
      'unitaDiMisura',
      'codiceIva',
      'costoUnitario',
      'sconto',
      'codiceFornitore',
    ]),
  },
  'acquisto-arrivo': {
    famigliaIva: 'acquisto',
    campi: new Set<CampoArticolo>([
      ...CAMPI_IDENTITA,
      'unitaDiMisura',
      'codiceIva',
      'costoUnitario',
      // I tre che solo l'Arrivo merce mostra, per proporre di riscriverli in
      // anagrafica. Il risolutore li LEGGE: la scrittura è del suo flusso.
      'prezzoVenditaAnagrafica',
      'prezzoShopifyAnagrafica',
      'prezzoBarratoAnagrafica',
      'gestisceMagazzino',
      'sconto',
      'codiceFornitore',
    ]),
  },
  'movimento-interno': {
    famigliaIva: 'nessuna',
    // Nessun denaro: la proprietà non cambia, quindi non c'è imponibile.
    campi: new Set<CampoArticolo>([...CAMPI_IDENTITA, 'unitaDiMisura', 'gestisceMagazzino']),
  },
};

/** Le capacità che il tenant e i permessi possono togliere a un profilo. */
export interface CapacitaEffettive {
  /** Senza il modulo Shopify quel prezzo non esiste per questo tenant. */
  readonly shopifyAttivo: boolean;
  /** `showPurchaseCosts`: a chi non lo vede, il costo non si propone nemmeno. */
  readonly costiVisibili: boolean;
}

/**
 * I campi che il risolutore può davvero produrre: profilo **meno** ciò che il
 * tenant non ha e ciò che i permessi mascherano.
 *
 * ⛔ Togliere un campo qui NON è come restituirlo vuoto: una chiave assente
 * significa «non toccare», mentre un valore vuoto **cancella** ciò che c'è. Per
 * il costo mascherato la differenza è tutta lì.
 */
export function campiEffettivi(
  profilo: ProfiloRigaDocumento,
  capacita: CapacitaEffettive,
): ReadonlySet<CampoArticolo> {
  const campi = new Set(PROFILI_RIGA_DOCUMENTO[profilo].campi);
  if (!capacita.shopifyAttivo) {
    campi.delete('prezzoShopifyAnagrafica');
  }
  if (!capacita.costiVisibili) {
    campi.delete('costoUnitario');
  }
  return campi;
}

/** Stato del mondo al richiamo: ciò che non viene dall'articolo né dalla riga. */
export interface ContestoRichiamoArticolo {
  /** `'article'` dove non esiste un selettore di listino in testata. */
  readonly listino: DocumentListinoChoice;
  readonly codiciIvaPerId: ReadonlyMap<EntityId, VatCode>;
  /**
   * Codice IVA del FORNITORE di testata. Sempre `null` in vendita: il cliente
   * non ne porta uno, e la catena salta l'anello senza doverlo sapere.
   */
  readonly codiceIvaControparte: EntityId | null;
  /** Predefinito aziendale, già filtrato sulla famiglia dal chiamante. */
  readonly codiceIvaPredefinito: EntityId | null;
  /**
   * Sconto d'anagrafica della controparte di testata, cliente o fornitore.
   * La stringa a cascata («4+10») si passa **intatta**, mai risolta.
   */
  readonly scontoControparte: string | null;
  /** Il codice con cui l'aggancio è avvenuto, se era un codice fornitore. */
  readonly codiceFornitoreDigitato: string | null;
  /** Il collegamento articolo↔fornitore di testata, dove la maschera lo carica. */
  readonly codiceFornitoreDiTestata: string | null;
}

/** I valori correnti della riga che il risolutore deve conoscere. Tre, non uno di più. */
export interface StatoRigaAlRichiamo {
  readonly variantIdPrecedente: EntityId | null;
  /** Ha già un id sul server. Serve SOLO a segnalare, non a cambiare l'esito. */
  readonly rigaPersistita: boolean;
  /** DIGITATO: se non è vuoto, il risolutore non propone nulla. */
  readonly scontoCorrente: string;
}

/**
 * I campi **da scrivere**, già filtrati sulle capacità.
 *
 * ⛔ Una chiave assente significa **«non toccare»**, mai «svuota». Per svuotare
 * c'è la stringa vuota o `null`.
 */
export interface ValoriArticoloDaScrivere {
  /**
   * Il NOME dell'articolo, canonico e separato dalla variante.
   *
   * ⛔ **Nessun ripiego su `title`**: `title` è il display completo e
   * **contiene la variante**, quindi `productName || title` la rimetterebbe
   * dentro il nome — il difetto che questo contratto elimina, riattivato dal
   * caso limite. Se `productName` fosse vuoto, è la summary a essere sbagliata.
   */
  readonly nomeProdotto?: string;
  readonly variantLabel?: string;
  readonly sku?: string;
  readonly articleCode?: string;
  readonly barcode?: string;
  readonly unitaDiMisura?: string;
  readonly codiceIva?: EntityId | null;
  /** SEMPRE netto canonico in unità minori, MAI la stringa da mostrare. */
  readonly prezzoUnitarioNettoMinor?: number | null;
  readonly costoUnitarioNettoMinor?: number;
  readonly prezzoVenditaNettoMinor?: number | null;
  readonly prezzoShopifyNettoMinor?: number | null;
  readonly prezzoBarratoNettoMinor?: number | null;
  /**
   * ⛔ **ELEGGIBILITÀ dell'articolo, non il valore di una spunta.**
   *
   * La regola è una sola e vale per tutti. Ma **Impegna, Carica e Scarica
   * restano tre effetti distinti** — campo persistito, default, effetto sul
   * backend e significato non si fondono (`03` §18.4, Blocco 0 §6.2). È il
   * consumer a mapparla:
   *
   * ```text
   * Ordine cliente  →  commitsStock
   * Arrivo merce    →  loadsStock (Carica)
   * Vendita, DDT    →  Scarica
   * Reso            →  Carica
   * ```
   */
  readonly gestisceMagazzino?: boolean;
  readonly sconto?: string;
  readonly codiceFornitore?: string;
}

/** Letture di ADESSO, non del documento: si riscrivono anche su riga salvata. */
export interface LettureVive {
  readonly giacenza: number | null;
  readonly disponibile: number | null;
}

export type SegnalazioneRichiamo =
  | { readonly tipo: 'prezzo-assente-per-listino'; readonly listino: DocumentListinoChoice }
  | { readonly tipo: 'codice-iva-non-risolto' }
  | { readonly tipo: 'codice-iva-articolo-di-altra-famiglia'; readonly vatCodeId: EntityId }
  | {
      readonly tipo: 'articolo-non-eleggibile-a-magazzino';
      readonly causa: 'servizio' | 'non-gestito';
    }
  | { readonly tipo: 'articolo-sostituito-su-riga-salvata'; readonly precedente: EntityId };

/**
 * ⛔ Union discriminata: **o si risolve tutto, o non si scrive niente.**
 *
 * Non esiste il risultato parziale, ed è il difetto che chiude: oggi tre
 * maschere agganciano una riga con il solo `variantId` quando il riepilogo non
 * è arrivato, e la riga resta senza descrizione — che è `required`, quindi il
 * salvataggio si rifiuta senza dire quale riga.
 */
export type EsitoRichiamoArticolo =
  | {
      readonly esito: 'risolto';
      readonly valori: ValoriArticoloDaScrivere;
      readonly letture: LettureVive;
      readonly segnalazioni: readonly SegnalazioneRichiamo[];
    }
  | { readonly esito: 'articolo-illeggibile'; readonly variantId: EntityId };
