import { Injectable, InternalServerErrorException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';

import { SupabaseService } from '../auth/supabase.service';
import {
  destinazioneRisoltaPubblica,
  isUrlScaricabile,
} from '../common/rete/indirizzo-remoto.util';
import {
  assertUploadImageMimeAndMagicBytes,
  optimizeUploadedImageToWebp,
  PRODUCT_IMAGE_MAX_EDGE_PX,
  PRODUCT_IMAGE_WEBP_QUALITY,
} from '../common/upload/image-optimize.util';
import { PrismaService } from '../prisma/prisma.service';

import type { ProductImage } from '@prisma/client';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
/** Un link che non risponde non deve tenere fermo un import di catalogo. */
const SCARICAMENTO_TIMEOUT_MS = 20_000;
/** Oltre questi salti la catena non si segue: non è una risorsa, è un giro. */
const MAX_REINDIRIZZAMENTI = 3;

/**
 * Il download di un'immagine remota non è riuscito.
 *
 * ⛔ **Esiste per non confondersi con un errore di salvataggio.** Chi importa
 *    deve poter dire «questa immagine non è arrivata» senza che il prodotto
 *    fallisca e senza che si tocchi quello che c'è già.
 */
export class ImmagineNonScaricata extends Error {
  constructor(
    readonly indirizzo: string,
    readonly motivo: string,
  ) {
    super(`${indirizzo}: ${motivo}`);
    this.name = 'ImmagineNonScaricata';
  }
}

/**
 * L'ARCHIVIO delle immagini di prodotto: scarica, valida, ottimizza, conserva.
 *
 * ⭐ **Sta in un modulo suo, e non è pignoleria di struttura.** Lo usano sia il
 *    catalogo (caricamento manuale, import da file) sia la sincronizzazione
 *    Shopify. Lasciandolo in `ProductsModule` i due moduli si sarebbero
 *    importati a vicenda — `ProductsModule → ShopifyModule` esiste già — e
 *    questo progetto non usa `forwardRef` in nessun punto: introdurlo qui
 *    sarebbe stato un pattern nuovo per un problema che si risolve spostando
 *    una classe.
 *
 * ⛔ **Non conosce i canali.** Chi archivia non decide se rimandare qualcosa a
 *    Shopify: quella è una scelta di chi chiama, ed è ciò che impedisce l'eco
 *    quando l'immagine ARRIVA dal canale.
 */
@Injectable()
export class ImageArchiveService {
  private readonly bucket: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
  ) {
    this.bucket = this.config.get<string>('SUPABASE_PRODUCT_MEDIA_BUCKET') ?? 'product-media';
  }

  /**
   * Porta nell'archivio VestiFlow un'immagine che oggi vive solo come link.
   *
   * ⭐ **Il link serve a scaricarla, non a rappresentarla**: da qui in poi
   *    l'articolo usa la copia, e non dipende più dal fatto che quel file resti
   *    dov'era. Prima di oggi un catalogo importato aveva le immagini sul CDN di
   *    Shopify — e non finivano nemmeno nel backup, che copia il bucket.
   *
   * ⛔ **Fallire NON significa cancellare.** Solleva `ImmagineNonScaricata` e non
   *    tocca nessuna riga: chi chiama registra l'anomalia e prosegue. Un link
   *    irraggiungibile non è una rimozione.
   */
  async importaImmagineDaUrl(
    tenantId: string,
    productId: string,
    origine: {
      readonly url: string;
      readonly altText?: string | null;
      readonly sortOrder?: number;
      /** Il media Shopify da cui arriva: è il legame che rende idempotente il giro. */
      readonly shopifyImageId?: string | null;
    },
  ): Promise<ProductImage> {
    if (!this.supabase.getStorageClient()) {
      throw new ImmagineNonScaricata(origine.url, 'storage immagini non configurato');
    }

    const scaricata = await this.scarica(origine.url);

    // Stessa validazione del caricamento manuale: il tipo dichiarato non basta,
    // contano i byte. Un file che si spaccia per immagine si ferma qui.
    try {
      assertUploadImageMimeAndMagicBytes(scaricata.buffer, scaricata.mime, ALLOWED_MIME);
    } catch {
      throw new ImmagineNonScaricata(origine.url, "il contenuto non è un'immagine valida");
    }

    try {
      return await this.archiviaBuffer(tenantId, productId, scaricata.buffer, origine);
    } catch (errore: unknown) {
      const motivo = errore instanceof Error ? errore.message : 'salvataggio fallito';
      throw new ImmagineNonScaricata(origine.url, motivo.slice(0, 200));
    }
  }

  /**
   * Ottimizza, carica nel bucket e registra la riga. È il pezzo comune fra il
   * caricamento manuale e l'archiviazione di un'immagine arrivata da un link.
   */
  async archiviaBuffer(
    tenantId: string,
    productId: string,
    buffer: Buffer,
    origine: {
      readonly altText?: string | null;
      readonly sortOrder?: number;
      readonly shopifyImageId?: string | null;
    } = {},
  ): Promise<ProductImage> {
    const client = this.supabase.getStorageClient();
    if (!client) {
      throw new ServiceUnavailableException(
        'Storage immagini non configurato (Supabase). Crea il bucket product-media nel progetto Supabase.',
      );
    }

    const optimized = await optimizeUploadedImageToWebp(buffer, {
      maxEdgePx: PRODUCT_IMAGE_MAX_EDGE_PX,
      quality: PRODUCT_IMAGE_WEBP_QUALITY,
    });

    const storagePath = `${tenantId}/${productId}/${randomUUID()}.${optimized.extension}`;
    const { error: uploadError } = await client.storage
      .from(this.bucket)
      .upload(storagePath, optimized.buffer, {
        contentType: optimized.contentType,
        upsert: false,
      });
    if (uploadError) {
      throw new InternalServerErrorException(
        `Caricamento immagine non riuscito: ${uploadError.message.slice(0, 200)}`,
      );
    }

    return this.prisma.productImage.create({
      data: {
        tenantId,
        productId,
        // ⭐ L'URL è quello della COPIA. Il link di partenza non si conserva qui:
        //    sarebbe un secondo indirizzo per la stessa immagine, e il giorno in
        //    cui i due divergono nessuno saprebbe quale vale.
        url: this.indirizzoPubblico(storagePath),
        storagePath,
        altText: origine.altText ?? null,
        sortOrder: origine.sortOrder ?? (await this.prossimoOrdine(productId)),
        shopifyImageId: origine.shopifyImageId ?? null,
      },
    });
  }

  // ⛔ **Qui c’era `rimuoviImmagineDaSincronizzazione`, ed è stata TOLTA.**
  //
  //    Serviva a propagare una rimozione ricevuta da Shopify. La regola è
  //    cambiata l’11/09/2026: **cancellare un’immagine da un sistema non
  //    cancella la copia nell’altro**, e si accetta che dopo una
  //    cancellazione le due gallerie possano differire.
  //
  // ⚠️ Non è rimasta «per un eventuale ritorno»: un metodo che cancella
  //    copie durante una sincronizzazione è un’arma carica, e la regola dice
  //    che non si spara. La cancellazione del catalogo resta dov’è —
  //    `ProductMediaService.deleteImage`, che è l’operatore a chiamare.

  /** Toglie dal bucket l'oggetto di un'immagine, se ne ha uno. */
  async rimuoviDalBucket(storagePath: string | null): Promise<void> {
    if (!storagePath) {
      return;
    }
    const client = this.supabase.getStorageClient();
    if (client) {
      await client.storage.from(this.bucket).remove([storagePath]);
    }
  }

  /** L'indirizzo pubblico di un oggetto in archivio. */
  indirizzoPubblico(storagePath: string): string {
    const base = this.config.get<string>('SUPABASE_URL')?.replace(/\/$/, '');
    if (!base) {
      throw new ServiceUnavailableException('SUPABASE_URL non configurato');
    }
    return `${base}/storage/v1/object/public/${this.bucket}/${storagePath}`;
  }

  /** Il prossimo posto libero nell'ordine delle immagini del prodotto. */
  async prossimoOrdine(productId: string): Promise<number> {
    const last = await this.prisma.productImage.findFirst({
      where: { productId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return (last?.sortOrder ?? -1) + 1;
  }

  /**
   * I byte dell'immagine remota, con tutte le condizioni che li rendono sicuri.
   *
   * ⛔ **L'indirizzo si controlla a OGNI SALTO, non solo il primo.** Un link
   *    ammesso che rimanda a `http://169.254.169.254/...` sarebbe una richiesta
   *    interna fatta dal server per conto di chi ha scritto il file: seguire i
   *    reindirizzamenti automaticamente (`redirect: 'follow'`) toglie proprio la
   *    possibilità di guardarli.
   *
   * ⛔ **E il tetto si applica MENTRE si scarica.** Leggere tutto e poi misurare
   *    significa aver già accettato il file: un indirizzo che risponde con un
   *    flusso senza fine riempirebbe la memoria prima del controllo.
   */
  private async scarica(indirizzo: string): Promise<{ buffer: Buffer; mime: string }> {
    // Un solo scadere per l'intera catena, reindirizzamenti compresi: altrimenti
    // ogni salto ricomincerebbe da capo e l'attesa non avrebbe un tetto.
    const scadenza = AbortSignal.timeout(SCARICAMENTO_TIMEOUT_MS);
    let corrente = indirizzo;

    for (let salto = 0; salto <= MAX_REINDIRIZZAMENTI; salto += 1) {
      // ⛔ Il link arriva da un file caricato da chi importa: è un dato di
      //    INGRESSO, e vale per ogni tappa della catena.
      if (!isUrlScaricabile(corrente)) {
        throw new ImmagineNonScaricata(
          indirizzo,
          corrente === indirizzo
            ? 'indirizzo non ammesso (serve https pubblico)'
            : `reindirizzamento verso un indirizzo non ammesso (${corrente.slice(0, 120)})`,
        );
      }

      // ⛔ **E il controllo sul NOME non basta**: un dominio pubblico che risolve
      //    verso la rete interna passerebbe indisturbato. Si risolve PRIMA di
      //    aprire la connessione, a ogni salto, e si rifiuta se anche uno solo
      //    degli indirizzi è interno — chi controlla il DNS può rispondere con
      //    una coppia, e non si sa quale verrebbe scelto.
      const destinazione = await destinazioneRisoltaPubblica(new URL(corrente).hostname);
      if (!destinazione.pubblica) {
        throw new ImmagineNonScaricata(indirizzo, destinazione.motivo);
      }

      let risposta: Response;
      try {
        risposta = await fetch(corrente, { redirect: 'manual', signal: scadenza });
      } catch (errore: unknown) {
        const motivo = errore instanceof Error ? errore.message : 'richiesta fallita';
        throw new ImmagineNonScaricata(indirizzo, motivo.slice(0, 200));
      }

      if (risposta.status >= 300 && risposta.status < 400) {
        const prossima = risposta.headers.get('location');
        if (!prossima) {
          throw new ImmagineNonScaricata(
            indirizzo,
            `risposta ${risposta.status} senza destinazione`,
          );
        }
        try {
          corrente = new URL(prossima, corrente).toString();
        } catch {
          throw new ImmagineNonScaricata(indirizzo, 'destinazione del reindirizzamento non valida');
        }
        continue;
      }

      if (!risposta.ok) {
        throw new ImmagineNonScaricata(indirizzo, `risposta ${risposta.status}`);
      }

      // ⚠️ La lunghezza dichiarata è solo un risparmio: può mancare o mentire, e
      //    quello che conta è il controllo sui byte che arrivano davvero.
      const dichiarata = Number(risposta.headers.get('content-length') ?? NaN);
      if (Number.isFinite(dichiarata) && dichiarata > MAX_IMAGE_BYTES) {
        throw new ImmagineNonScaricata(indirizzo, 'immagine troppo grande (max 5 MB)');
      }

      const buffer = await this.leggiConTetto(risposta, indirizzo);
      const mime = (risposta.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
      return { buffer, mime };
    }

    throw new ImmagineNonScaricata(indirizzo, 'troppi reindirizzamenti');
  }

  /** Legge il corpo a pezzi e si FERMA appena supera il tetto, chiudendo la connessione. */
  private async leggiConTetto(risposta: Response, indirizzo: string): Promise<Buffer> {
    const lettore = risposta.body?.getReader();
    if (!lettore) {
      throw new ImmagineNonScaricata(indirizzo, 'risposta vuota');
    }

    const pezzi: Buffer[] = [];
    let totale = 0;
    for (;;) {
      const { done, value } = await lettore.read();
      if (done) {
        break;
      }
      totale += value.byteLength;
      if (totale > MAX_IMAGE_BYTES) {
        // Annulla la lettura: il resto del flusso non viene nemmeno ricevuto.
        await lettore.cancel();
        throw new ImmagineNonScaricata(indirizzo, 'immagine troppo grande (max 5 MB)');
      }
      pezzi.push(Buffer.from(value));
    }

    if (totale === 0) {
      throw new ImmagineNonScaricata(indirizzo, 'risposta vuota');
    }
    return Buffer.concat(pezzi);
  }
}
