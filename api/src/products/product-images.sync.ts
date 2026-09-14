import type { ProductImage } from '@prisma/client';

export type ShopifyImageRow = {
  readonly id: number;
  readonly src: string;
  readonly alt: string | null;
  readonly position: number;
};

/** Ciò che serve alla sincronizzazione per archiviare. */
export interface ArchivioImmagini {
  importaImmagineDaUrl(
    tenantId: string,
    productId: string,
    origine: {
      readonly url: string;
      readonly altText?: string | null;
      readonly sortOrder?: number;
      readonly shopifyImageId?: string | null;
    },
  ): Promise<ProductImage>;
}

/** Le sole letture di immagini che servono qui. */
export interface LettoreImmagini {
  productImage: {
    findMany(args: {
      where: { productId: string; tenantId: string };
      orderBy: { sortOrder: 'asc' };
    }): Promise<readonly ProductImage[]>;
  };
}

export interface EsitoImmagini {
  /** Quante immagini remote sono entrate in archivio adesso. */
  readonly archiviate: number;
  /** Quante c'erano già: ripetere non aggiunge. */
  readonly gia: number;
  /** I motivi dei download non riusciti: anomalie, non cancellazioni. */
  readonly anomalie: readonly string[];
}

/**
 * ⭐ **VestiFlow gestisce TUTTE le immagini** — regola cambiata dal proprietario
 *    l'11/09/2026, e sostituisce quella precedente.
 *
 * ⛔ **Qui c'era «solo la principale»**, con la sostituzione che cancellava la
 *    copia vecchia e la rimozione ricevuta che la propagava. Non vale più:
 *
 * ```text
 * prima                               ora
 * solo la principale                  tutte le immagini
 * sostituzione -> cancella la vecchia  niente cancellazioni automatiche
 * rimossa di la' -> rimossa di qua     le gallerie possono differire
 * ```
 *
 * ⛔ **Cancellare da un sistema NON cancella nell'altro**: è una decisione, e la
 *    conseguenza — gallerie che divergono dopo una cancellazione — è accettata.
 *    Qui dentro non esiste nessuna rimozione, ed è il modo in cui si tiene.
 *
 * ⛔ **Un errore di lettura o download non cancella niente**: finisce fra le
 *    anomalie, le altre immagini proseguono, e quelle già archiviate restano.
 *
 * ⚠️ **RIENTRA ciò che l'operatore ha appena cancellato, e non è un difetto di
 *    questa funzione: è una distinzione che nel modello non esiste.**
 *    `ProductImage.shopifyImageId` è l'unico legame con il media remoto e muore
 *    con la riga; lo storico dei collegamenti copre prodotti, varianti e sedi,
 *    non le immagini. Un'immagine cancellata e una mai vista sono quindi
 *    indistinguibili. Dichiarato in `docs/DA-FARE.md` §31.28 — **nessun
 *    meccanismo inventato qui**.
 */
export async function sincronizzaImmaginiDaShopify(
  lettore: LettoreImmagini,
  archivio: ArchivioImmagini,
  tenantId: string,
  productId: string,
  immaginiRemote: readonly ShopifyImageRow[] | undefined,
): Promise<EsitoImmagini> {
  const fermo: EsitoImmagini = { archiviate: 0, gia: 0, anomalie: [] };

  // ⛔ **Assente non è vuoto.** Un payload che non porta il campo non dice che le
  //    immagini sono state tolte: dice che non lo sappiamo. E non dicendolo, non
  //    si fa niente — che è comunque la risposta giusta, visto che non si
  //    cancella mai.
  if (immaginiRemote === undefined || immaginiRemote.length === 0) {
    return fermo;
  }

  const locali = await lettore.productImage.findMany({
    where: { productId, tenantId },
    orderBy: { sortOrder: 'asc' },
  });
  const collegate = new Set(
    locali.map((immagine) => immagine.shopifyImageId).filter((id): id is string => id != null),
  );

  // ⭐ L'ORDINE si conserva: la posizione Shopify diventa il `sortOrder`, e la
  //    principale è quella che resta davanti. È così che «quale sia la
  //    principale» sopravvive al passaggio, senza un campo in più.
  const ordinate = [...immaginiRemote].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  let archiviate = 0;
  let gia = 0;
  const anomalie: string[] = [];

  for (const remota of ordinate) {
    const gidRemoto = String(remota.id);
    if (collegate.has(gidRemoto)) {
      // Ripetere non aggiunge: è il legame salvato a dirlo, non un confronto di
      // URL — Shopify ri-ospita il file e cambia l'indirizzo a ogni lettura.
      gia += 1;
      continue;
    }

    try {
      await archivio.importaImmagineDaUrl(tenantId, productId, {
        url: remota.src,
        altText: remota.alt,
        sortOrder: Math.max(0, (remota.position ?? 1) - 1),
        shopifyImageId: gidRemoto,
      });
      collegate.add(gidRemoto);
      archiviate += 1;
    } catch (errore: unknown) {
      // ⛔ Si prosegue: una caduta non ferma il giro e non tocca le altre.
      const motivo = errore instanceof Error ? errore.message : 'scaricamento fallito';
      anomalie.push(motivo);
    }
  }

  return { archiviate, gia, anomalie };
}
