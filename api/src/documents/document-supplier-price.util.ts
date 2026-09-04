import type { DocumentLine, Prisma } from '@prisma/client';

import { sameUnitAmountAtContract, toStorableMinor } from '../common/money.util';

type ReceiptLine = Pick<DocumentLine, 'variantId' | 'unitPriceMinor' | 'loadsStock' | 'quantity'>;

/** Riga che incide sui costi: carica stock, ha quantità, variante e prezzo. */
type CostBearingLine = ReceiptLine & { variantId: string; unitPriceMinor: number };

function isCostBearing(line: ReceiptLine): line is CostBearingLine {
  return (
    line.loadsStock && line.quantity > 0 && line.variantId != null && line.unitPriceMinor != null
  );
}

const uniqueVariantIds = (lines: readonly CostBearingLine[]): string[] => [
  ...new Set(lines.map((line) => line.variantId)),
];

export interface SupplierPriceDiff {
  readonly variantId: string;
  readonly previousMinor: number | null;
  readonly nextMinor: number;
}

/** Righe con costo diverso dall'ultimo prezzo fornitore collegato. */
export async function findSupplierPriceDiffs(
  tx: Prisma.TransactionClient,
  tenantId: string,
  supplierId: string | null,
  lines: readonly ReceiptLine[],
): Promise<readonly SupplierPriceDiff[]> {
  if (!supplierId) {
    return [];
  }
  const eligible = lines.filter(isCostBearing);
  if (eligible.length === 0) {
    return [];
  }

  // Un'unica lettura per tutte le righe: in ciclo era un round-trip per riga.
  const links = await tx.supplierVariantLink.findMany({
    where: {
      tenantId,
      supplierId,
      variantId: { in: uniqueVariantIds(eligible) },
    },
    select: { variantId: true, lastPurchasePriceMinor: true },
  });
  // Il costo precedente serve al confronto e alla risposta: entrambi lavorano
  // su `number`. `Number(...)` è il confine col tipo Prisma, non un
  // arrotondamento — la coda sopravvive.
  const lastPriceByVariant = new Map<string, number | null>(
    links.map((link) => [link.variantId, Number(link.lastPurchasePriceMinor)]),
  );

  const diffs: SupplierPriceDiff[] = [];
  for (const line of eligible) {
    const previous = lastPriceByVariant.get(line.variantId) ?? null;
    // ⭐ «Il costo è cambiato?» si chiede alla precisione del CONTRATTO, non al
    // centesimo: questo è un costo unitario canonico, e la coda ne fa parte.
    //
    // ⛔ Fino al 22/08/2026 il confronto era `sameAmountAtCent`, e con quello
    // 84,0000 e 84,4262 risultavano «uguali»: un Arrivo merce a 1,03 € ivati al
    // 22% lasciava in anagrafica il vecchio costo intero invece di scrivere
    // quello preciso — vanificando la migration che serviva a conservarlo.
    if (
      previous !== null &&
      sameUnitAmountAtContract(previous, toStorableMinor(Number(line.unitPriceMinor)))
    ) {
      continue;
    }
    diffs.push({
      variantId: line.variantId,
      previousMinor: previous,
      nextMinor: Number(line.unitPriceMinor),
    });
  }
  return diffs;
}

/**
 * Aggiornamento costi dal carico — **riscritto il 19/08/2026** (`03b`).
 *
 * ```text
 * ProductVariant.purchasePriceMinor   solo con la spunta, riga per riga
 * SupplierVariantLink                 sempre, se c'è un fornitore collegato
 * Product.purchasePriceMinor          ⛔ MAI
 * ```
 *
 * ⛔ **La spunta comandava la cosa sbagliata.** Prima il costo della variante si
 * scriveva **sempre** e la spunta governava il costo dell'articolo. L'etichetta
 * dice «Aggiorna **anche** il costo di riferimento in anagrafica», e
 * quell'«anche» dichiarava che qualcos'altro in anagrafica ci andava comunque:
 * **chi la toglieva credeva di registrare un costo solo documentale, e stava
 * riscrivendo il costo effettivo di ogni variante caricata** — quello che
 * alimenta valorizzazione e margini.
 *
 * > **Spuntata**: il costo della riga diventa il costo di quella variante.
 * > **Non spuntata**: resta un costo del DOCUMENTO, per report e contabilità.
 *
 * ⛔ **Riga per riga, e singolarmente.** Richiamando un articolo con tre varianti
 * si richiamano TRE righe, e ognuna governa la propria variante: la spunta non è
 * una propagazione «all'articolo».
 *
 * ⛔ **`Product.purchasePriceMinor` non si scrive più.** È il seed di NASCITA di
 * una variante — lo dice lo schema — non un costo aggiornabile. Derivarlo
 * dall'ultima riga di un carico è arbitrario: con dodici taglie a 18,00 e una a
 * 22,00 la tredicesima nascerebbe a 22,00, e nessuno saprebbe perché. `02` §4.5
 * lo vietava già per la sincronizzazione, e l'ultima riga è più arbitraria di
 * una media.
 *
 * ⚠️ **L'articolo NUOVO è un'altra cosa**: nasce con i dati che si stanno
 * inserendo, spunta o no, perché alla nascita non c'è niente da sovrascrivere.
 * Quel percorso vive in `goods-receipt-workflow` ed è gated dal solo permesso di
 * vedere i costi.
 */
export async function applySupplierPriceUpdates(
  tx: Prisma.TransactionClient,
  tenantId: string,
  supplierId: string | null,
  lines: readonly ReceiptLine[],
  updateArticleCost: boolean,
): Promise<void> {
  const eligible = lines.filter(isCostBearing);
  if (eligible.length === 0) {
    return;
  }

  // ⭐ **Il costo canonico, con la sua coda.** Qui c'era `Math.round(...)`, e
  // c'era per una ragione sola: `ProductVariant.purchasePriceMinor` e
  // `SupplierVariantLink.lastPurchasePriceMinor` erano `Int`. Dal 22/08/2026
  // sono `NUMERIC(16,6)`, quindi l'arrotondamento non protegge più niente e
  // butterebbe via proprio il valore che la migration serviva a conservare:
  // 1,03 € ivati al 22% valgono 84,4262 centesimi netti, non 84.
  //
  // `toStorableMinor` riduce alle 4 cifre di centesimo del contratto — 6
  // decimali di euro — che è quanto la colonna e i DTO accettano.
  const costoDi = (line: ReceiptLine): number => toStorableMinor(Number(line.unitPriceMinor));

  // ⭐ **Con più righe dello stesso articolo, vince l'ULTIMA** (deciso dal
  // proprietario il 22/08/2026).
  //
  // ⛔ Qui c'era scritto «ogni variante compare una volta sola, quindi non
  // esiste un "chi vince"». **L'assunzione era falsa**, e un test reale l'ha
  // smentita: un Arrivo merce può avere due righe dello stesso articolo a costi
  // diversi — 0,84 e 0,94 — e in anagrafica ne finiva uno dei due a seconda
  // dell'ordine con cui la mappa veniva percorsa. Non una regola: un caso.
  //
  // Deduplicare tenendo l'ultima occorrenza rende la scelta dichiarata, e
  // riduce anche le scritture: una per variante, non una per riga.
  const ultimaRigaPerVariante = new Map<string, CostBearingLine>();
  for (const line of eligible) {
    ultimaRigaPerVariante.set(line.variantId, line);
  }

  // ── Costo della variante: SOLO con la spunta ────────────────────────────
  //
  // ⛔ Prima si scriveva sempre, e la spunta governava il costo dell'articolo:
  // chi la toglieva credeva di registrare un costo solo documentale e stava
  // riscrivendo il costo effettivo di ogni variante caricata.
  if (updateArticleCost) {
    // Le varianti si accorpano per COSTO: una `updateMany` per valore invece
    // di una per variante. Ora che ogni variante compare una volta sola,
    // l'accorpamento è solo un risparmio di query.
    const perCosto = new Map<number, string[]>();
    for (const line of ultimaRigaPerVariante.values()) {
      const costo = costoDi(line);
      const gruppo = perCosto.get(costo);
      if (gruppo) {
        gruppo.push(line.variantId);
      } else {
        perCosto.set(costo, [line.variantId]);
      }
    }
    for (const [costo, variantIds] of perCosto) {
      await tx.productVariant.updateMany({
        where: { id: { in: variantIds }, tenantId },
        data: { purchasePriceMinor: costo },
      });
    }
  }

  // ── Ultimo prezzo pagato a quel fornitore: sempre, se c'è ───────────────
  //
  // ⚠️ NON governato dalla spunta: è un fatto del rapporto col fornitore, non
  // un costo dell'anagrafica. «Quanto l'ho pagato l'ultima volta» resta vero
  // anche scegliendo di non aggiornare il costo dell'articolo.
  if (supplierId) {
    // Stessa regola dell'anagrafica: con più righe dello stesso articolo,
    // «quanto l'ho pagato l'ultima volta» è il costo dell'ultima riga.
    for (const line of ultimaRigaPerVariante.values()) {
      await tx.supplierVariantLink.upsert({
        where: {
          tenantId_supplierId_variantId: { tenantId, supplierId, variantId: line.variantId },
        },
        create: {
          tenantId,
          supplierId,
          variantId: line.variantId,
          lastPurchasePriceMinor: costoDi(line),
        },
        update: { lastPurchasePriceMinor: costoDi(line) },
      });
    }
  }

  // ⛔ Nessuna scrittura su `Product.purchasePriceMinor`: è il seed di NASCITA
  // di una variante, non un costo aggiornabile dai carichi. Vedi il docblock.
}
