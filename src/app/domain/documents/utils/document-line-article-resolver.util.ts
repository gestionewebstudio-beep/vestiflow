import type { VatCode } from '@core/models/vat-code.model';
import { isPurchaseVatCode, isSalesVatCode } from '@core/models/vat-code.model';
import type { VariantSummary } from '@domain/products/models/variant-summary.model';

import type {
  CampoArticolo,
  ContestoRichiamoArticolo,
  EsitoRichiamoArticolo,
  FamigliaIva,
  PolicyRichiamoArticolo,
  SegnalazioneRichiamo,
  StatoRigaAlRichiamo,
} from '../models/document-line-article.model';
import { listinoUnitPrice } from './document-listino.util';
import { supplierCodeForDocumentLine } from './document-code-match.util';

/**
 * **Il richiamo di un articolo su una riga documento.**
 *
 * La riga si **resetta** e prende i valori dell'articolo — anche a parità di
 * articolo. Dove l'articolo non ha un valore, il campo torna vuoto.
 *
 * Restano fuori due sole cose, e per la stessa ragione: **non hanno una
 * sorgente in anagrafica**, quindi non c'è niente con cui sostituirle.
 *
 * - la **quantità** non compare nemmeno nell'uscita: la scrive il livello di
 *   acquisizione, l'unico a sapere se si aggiunge una riga o si somma a una
 *   esistente;
 * - lo **sconto digitato** si conserva: si propone quello della controparte
 *   solo su un campo vuoto.
 *
 * ⛔ **Pura e sincrona.** Nessun `FormControl`, nessuna rete, nessuna
 * conversione di visualizzazione. I valori economici escono **netti in unità
 * minori con la loro coda**: la conversione netto/ivato e la stringa a due
 * decimali sono della maschera, che è l'unica a conoscere la propria modalità.
 *
 * Contratto: `docs/03c-contratto-risolutore-riga.md`.
 */
export function resolveDocumentLineArticle(input: {
  readonly articolo: VariantSummary | null;
  readonly variantIdRichiesto: string;
  readonly policy: PolicyRichiamoArticolo;
  readonly contesto: ContestoRichiamoArticolo;
  readonly riga: StatoRigaAlRichiamo;
}): EsitoRichiamoArticolo {
  const { articolo, variantIdRichiesto, policy, contesto, riga } = input;

  // ⛔ O si risolve tutto, o non si scrive niente: il risultato parziale è
  // il difetto che questo contratto chiude.
  if (!articolo) {
    return { esito: 'articolo-illeggibile', variantId: variantIdRichiesto };
  }

  const segnalazioni: SegnalazioneRichiamo[] = [];
  const valori: Record<string, unknown> = {};
  const puo = (campo: CampoArticolo): boolean => policy.campi.has(campo);
  const scrivi = (campo: CampoArticolo, chiave: string, valore: unknown): void => {
    if (puo(campo)) {
      valori[chiave] = valore;
    }
  };

  // ── Identità ─────────────────────────────────────────────────────────────
  //
  // ⛔ `nomeProdotto` NON ripiega su `title`: quello è il display completo e
  // contiene la variante, quindi il ripiego la rimetterebbe dentro il nome
  // proprio nel caso in cui nessuno se ne accorge. Se `productName` è vuoto,
  // è la summary a essere sbagliata e si corregge lì.
  scrivi('nomeProdotto', 'nomeProdotto', articolo.productName);
  scrivi('variantLabel', 'variantLabel', articolo.variantLabel);
  scrivi('sku', 'sku', articolo.sku);
  scrivi('articleCode', 'articleCode', articolo.articleCode);
  scrivi('barcode', 'barcode', articolo.barcode ?? '');

  // ── Unità di misura ──────────────────────────────────────────────────────
  //
  // Nessun `'pz'` cablato e nessun default di tenant: `03` §13 dice che il
  // default viene dall'ARTICOLO. Se l'articolo non la porta, la cella resta
  // vuota — e se fosse la summary a non portarla, si corregge la summary.
  scrivi('unitaDiMisura', 'unitaDiMisura', articolo.unitOfMeasure ?? '');

  // ── Magazzino: ELEGGIBILITÀ, non una spunta ──────────────────────────────
  //
  // La regola è una sola. Impegna, Carica e Scarica restano tre effetti
  // distinti, e li mappa il consumer sul proprio campo.
  //
  // `managesStock` assente vale `true`: l'assenza di un campo non è una
  // negazione. Ma `kind === 'service'` chiude comunque.
  if (puo('gestisceMagazzino')) {
    const servizio = articolo.kind === 'service';
    const nonGestito = articolo.managesStock === false;
    valori['gestisceMagazzino'] = !servizio && !nonGestito;
    if (servizio || nonGestito) {
      segnalazioni.push({
        tipo: 'articolo-non-eleggibile-a-magazzino',
        causa: servizio ? 'servizio' : 'non-gestito',
      });
    }
  }

  // ── Codice IVA ───────────────────────────────────────────────────────────
  if (puo('codiceIva')) {
    const esito = risolviCodiceIva(articolo, policy.famigliaIva, contesto);
    valori['codiceIva'] = esito.vatCodeId;
    segnalazioni.push(...esito.segnalazioni);
  }

  // ── Valori economici ─────────────────────────────────────────────────────
  //
  // Netti canonici in unità minori, coda compresa. Mai stringhe.
  if (puo('prezzoUnitario')) {
    const prezzo = listinoUnitPrice(articolo, contesto.listino);
    valori['prezzoUnitarioNettoMinor'] = prezzo?.amountMinor ?? null;
    if (!prezzo) {
      // Oggi lo stesso articolo entra a zero in silenzio dall'ingresso e con
      // avviso dal cambio listino: stessa condizione, due esiti.
      segnalazioni.push({ tipo: 'prezzo-assente-per-listino', listino: contesto.listino });
    }
  }

  // ⛔ Il costo canonico è NUMERICO, zero compreso. Se il campo non è nelle
  // capacità — costo mascherato dai permessi — la chiave NON si produce: un
  // `null` scritto sulla riga cancellerebbe il costo a chi non ha il diritto
  // di vederlo. Assente vuol dire «non toccare».
  scrivi('costoUnitario', 'costoUnitarioNettoMinor', articolo.purchasePrice?.amountMinor ?? 0);

  scrivi('prezzoVenditaAnagrafica', 'prezzoVenditaNettoMinor', articolo.sellingPrice.amountMinor);
  scrivi(
    'prezzoShopifyAnagrafica',
    'prezzoShopifyNettoMinor',
    articolo.shopifyPrice?.amountMinor ?? null,
  );
  // ⚠️ `null` non è zero: un barrato assente è `null`, e verso Shopify la
  // chiave non entra nella riga — «0.00» là è uno sconto inventato del 100%.
  scrivi(
    'prezzoBarratoAnagrafica',
    'prezzoBarratoNettoMinor',
    articolo.compareAtPrice?.amountMinor ?? null,
  );

  // ── Sconto: digitato = intoccabile ───────────────────────────────────────
  //
  // Non ha una sorgente in anagrafica, quindi non c'è niente con cui
  // sostituirlo. Si propone quello della controparte solo su un campo vuoto,
  // e la stringa a cascata («4+10») si passa intatta, mai risolta.
  if (puo('sconto') && !riga.scontoCorrente.trim() && contesto.scontoControparte) {
    valori['sconto'] = contesto.scontoControparte;
  }

  // ── Codice fornitore ─────────────────────────────────────────────────────
  scrivi(
    'codiceFornitore',
    'codiceFornitore',
    supplierCodeForDocumentLine({
      linkedWith: contesto.codiceFornitoreDigitato ?? undefined,
      ofDocumentSupplier: contesto.codiceFornitoreDiTestata ?? undefined,
    }),
  );

  // ── Segnalazione: sostituzione su una riga già salvata ───────────────────
  //
  // Non cambia l'esito: il richiamo resetta comunque. Serve a poterlo dire.
  if (
    riga.rigaPersistita &&
    riga.variantIdPrecedente &&
    riga.variantIdPrecedente !== articolo.variantId
  ) {
    segnalazioni.push({
      tipo: 'articolo-sostituito-su-riga-salvata',
      precedente: riga.variantIdPrecedente,
    });
  }

  return {
    esito: 'risolto',
    valori: valori,
    letture: {
      giacenza: articolo.stockOnHand ?? null,
      disponibile: articolo.stockAvailable ?? null,
    },
    segnalazioni,
  };
}

/**
 * La catena del Codice IVA, e i suoi anelli sono **due in vendita, tre in
 * acquisto**: il fornitore porta un predefinito, il cliente no.
 *
 * ⚠️ Se l'articolo porta un codice dell'**altra famiglia** l'anello si salta
 * **e si segnala**: oggi si salta in silenzio, e l'operatore non sa perché il
 * codice del prodotto non è stato preso.
 */
function risolviCodiceIva(
  articolo: VariantSummary,
  famiglia: FamigliaIva,
  contesto: ContestoRichiamoArticolo,
): { readonly vatCodeId: string | null; readonly segnalazioni: readonly SegnalazioneRichiamo[] } {
  if (famiglia === 'nessuna') {
    return { vatCodeId: null, segnalazioni: [] };
  }
  const segnalazioni: SegnalazioneRichiamo[] = [];
  const dellaFamiglia = (vatCode: VatCode): boolean =>
    vatCode.isActive &&
    (famiglia === 'vendita' ? isSalesVatCode(vatCode) : isPurchaseVatCode(vatCode));

  const candidato = (id: string | null | undefined): string | null => {
    if (!id) {
      return null;
    }
    const vatCode = contesto.codiciIvaPerId.get(id);
    return vatCode && dellaFamiglia(vatCode) ? vatCode.id : null;
  };

  // 1. L'articolo. Se ne porta uno dell'altra famiglia, si dice.
  const daArticolo = candidato(articolo.defaultVatCodeId);
  if (daArticolo) {
    return { vatCodeId: daArticolo, segnalazioni };
  }
  if (articolo.defaultVatCodeId) {
    segnalazioni.push({
      tipo: 'codice-iva-articolo-di-altra-famiglia',
      vatCodeId: articolo.defaultVatCodeId,
    });
  }

  // 2. La controparte. Solo in acquisto: in vendita `codiceIvaControparte` è
  //    sempre `null`, e la catena salta l'anello senza doverlo sapere.
  const daControparte = candidato(contesto.codiceIvaControparte);
  if (daControparte) {
    return { vatCodeId: daControparte, segnalazioni };
  }

  // 3. Il predefinito aziendale, che il chiamante ha già filtrato sulla famiglia.
  const daPredefinito = candidato(contesto.codiceIvaPredefinito);
  if (daPredefinito) {
    return { vatCodeId: daPredefinito, segnalazioni };
  }

  // ⛔ Nessun anello risolve: una riga senza IVA calcola imposta zero, e non
  // deve farlo di nascosto.
  segnalazioni.push({ tipo: 'codice-iva-non-risolto' });
  return { vatCodeId: null, segnalazioni };
}
