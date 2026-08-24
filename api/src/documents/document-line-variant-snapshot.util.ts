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
}): string {
  const persistita = input.lineId ? input.persisted?.get(input.lineId) : undefined;
  // ⭐ Il confronto sulla VARIANTE, non la sola presenza del persistito: è ciò
  // che distingue «l'anagrafica è cambiata» da «l'operatore ha cambiato
  // articolo». Il primo caso non deve toccare il documento, il secondo sì.
  if (persistita && persistita.variantId === input.variantId) {
    return persistita.variantLabel;
  }
  return input.labelCorrente ?? variantLabel(input.optionValues);
}
