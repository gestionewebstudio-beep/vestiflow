import { variantLabel } from '../common/variant-label.util';

/**
 * **L'etichetta della variante su una riga documento è uno SNAPSHOT.**
 *
 * Sta qui, e non nei quattro compositori di `document_lines`, perché la
 * decisione è una sola e duplicarla quattro volte significherebbe ricreare
 * esattamente il difetto che questa colonna elimina.
 *
 * È la gemella di `document-line-vat-snapshot.util`: stessa disciplina, altro
 * campo. Là si conserva il Codice IVA, qui l'etichetta della variante.
 *
 * ── La regola, e i tre casi ────────────────────────────────────────────────
 *
 * ```text
 * riga NUOVA                          →  si calcola dalla variante scelta
 * riga ESISTENTE, STESSA variante     →  si conserva ESATTAMENTE il persistito
 * riga ESISTENTE, variante DIVERSA    →  si ricalcola dalla nuova
 * ```
 *
 * ⛔ **Non è `persistito ?? calcola`**: quel `??` conserverebbe l'etichetta
 * vecchia anche quando l'operatore cambia articolo sulla riga, scrivendo «M» su
 * una riga che ora è una «L».
 *
 * ⚠️ **E non è nemmeno «ricalcola sempre».** Ricalcolare a ogni salvataggio
 * produce questo:
 *
 * ```text
 * documento di marzo              «Rosso / M»
 * l'opzione si rinomina in anagrafica  →  «Bordeaux / M»
 * si riapre il documento e si salva senza toccare l'articolo
 * → il documento di marzo diventa «Bordeaux / M»      ⛔
 * ```
 *
 * Un documento emesso deve continuare a dire quello che diceva. È la regola
 * `regole-gestionale` — «la riga di un documento è una fotografia, e non si
 * riscatta da sola» — applicata alla variante.
 */

/** Ciò che una riga già persistita porta: la variante, e l'etichetta di allora. */
export interface PersistedLineVariant {
  readonly variantId: string | null;
  readonly variantLabel: string;
}

/**
 * La mappa `id riga → variante persistita`, da passare a `variantLabelSnapshot`.
 *
 * I quattro compositori hanno tutti le righe esistenti in mano — le caricano
 * per sapere quali aggiornare e quali cancellare: questa funzione le trasforma
 * nella forma che serve, così nessuno se la ricostruisce a modo suo.
 */
export function persistedLineVariants(
  lines: readonly { id: string; variantId: string | null; variantLabel: string }[],
): ReadonlyMap<string, PersistedLineVariant> {
  return new Map(
    lines.map((line) => [line.id, { variantId: line.variantId, variantLabel: line.variantLabel }]),
  );
}

/**
 * L'etichetta della variante da scrivere sulla riga.
 *
 * ⛔ Mai `null`: la colonna è `NOT NULL DEFAULT ''`, e il `DEFAULT` è una
 * sicurezza tecnica per le righe di prima — **non** il comportamento ordinario
 * di un writer. Un writer che non valorizza il campo sta sbagliando.
 *
 * `''` significa **«questo articolo non ha varianti visibili»**, compreso il
 * prodotto semplice e il `Default Title` che Shopify assegna ai prodotti senza
 * opzioni: il filtro sta in `variantLabel`, la funzione unica del canale.
 */
export function variantLabelSnapshot(input: {
  /** `null` o assente = riga nuova. */
  readonly lineId: string | null | undefined;
  /** La variante che la riga porta ADESSO. */
  readonly variantId: string | null;
  /** Le opzioni della variante corrente, da cui si compone. */
  readonly optionValues?: unknown;
  /**
   * L'etichetta **già composta**, per chi ce l'ha in mano.
   *
   * ⚠️ Serve al Banco, che risolve le varianti in una forma sua
   * (`ResolvedVariant`) dove l'etichetta è già passata dalla funzione unica.
   * Ricomporla dalle opzioni là significherebbe o portarsi dietro un campo in
   * più, o chiamare due volte la stessa funzione. Vince questa se c'è.
   */
  readonly labelCorrente?: string;
  readonly persisted: ReadonlyMap<string, PersistedLineVariant> | undefined;
  /**
   * La riga SORGENTE, quando questa riga deriva da una duplicazione o da una
   * conversione. Stessa disciplina dei tre codici: si copia com'è.
   */
  readonly sorgente?: LineSourceSnapshot | undefined;
}): string {
  const persistita = input.lineId ? input.persisted?.get(input.lineId) : undefined;
  // ⭐ Il confronto sulla VARIANTE, non la sola presenza del persistito: è ciò
  // che distingue «l'anagrafica è cambiata» da «l'operatore ha cambiato
  // articolo». Il primo caso non deve toccare il documento, il secondo sì.
  if (persistita && persistita.variantId === input.variantId) {
    return persistita.variantLabel;
  }
  // ⭐ Riga DERIVATA: l'etichetta è quella della sorgente. Vuota resta vuota
  //    — su un documento vecchio la variante è impastata nella descrizione, e
  //    ricomporla dall'anagrafica di oggi la riscriverebbe.
  if (input.sorgente && input.sorgente.variantId === input.variantId) {
    return input.sorgente.variantLabel ?? '';
  }

  return input.labelCorrente ?? variantLabel(input.optionValues);
}

// ─────────────────────────────────────────────────────────────────────────────
// L'IDENTITÀ DELL'ARTICOLO — stessa disciplina, altri tre campi (03/09/2026)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Codice articolo, nome prodotto e barcode **fotografati** sulla riga.
 *
 * ⛔ Fino al 03/09/2026 non erano colonne: la maschera li RILEGGEVA
 * dall'anagrafica corrente a ogni apertura, e il codice lo dichiarava —
 * «non hanno una colonna da cui ricaricarsi». Un articolo rinominato riscriveva
 * quindi i documenti già emessi, e una variante eliminata li lasciava senza.
 *
 * ⭐ **Li compone il SERVER dalla variante scelta**, non il client dal proprio
 * payload: una fotografia costruita su dati che arrivano da fuori non è una
 * fotografia, è una dichiarazione di chi la manda.
 *
 * `null` è legittimo e significa **«questa riga non ha un articolo»** — spesa,
 * servizio — oppure «riga scritta prima che la colonna esistesse». Non si
 * inventa un passato (`docs/24` §5.4).
 */
export interface LineIdentitySnapshot {
  readonly articleCode: string | null;
  readonly productName: string | null;
  readonly barcode: string | null;
}

/** Ciò che una riga già persistita porta: la variante, e l'identità di allora. */
export interface PersistedLineIdentity extends LineIdentitySnapshot {
  readonly variantId: string | null;
}

/**
 * La mappa `id riga → identità persistita`.
 *
 * ⚠️ Volutamente separata da `persistedLineVariants`: quella la usano quattro
 * compositori, e questa serve per ora al solo percorso generico. Allargare la
 * struttura condivisa avrebbe toccato Arrivo merce e Banco, che in questa
 * tranche non si toccano.
 */
export function persistedLineIdentities(
  lines: readonly {
    id: string;
    variantId: string | null;
    articleCode: string | null;
    productName: string | null;
    barcode: string | null;
  }[],
): ReadonlyMap<string, PersistedLineIdentity> {
  return new Map(
    lines.map((line) => [
      line.id,
      {
        variantId: line.variantId,
        articleCode: line.articleCode,
        productName: line.productName,
        barcode: line.barcode,
      },
    ]),
  );
}

/**
 * L'identità da scrivere sulla riga, con gli stessi tre casi di
 * `variantLabelSnapshot`:
 *
 * ```text
 * riga NUOVA                          →  si fotografa la variante scelta
 * riga ESISTENTE, STESSA variante     →  si conserva ESATTAMENTE il persistito
 * riga ESISTENTE, variante DIVERSA    →  si rifotografa dalla nuova
 * ```
 *
 * ⛔ **Il confronto è sulla VARIANTE, non sulla presenza del persistito.** È ciò
 * che distingue «l'anagrafica è cambiata» — e allora il documento non si tocca —
 * da «l'operatore ha cambiato articolo», dove la riga deve seguire.
 *
 * ⚠️ Su riga esistente si conserva **anche quando il persistito è tutto `null`**:
 * una riga scritta prima di queste colonne non acquista un'identità al primo
 * risalvataggio, perché quella sarebbe l'anagrafica di oggi su un documento di
 * ieri — cioè la fotografia inventata che §5.4 vieta.
 */
/**
 * La riga di documento da cui una riga DERIVA — duplicazione o conversione.
 *
 * ⭐ La legge il SERVER dal database, per id: e' cosi' che gli snapshot si
 * conservano senza che il client possa comporli. I valori qui dentro si
 * copiano **come sono**, `null` compresi.
 */
export interface LineSourceSnapshot {
  readonly articleCode: string | null;
  readonly productName: string | null;
  readonly barcode: string | null;
  readonly variantLabel: string | null;
  readonly unitOfMeasure: string | null;
  /** La variante che la riga sorgente portava: serve a nient'altro che a leggerla. */
  readonly variantId: string | null;
}

export function lineIdentitySnapshot(input: {
  /** `null` o assente = riga nuova. */
  readonly lineId: string | null | undefined;
  /** La variante che la riga porta ADESSO. */
  readonly variantId: string | null;
  /** L'identità corrente della variante, letta dal server. */
  readonly corrente: LineIdentitySnapshot | undefined;
  readonly persisted: ReadonlyMap<string, PersistedLineIdentity> | undefined;
  /**
   * La riga SORGENTE, quando questa riga deriva da una duplicazione o da una
   * conversione. Risolta dal server per id, con tenant verificato.
   */
  readonly sorgente?: LineSourceSnapshot | undefined;
}): LineIdentitySnapshot {
  const persistita = input.lineId ? input.persisted?.get(input.lineId) : undefined;
  if (persistita && persistita.variantId === input.variantId) {
    return {
      articleCode: persistita.articleCode,
      productName: persistita.productName,
      barcode: persistita.barcode,
    };
  }
  // ⭐ **Riga DERIVATA** (duplicazione, conversione): l'identità è quella
  //    della riga sorgente, copiata **come sta** — `null` compresi. Un valore
  //    storico assente resta assente: ricostruirlo dall'anagrafica di oggi
  //    metterebbe su un duplicato di marzo il codice di settembre.
  //
  // ⚠️ Il ramo sta PRIMA di quello corrente e DOPO il persistito: una riga
  //    già salvata non deriva da nulla, e se il client mandasse comunque un
  //    riferimento, a vincere resterebbe ciò che la riga dice di sé.
  //
  // ⛔ Se l'operatore ha cambiato variante dopo il prefill, la riga non
  //    deriva più dalla sorgente e il client non manda il riferimento. Il
  //    controllo sulla variante è comunque qui, perché una sorgente che
  //    parla di un altro articolo non descrive questa riga.
  if (input.sorgente && input.sorgente.variantId === input.variantId) {
    return {
      articleCode: input.sorgente.articleCode,
      productName: input.sorgente.productName,
      barcode: input.sorgente.barcode,
    };
  }

  // Riga NUOVA dal catalogo, o riga senza articolo (spesa, servizio): tre
  // `null`, ed è uno stato valido.
  return {
    articleCode: input.corrente?.articleCode ?? null,
    productName: input.corrente?.productName ?? null,
    barcode: input.corrente?.barcode ?? null,
  };
}
