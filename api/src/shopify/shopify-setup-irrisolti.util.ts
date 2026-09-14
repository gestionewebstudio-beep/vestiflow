import type {
  ShopifySetupAnteprimaDto,
  ShopifySetupEsitoDto,
  ShopifySetupIrrisoltoDto,
} from './shopify-setup.model';

/**
 * ⭐ **I casi che l'attivazione NON risolve, nominati uno per uno** (`docs/27`
 *    §0 e §4; mandato del 12/09/2026: «nessun caso irrisolto va dichiarato
 *    pronto per l'attivazione»). Si attivano solo le parti preparate; queste
 *    restano fuori, e chi attiva le legge PRIMA di premere — non dentro un
 *    dettaglio chiuso, non dopo.
 *
 * Le fonti sono due, e non si inventa una terza:
 * - gli **esclusi del trasferimento e dell'attivazione** (`esito.esclusi`):
 *   articoli non importati/pubblicati, coppie senza base;
 * - gli **ordini aperti che non diventano impegni** (`anteprima.ordini`): senza
 *   sede collegata, o evasi in parte — restano segnalati in Vendite.
 *
 * ⚠️ Una funzione pura: la stessa lettura vale prima dell'attivazione (che cosa
 *    resterà fuori) e dopo (che cosa è rimasto fuori).
 */
export function irrisoltiDelPercorso(
  anteprima: ShopifySetupAnteprimaDto | null,
  esito: ShopifySetupEsitoDto | null,
): readonly ShopifySetupIrrisoltoDto[] {
  const irrisolti: ShopifySetupIrrisoltoDto[] = [];

  for (const escluso of esito?.esclusi ?? []) {
    irrisolti.push({
      tipo: escluso.tipo,
      riferimento: escluso.riferimento,
      nome: escluso.nome,
      motivo: escluso.dettaglio ? `${escluso.motivo} — ${escluso.dettaglio}` : escluso.motivo,
    });
  }

  for (const ordine of anteprima?.ordini.elenco ?? []) {
    if (!ordine.sedeDeterminabile) {
      irrisolti.push({
        tipo: 'ordine',
        riferimento: ordine.shopifyOrderId,
        nome: ordine.nome,
        motivo: 'sede non collegata: nessun impegno, resta «Da verificare» in Vendite',
      });
    } else if (ordine.stato === 'parziale') {
      irrisolti.push({
        tipo: 'ordine',
        riferimento: ordine.shopifyOrderId,
        nome: ordine.nome,
        motivo: 'evaso in parte prima della partenza: nessun impegno, da verificare a mano',
      });
    }
  }

  // Gli ordini oltre le prime righe dell'elenco non hanno un nome qui: il
  // conteggio li dichiara lo stesso, senza fingere che siano zero.
  const nominati = irrisolti.filter((i) => i.tipo === 'ordine').length;
  const contati = (anteprima?.ordini.senzaSede ?? 0) + (anteprima?.ordini.parziali ?? 0);
  if (contati > nominati) {
    irrisolti.push({
      tipo: 'ordine',
      riferimento: 'altri',
      nome: `altri ${contati - nominati} ordini`,
      motivo: 'senza sede collegata o evasi in parte, oltre le prime righe dell’anteprima',
    });
  }

  const falliti = esito?.attivazione?.ordini.falliti ?? 0;
  if (falliti > 0) {
    irrisolti.push({
      tipo: 'ordine',
      riferimento: 'falliti',
      nome: `${falliti} ordini`,
      motivo: 'acquisizione fallita all’attivazione: ripetere «Importa ordini»',
    });
  }

  return irrisolti;
}
