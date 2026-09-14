import { describe, expect, it, vi } from 'vitest';

import { sincronizzaImmaginiDaShopify } from './product-images.sync';

import type { ArchivioImmagini, LettoreImmagini, ShopifyImageRow } from './product-images.sync';
import type { ProductImage } from '@prisma/client';

/**
 * ⭐ **VestiFlow gestisce TUTTE le immagini** — regola cambiata dal proprietario
 *    l'11/09/2026, e sostituisce quella precedente.
 *
 * ⛔ **Qui si provava «solo la principale»**, con la sostituzione che cancellava
 *    la copia vecchia e la rimozione ricevuta che si propagava. Quelle prove non
 *    descrivono più la regola, e sono state riscritte — non tolte: le stesse
 *    domande hanno risposte diverse, ed è quello che va tenuto fermo.
 *
 * ```text
 * prima                                ora
 * solo la principale                   tutte le immagini
 * sostituzione -> cancella la vecchia  nessuna cancellazione automatica
 * rimossa di la' -> rimossa di qua     le gallerie possono differire
 * ```
 */
function immagineLocale(parziale: Partial<ProductImage>): ProductImage {
  return {
    id: 'img-locale',
    tenantId: 'tenant-1',
    productId: 'prod-1',
    url: 'https://esempio.supabase.co/storage/v1/object/public/product-media/a.webp',
    storagePath: 'tenant-1/prod-1/a.webp',
    altText: null,
    sortOrder: 0,
    shopifyImageId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...parziale,
  } as ProductImage;
}

function creaContesto(locali: readonly ProductImage[]) {
  const lettore: LettoreImmagini = {
    productImage: { findMany: vi.fn(async () => locali) },
  };
  const archivio = {
    importaImmagineDaUrl: vi.fn(
      async (_tenantId: string, _productId: string, _origine: { url: string }) =>
        immagineLocale({ id: 'img-nuova' }),
    ),
  };
  return { lettore, archivio: archivio as unknown as ArchivioImmagini, spie: archivio };
}

/** Deliberatamente FUORI ordine: la posizione comanda, non l'ordine dell'elenco. */
const REMOTE: readonly ShopifyImageRow[] = [
  { id: 903, src: 'https://cdn.shopify.com/c.png', alt: 'C', position: 3 },
  { id: 901, src: 'https://cdn.shopify.com/a.png', alt: 'A', position: 1 },
  { id: 902, src: 'https://cdn.shopify.com/b.png', alt: 'B', position: 2 },
];

describe('sincronizzaImmaginiDaShopify — tutte, in archivio, senza cancellare', () => {
  it('⭐ archivia TUTTE le immagini, non la sola principale', async () => {
    const { lettore, archivio, spie } = creaContesto([]);

    const esito = await sincronizzaImmaginiDaShopify(lettore, archivio, 'tenant-1', 'prod-1', REMOTE);

    expect(esito).toEqual({ archiviate: 3, gia: 0, anomalie: [] });
    expect(spie.importaImmagineDaUrl).toHaveBeenCalledTimes(3);
  });

  it('⭐ conserva l’ORDINE, e con lui l’identificazione della principale', async () => {
    const { lettore, archivio, spie } = creaContesto([]);

    await sincronizzaImmaginiDaShopify(lettore, archivio, 'tenant-1', 'prod-1', REMOTE);

    const origini = spie.importaImmagineDaUrl.mock.calls.map(
      (chiamata: unknown[]) => chiamata[2] as { url: string; sortOrder: number },
    );
    // ⛔ La 903 è la PRIMA dell'elenco e l'ULTIMA per posizione: archiviarle
    //    nell'ordine in cui arrivano metterebbe davanti l'immagine sbagliata, e
    //    «la principale» è proprio quella che sta davanti.
    expect(origini.map((o) => o.url)).toEqual([
      'https://cdn.shopify.com/a.png',
      'https://cdn.shopify.com/b.png',
      'https://cdn.shopify.com/c.png',
    ]);
    expect(origini.map((o) => o.sortOrder)).toEqual([0, 1, 2]);
  });

  it('⛔ ripetere NON duplica: il legame salvato è quello che lo dice', async () => {
    // ⚠️ A tenerle uniche è `shopifyImageId`, non un confronto di URL: Shopify
    //    ri-ospita il file e restituisce un indirizzo che cambia a ogni lettura.
    const { lettore, archivio, spie } = creaContesto([
      immagineLocale({ id: 'a', shopifyImageId: '901' }),
      immagineLocale({ id: 'b', shopifyImageId: '902' }),
      immagineLocale({ id: 'c', shopifyImageId: '903' }),
    ]);

    const esito = await sincronizzaImmaginiDaShopify(lettore, archivio, 'tenant-1', 'prod-1', REMOTE);

    expect(esito).toEqual({ archiviate: 0, gia: 3, anomalie: [] });
    expect(spie.importaImmagineDaUrl).not.toHaveBeenCalled();
  });

  it('⭐ e una immagine NUOVA entra da sola, senza toccare le altre', async () => {
    const { lettore, archivio, spie } = creaContesto([
      immagineLocale({ id: 'a', shopifyImageId: '901' }),
      immagineLocale({ id: 'b', shopifyImageId: '902' }),
    ]);

    const esito = await sincronizzaImmaginiDaShopify(lettore, archivio, 'tenant-1', 'prod-1', REMOTE);

    expect(esito).toEqual({ archiviate: 1, gia: 2, anomalie: [] });
    const [[, , origine]] = spie.importaImmagineDaUrl.mock.calls as unknown as [
      [string, string, { shopifyImageId: string }],
    ];
    expect(origine.shopifyImageId).toBe('903');
  });
});

describe('⛔ cancellare da un sistema NON cancella nell’altro', () => {
  it('⛔ un’immagine sparita dalla galleria remota resta in VestiFlow', async () => {
    // ⭐ È la regola nuova, e la conseguenza è accettata: dopo una cancellazione
    //    le due gallerie possono differire. Prima questa rimozione si propagava.
    const { lettore, archivio } = creaContesto([
      immagineLocale({ id: 'a', shopifyImageId: '901' }),
      immagineLocale({ id: 'sparita', shopifyImageId: '999' }),
    ]);

    const esito = await sincronizzaImmaginiDaShopify(lettore, archivio, 'tenant-1', 'prod-1', [
      REMOTE[1]!,
    ]);

    expect(esito).toEqual({ archiviate: 0, gia: 1, anomalie: [] });
    // ⛔ La prova sta in ciò che l'archivio NON sa fare: non esiste nessuna
    //    rimozione da chiamare, e questo è il modo in cui la regola si tiene.
    expect(Object.keys(archivio)).toEqual(['importaImmagineDaUrl']);
  });

  it('⛔ una galleria remota VUOTA non svuota l’articolo', async () => {
    const { lettore, archivio, spie } = creaContesto([
      immagineLocale({ id: 'a', shopifyImageId: '901' }),
    ]);

    const esito = await sincronizzaImmaginiDaShopify(lettore, archivio, 'tenant-1', 'prod-1', []);

    expect(esito).toEqual({ archiviate: 0, gia: 0, anomalie: [] });
    expect(spie.importaImmagineDaUrl).not.toHaveBeenCalled();
  });

  it('⛔ e un payload SENZA il campo immagini non legge nemmeno', async () => {
    const { lettore, archivio } = creaContesto([immagineLocale({ shopifyImageId: '901' })]);

    const esito = await sincronizzaImmaginiDaShopify(
      lettore,
      archivio,
      'tenant-1',
      'prod-1',
      undefined,
    );

    expect(esito).toEqual({ archiviate: 0, gia: 0, anomalie: [] });
    expect(lettore.productImage.findMany).not.toHaveBeenCalled();
  });
});

describe('⛔ un errore di download non cancella e non ferma', () => {
  it('⭐ le altre proseguono, e l’anomalia si dichiara', async () => {
    const { lettore, archivio, spie } = creaContesto([]);
    spie.importaImmagineDaUrl.mockImplementation(
      async (_t: string, _p: string, origine: { url: string }) => {
        if (origine.url.endsWith('b.png')) {
          throw new Error('risposta 404');
        }
        return immagineLocale({ id: 'img-nuova' });
      },
    );

    const esito = await sincronizzaImmaginiDaShopify(lettore, archivio, 'tenant-1', 'prod-1', REMOTE);

    expect(esito.archiviate).toBe(2);
    expect(esito.anomalie).toEqual(['risposta 404']);
    // ⭐ Tre tentativi: la caduta non ha interrotto il giro.
    expect(spie.importaImmagineDaUrl).toHaveBeenCalledTimes(3);
  });

  it('⛔ e quelle già archiviate restano dove sono', async () => {
    const { lettore, archivio, spie } = creaContesto([
      immagineLocale({ id: 'a', shopifyImageId: '901' }),
    ]);
    spie.importaImmagineDaUrl.mockRejectedValue(new Error('rete assente'));

    const esito = await sincronizzaImmaginiDaShopify(lettore, archivio, 'tenant-1', 'prod-1', REMOTE);

    expect(esito.gia).toBe(1);
    expect(esito.anomalie).toHaveLength(2);
    // Nessuna rimozione è possibile: l'archivio qui non ne espone nessuna.
    expect(Object.keys(archivio)).toEqual(['importaImmagineDaUrl']);
  });
});

/**
 * ⚠️ **IL LIMITE DICHIARATO, e messo nero su bianco in una prova.**
 *
 * Un'immagine che l'operatore ha cancellato in VestiFlow RIENTRA alla
 * sincronizzazione successiva. Non è una svista di questa funzione: nel modello
 * non esiste niente che distingua «cancellata» da «mai vista» —
 * `ProductImage.shopifyImageId` è l'unico legame e muore con la riga, lo storico
 * dei collegamenti copre prodotti, varianti e sedi, e il registro non traccia
 * operazioni di immagine.
 *
 * ⛔ **Nessun meccanismo è stato inventato qui**: la prova fotografa il
 *    comportamento di oggi perché il giorno in cui si deciderà come chiuderlo si
 *    veda esattamente che cosa cambia. `docs/DA-FARE.md` §31.28.
 */
describe('⚠️ limite noto: ciò che l’operatore cancella RIENTRA', () => {
  it('⚠️ un’immagine cancellata in VestiFlow viene riarchiviata al giro dopo', async () => {
    // L'operatore ha tolto la 901: in locale non resta niente che la ricordi.
    const { lettore, archivio, spie } = creaContesto([]);

    const esito = await sincronizzaImmaginiDaShopify(lettore, archivio, 'tenant-1', 'prod-1', [
      REMOTE[1]!,
    ]);

    expect(esito.archiviate).toBe(1);
    expect(spie.importaImmagineDaUrl).toHaveBeenCalledOnce();
  });
});
