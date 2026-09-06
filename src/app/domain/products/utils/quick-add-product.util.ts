import type { Observable } from 'rxjs';
import { map, switchMap, take } from 'rxjs';

import type { EntityId } from '@core/models/common.model';
import { ProductStatus } from '@core/models/product.model';
import { parseMoneyInput } from '@core/utils/money.util';
import type { CreateProductDto } from '../models/product.dto';
import type { BarcodeLookupService } from '../services/barcode-lookup.service';
import type { ProductService } from '../services/product.service';

/**
 * L'articolo che l'operatore dichiara al volo davanti a un codice che il
 * catalogo non conosce: nome, prezzo, e il codice appena letto.
 */
export interface QuickAddProductInput {
  readonly name: string;
  readonly priceText: string;
  /** Il codice non risolto: diventa il barcode della variante. */
  readonly ean: string;
  readonly currency: string;
  /** Sede su cui risolvere il codice dopo la creazione. */
  readonly locationId?: string;
}

/**
 * Il payload minimo di un articolo creato al volo.
 *
 * ⛔ **Bozza e NON sincronizzato** con i canali: un articolo dichiarato in fretta
 * davanti a un cliente non è pronto per la vetrina, e pubblicarlo da sé sarebbe
 * una decisione che nessuno ha preso. Chi lo completerà lo troverà in bozza.
 *
 * ⚠️ Prodotto **semplice**: nessuna opzione, una variante sola che specchia il
 * prezzo dell'articolo. Il prezzo non parsabile vale zero — è un articolo da
 * completare, non un salvataggio da rifiutare in mezzo a una vendita.
 */
export function quickAddProductPayload(input: QuickAddProductInput): CreateProductDto {
  const parsed = parseMoneyInput(input.priceText, input.currency);
  const sellingPrice = parsed ?? { amountMinor: 0, currencyCode: input.currency };
  return {
    name: input.name.trim(),
    status: ProductStatus.Draft,
    shopifySyncEnabled: false,
    sellingPrice,
    options: [],
    variants: [
      {
        optionValues: [],
        sellingPrice,
        barcode: input.ean || undefined,
      },
    ],
  };
}

/**
 * Crea l'articolo e restituisce **l'id della variante** appena nata, risolvendola
 * dal codice: è quello che serve alla maschera per aggiungere la riga.
 *
 * ⭐ Sta in `domain/` perché il gesto è lo stesso ovunque si scansioni — Ordine
 * cliente e Vendita al banco lo fanno alla lettera nello stesso modo, e la sola
 * differenza è che cosa diventa la riga dopo. Copiarlo avrebbe messo due
 * definizioni di «articolo creato al volo» a divergere: una che pubblica su
 * Shopify e una no, ed è il tipo di sfumatura che nessuno nota finché un
 * articolo di ripiego non compare in vetrina.
 *
 * `null` = creato ma non ritrovato dal codice (per esempio senza EAN): la
 * maschera non aggiunge righe, e non inventa un id.
 */
export function createQuickAddProduct(
  deps: {
    readonly productService: Pick<ProductService, 'createProduct'>;
    readonly barcodeLookup: Pick<BarcodeLookupService, 'resolveVariantIdByCode'>;
  },
  input: QuickAddProductInput,
): Observable<EntityId | null> {
  return deps.productService.createProduct(quickAddProductPayload(input)).pipe(
    switchMap(() =>
      input.ean
        ? deps.barcodeLookup.resolveVariantIdByCode(input.ean, { locationId: input.locationId })
        : [null],
    ),
    map((variantId) => variantId ?? null),
    take(1),
  );
}
