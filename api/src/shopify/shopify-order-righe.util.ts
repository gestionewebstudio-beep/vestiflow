/**
 * ⭐ **Quanto di ogni riga d'ordine è ANCORA da spedire, e quanto è USCITO, da dove.**
 *
 * Due letture del payload ordine Shopify, pure e senza database, che il
 * connettore traduce negli eventi canonici (`shopify-sync.service`):
 *
 * - **quantità corrente** (`quantitaCorrentePerRiga`): dopo un annullamento
 *   parziale (`refund_line_items[].restock_type = 'cancel'`, merce mai partita)
 *   `line_items[].quantity` resta quella ORDINATA e `current_quantity` scende.
 *   L'impegno deve seguire la seconda: è ciò che resta da spedire. Dove il
 *   payload non porta `current_quantity` (payload vecchi, simulatore) la si
 *   ricava sottraendo i `cancel`: stessa definizione, una fonte in meno.
 *
 * - **spedizioni** (`spedizioniDelPayload`): `fulfillments[]` dice per ogni
 *   evasione riuscita quale sede (`location_id`), quando, e quali righe con
 *   quale quantità. È la fonte dello scarico fisico, UNA spedizione alla volta:
 *   la stessa riga può uscire in più spedizioni e da più sedi, e ognuna è un
 *   effetto a sé (deciso dal proprietario il 12/09/2026).
 *
 * ⛔ **Il valore economico NON cambia qui**: la riga d'ordine e la Vendita
 *    online restano come ORDINATE; l'annullamento parziale è già una rettifica
 *    in `sales_order_refunds`, che il registro sottrae alla sua data. Cambiano
 *    l'impegno (quanto resta da spedire) e lo scarico (quanto è uscito).
 */

export interface SpedizioneRemota {
  /** L'id dell'evasione sul canale, come stringa (gid se c'è, altrimenti numerico). */
  readonly externalFulfillmentId: string;
  /** La `location_id` remota da cui è uscita la merce, o `null`. */
  readonly shopifyLocationId: string | null;
  readonly createdAt: Date | null;
  /** Le righe uscite: `line_items[].id` dell'ordine e quantità di QUESTA evasione. */
  readonly righe: readonly { readonly externalLineId: string; readonly quantity: number }[];
}

const STATI_EVASIONE_RIUSCITA = new Set(['success']);

/** Numero finito e non negativo, altrimenti `null`. */
function numeroOrNull(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Per ogni `line_items[].id`: la quantità ancora valida della riga.
 * `current_quantity` se il payload la porta; altrimenti `quantity` meno i
 * `refund_line_items` con `restock_type = 'cancel'` di quella riga.
 */
export function quantitaCorrentePerRiga(
  order: Record<string, unknown>,
): ReadonlyMap<string, number> {
  const righe = (order.line_items as Record<string, unknown>[] | undefined) ?? [];
  const annullatePerRiga = new Map<string, number>();
  for (const refund of (order.refunds as Record<string, unknown>[] | undefined) ?? []) {
    for (const item of (refund.refund_line_items as Record<string, unknown>[] | undefined) ?? []) {
      if (item.restock_type !== 'cancel' || item.line_item_id == null) {
        continue;
      }
      const chiave = String(item.line_item_id);
      const q = numeroOrNull(item.quantity) ?? 0;
      annullatePerRiga.set(chiave, (annullatePerRiga.get(chiave) ?? 0) + q);
    }
  }
  const esito = new Map<string, number>();
  righe.forEach((riga, indice) => {
    const chiave = riga.id != null ? String(riga.id) : `pos-${indice}`;
    const ordinata = numeroOrNull(riga.quantity) ?? 0;
    const corrente = numeroOrNull(riga.current_quantity);
    const annullate = annullatePerRiga.get(chiave) ?? 0;
    esito.set(chiave, corrente ?? Math.max(0, ordinata - annullate));
  });
  return esito;
}

/**
 * Le evasioni RIUSCITE del payload, nell'ordine in cui il canale le elenca.
 * Un'evasione senza righe con quantità non compare.
 */
export function spedizioniDelPayload(order: Record<string, unknown>): readonly SpedizioneRemota[] {
  const esito: SpedizioneRemota[] = [];
  for (const evasione of (order.fulfillments as Record<string, unknown>[] | undefined) ?? []) {
    const stato = typeof evasione.status === 'string' ? evasione.status : 'success';
    if (!STATI_EVASIONE_RIUSCITA.has(stato)) {
      continue;
    }
    const id =
      typeof evasione.admin_graphql_api_id === 'string'
        ? evasione.admin_graphql_api_id
        : evasione.id != null
          ? String(evasione.id)
          : null;
    if (!id) {
      continue;
    }
    const righe: { externalLineId: string; quantity: number }[] = [];
    for (const item of (evasione.line_items as Record<string, unknown>[] | undefined) ?? []) {
      const q = numeroOrNull(item.quantity) ?? 0;
      if (item.id == null || q <= 0) {
        continue;
      }
      righe.push({ externalLineId: String(item.id), quantity: q });
    }
    if (righe.length === 0) {
      continue;
    }
    esito.push({
      externalFulfillmentId: id,
      shopifyLocationId:
        evasione.location_id != null && String(evasione.location_id).trim() !== ''
          ? String(evasione.location_id)
          : null,
      createdAt: typeof evasione.created_at === 'string' ? new Date(evasione.created_at) : null,
      righe,
    });
  }
  return esito;
}
