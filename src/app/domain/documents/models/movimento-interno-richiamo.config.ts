import { campiEffettivi, PROFILI_RIGA_DOCUMENTO } from './document-line-article.model';
import type {
  ContestoRichiamoArticolo,
  PolicyRichiamoArticolo,
} from './document-line-article.model';

/**
 * Policy e contesto del **richiamo articolo su un movimento interno**:
 * Trasferimento e Rettifica di magazzino.
 *
 * ⭐ Stanno qui, e non dentro una delle due maschere, perché le due righe sono
 * la stessa riga campo per campo — lo dice già `stock-movement-line-columns`,
 * che condividono. Due copie di queste costanti divergerebbero al primo che ne
 * tocca una, e nessun test lo mostrerebbe: divergerebbero **in silenzio**.
 *
 * ── Perché sono COSTANTI ──────────────────────────────────────────────────
 *
 * Dicono cosa un movimento interno è: la merce cambia scaffale, non
 * proprietario. Non c'è una controparte da cui ereditare IVA o sconto, non c'è
 * un listino da scegliere, non c'è un codice fornitore con cui agganciare. Il
 * profilo `movimento-interno` non ha nemmeno le capacità che userebbero quei
 * valori — stanno nel contesto perché il contratto è **UNO** per tutte le
 * maschere, non perché servano qui.
 *
 * ⚠️ `shopifyAttivo` e `costiVisibili` sono `false` senza guardare il tenant:
 * il profilo non porta né il prezzo Shopify né il costo, quindi non c'è niente
 * da togliere. Il giorno in cui il profilo li portasse, questa riga andrebbe
 * letta dal feature gate e dai permessi — e sarebbe una **decisione**, non un
 * adeguamento.
 */
export const POLICY_MOVIMENTO_INTERNO: PolicyRichiamoArticolo = {
  famigliaIva: PROFILI_RIGA_DOCUMENTO['movimento-interno'].famigliaIva,
  campi: campiEffettivi('movimento-interno', { shopifyAttivo: false, costiVisibili: false }),
};

export const CONTESTO_MOVIMENTO_INTERNO: ContestoRichiamoArticolo = {
  listino: 'article',
  codiciIvaPerId: new Map(),
  codiceIvaControparte: null,
  codiceIvaPredefinito: null,
  scontoControparte: null,
  codiceFornitoreDigitato: null,
  codiceFornitoreDiTestata: null,
};
