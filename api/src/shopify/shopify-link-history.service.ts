import { Injectable, Logger } from '@nestjs/common';
import { Prisma, ShopifyLinkStatus } from '@prisma/client';

/**
 * Fase B — la PRIMA SCRITTURA dello storico dei collegamenti Shopify.
 *
 * ⭐ **Un punto solo per tre percorsi**: import (B2, webhook compresi), push
 *    (B3) ed eliminazione (B4). Le tabelle esistono dal 07/09/2026 con i loro
 *    vincoli e trigger, ma **nessun percorso applicativo le scriveva**: erano
 *    note solo a backup e prove. Tre implementazioni parallele della stessa
 *    decisione sarebbero invecchiate ognuna per conto suo.
 *
 * ⛔ **B4 non è separabile da B2 e B3**, e non è una preferenza: la FK
 *    `shopify_variant_identities_variant_id_tenant_id_fkey` è `ON DELETE
 *    RESTRICT`. Dal primo istante in cui si scrive un'identità, eliminare
 *    quella variante **fallisce** se non la si sgancia prima — cioè una
 *    funzione che oggi c'è smetterebbe di funzionare.
 *
 * ⚠️ **Il passaggio è GRADUALE, e qui si vede**: una connessione preesistente
 *    non ancora migrata non ha `shop_id`, e senza negozio non si può scrivere
 *    nessuna identità (`shop_id` è `NOT NULL` con FK). In quel caso questo
 *    servizio **non scrive niente** e l'import prosegue esattamente come prima.
 *    Non è un ripiego: è ciò che consente di non anticipare il backfill.
 */

/** `gid://shopify/Product/123` da un id numerico o da un GID già formato. */
export function gidProdotto(id: string | number): string {
  return gidDa('Product', id);
}

/** `gid://shopify/ProductVariant/123`. */
export function gidVariante(id: string | number): string {
  return gidDa('ProductVariant', id);
}

/** `gid://shopify/InventoryItem/123`. */
export function gidArticoloInventario(id: string | number | null | undefined): string | null {
  return id == null || String(id).trim() === '' ? null : gidDa('InventoryItem', id);
}

/**
 * ⚠️ **Accetta anche un GID già formato**: i due percorsi che chiamano questo
 *    servizio parlano dialetti diversi — REST manda numeri, GraphQL manda GID —
 *    e una conversione che raddoppiasse il prefisso produrrebbe un valore che
 *    il `CHECK … _gid_forma` rifiuta, cioè un import rotto a metà scrittura.
 */
function gidDa(tipo: 'Product' | 'ProductVariant' | 'InventoryItem', id: string | number): string {
  const grezzo = String(id).trim();
  const gia = new RegExp(`^gid://shopify/${tipo}/(\\d+)$`, 'i').exec(grezzo);
  if (gia) {
    return `gid://shopify/${tipo}/${gia[1]}`;
  }
  return `gid://shopify/${tipo}/${grezzo}`;
}

/**
 * Chiude i periodi attivi delle identità indicate, con la data del DATABASE.
 *
 * ⛔ **`new Date()` di Node non va bene, e non è pignoleria: è stato misurato.**
 *    La prima stesura scriveva `closedAt: new Date()` e la prova `3a` è caduta
 *    subito con `23514 … periodo_coerente`:
 *
 * ```text
 *   linked_at  2026-09-08 21:05:41.040   ← CURRENT_TIMESTAMP del server
 *   closed_at  2026-09-08 21:05:41.039   ← new Date() del client, UN MS PRIMA
 * ```
 *
 *    Sono **due orologi diversi**, e su una chiusura immediata lo scarto basta
 *    a produrre un periodo che si chiude prima di aprirsi.
 *
 * ⭐ `GREATEST(now(), linked_at)` chiude la questione per costruzione: la data
 *    la mette la stessa sorgente che l'ha aperta, e non può mai precederla.
 *
 * ⚠️ **SQL grezzo con il nome di tabella interpolato**: le due tabelle sono
 *    costanti letterali di questo file, mai valori che arrivino da fuori.
 */
async function chiudiPeriodi(
  tx: Prisma.TransactionClient,
  tabella: 'shopify_product_links' | 'shopify_variant_links',
  identityIds: readonly string[],
): Promise<void> {
  if (identityIds.length === 0) {
    return;
  }
  await tx.$executeRawUnsafe(
    `UPDATE "${tabella}"
        SET status = 'unlinked',
            close_reason = 'local_delete',
            closed_at = GREATEST(now(), linked_at),
            updated_at = now()
      WHERE identity_id = ANY($1::uuid[])
        AND status = 'active'`,
    identityIds,
  );
}

/** L'esito della registrazione di un prodotto: dice al chiamante cosa è successo. */
export type EsitoStorico =
  /** Identità e periodo in ordine: si può proseguire con le varianti. */
  | { readonly tipo: 'registrato'; readonly identityId: string; readonly linkId: string }
  /**
   * ⛔ L'identità esiste ma è stata ELIMINATA localmente.
   *
   * ⚠️ Qui ci si ferma **e basta**: non si riaggancia e non si apre un periodo,
   *    perché il database lo vieta (trigger `…_immutabile` e FK
   *    `…_identita_viva_fkey`). Il **divieto di ricreazione** — cioè non
   *    importare affatto quel prodotto, registrando lo scarto — è B5-B6 e
   *    **non è implementato qui**: oggi l'import prosegue come ha sempre fatto.
   */
  | { readonly tipo: 'identita_eliminata'; readonly identityId: string }
  /**
   * ⛔ Quel GID appartiene già a un'ALTRA anagrafica locale.
   *
   * ⚠️ Non si riassegna, e non è una scelta di questo servizio: l'unicità
   *    `(shop_id, shopify_product_gid)` la impone il database. Si dichiara e si
   *    lascia decidere al chiamante.
   */
  | { readonly tipo: 'gid_di_un_altro'; readonly identityId: string }
  /**
   * ⛔ L'identità è viva, ma il suo collegamento è stato CHIUSO.
   *
   * ⚠️ Non si riapre in automatico: la ripresa di un collegamento su
   *    un'anagrafica ancora esistente vuole un'azione esplicita autorizzata
   *    (`docs/24` §8.5.2). L'import prosegue, lo storico resta com'è.
   */
  | { readonly tipo: 'collegamento_chiuso'; readonly identityId: string };

/**
 * La risposta a «si può creare?», col MOTIVO quando la risposta è no.
 *
 * ⭐ Il motivo non è decorazione: `docs/DA-FARE` fase B chiede che un articolo
 *    escluso sia **registrato**, e senza una frase da registrare resterebbe
 *    solo un conteggio.
 */
export type VerdettoCreazione =
  | { readonly tipo: 'si_crea' }
  | { readonly tipo: 'eliminato_definitivamente'; readonly motivo: string }
  | { readonly tipo: 'gia_collegato'; readonly motivo: string };

/**
 * 26.7 · **si può USARE questo GID per questa anagrafica?**
 *
 * ⭐ È la domanda che import e push devono fare **prima di fidarsi della
 *    colonna-cache**: lo storico è la fonte, la cache è una copia che può
 *    restare indietro — dopo un ripristino da backup, per esempio.
 *
 * ⚠️ **Si chiede per (negozio, GID), non per anagrafica**, ed è il limite che
 *    tiene: uno storico VECCHIO chiuso su un altro GID non deve bloccare il
 *    collegamento ATTUALE, che è valido. E nessuna identità per quel GID
 *    significa «mai collegato», cioè si procede — le connessioni non ancora
 *    migrate non hanno storico, e non sono escluse.
 */
export type UsoCollegamento =
  | { readonly tipo: 'utilizzabile' }
  | { readonly tipo: 'identita_eliminata'; readonly motivo: string }
  | { readonly tipo: 'collegamento_chiuso'; readonly motivo: string }
  | { readonly tipo: 'gid_di_un_altro'; readonly motivo: string };

/** Se l'anagrafica ha una storia su questo negozio che vieta di ripubblicarla da sola. */
export type UsoPubblicazione =
  | { readonly tipo: 'si_pubblica' }
  | { readonly tipo: 'ha_storia'; readonly motivo: string };

/**
 * Che cosa ha fatto `registraVariante`: gli stessi quattro rifiuti del
 * prodotto, più «già agganciata» — l'idempotenza, che non è un rifiuto.
 */
export type EsitoVariante =
  | 'registrato'
  | 'gia_agganciata'
  | 'collegamento_chiuso'
  | 'identita_eliminata'
  | 'gid_di_un_altra';

interface DatiProdotto {
  readonly tenantId: string;
  readonly shopId: string;
  readonly productId: string;
  readonly shopifyProductGid: string;
}

interface DatiVariante {
  readonly tenantId: string;
  readonly shopId: string;
  readonly productIdentityId: string;
  readonly productLinkId: string;
  readonly productId: string;
  readonly variantId: string;
  readonly shopifyVariantGid: string;
  readonly shopifyInventoryItemGid: string | null;
}

@Injectable()
export class ShopifyLinkHistoryService {
  private readonly logger = new Logger(ShopifyLinkHistoryService.name);

  /**
   * Il negozio del tenant, o `null` se la connessione non è ancora migrata.
   *
   * ⚠️ **Si legge una volta per operazione**, non per variante: un import di
   *    cento prodotti farebbe cento letture identiche.
   */
  async negozioDelTenant(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<string | null> {
    const connessione = await tx.shopifyConnection.findUnique({
      where: { tenantId },
      select: { shopId: true },
    });
    return connessione?.shopId ?? null;
  }

  /**
   * B5-B6 · **si può CREARE un articolo locale per questo GID?**
   *
   * ⛔ **La domanda si fa PRIMA di creare, e si fa allo storico** — non alla
   *    colonna-cache. `docs/24` §8.5.4: «la creazione va condizionata
   *    all'assenza di un link non chiuso, non alla sola assenza della
   *    colonna-cache, perché è il link, non la colonna, la fonte».
   *
   * ⚠️ **Tre casi distinti, e non vanno confusi** (`docs/24` §11.8, §8.5.2):
   *
   * | | |
   * | --- | --- |
   * | **mai collegato** | nessuna identità per quel GID: si importa normalmente |
   * | **collegamento chiuso, anagrafica ancora presente** | l'articolo esiste già scollegato: crearne un altro sarebbe un doppione |
   * | **anagrafica eliminata definitivamente** | `local_deleted_at` valorizzato: è l'esclusione di §11.8 |
   *
   * ⛔ **Nessuna regola di RIPRESA qui dentro.** Riagganciare un collegamento
   *    chiuso a un'anagrafica ancora viva è un'azione esplicita e autorizzata
   *    (§8.5.2), non una conseguenza di un import: questo metodo dice soltanto
   *    «non creare», e non riapre niente.
   */
  async siPuoCreareProdotto(
    tx: Prisma.TransactionClient,
    dati: { readonly shopId: string; readonly shopifyProductGid: string },
  ): Promise<VerdettoCreazione> {
    const identita = await tx.shopifyProductIdentity.findFirst({
      where: { shopId: dati.shopId, shopifyProductGid: dati.shopifyProductGid },
      select: { id: true, localDeletedAt: true, originalProductId: true },
    });
    if (!identita) {
      return { tipo: 'si_crea' };
    }
    if (identita.localDeletedAt) {
      return {
        tipo: 'eliminato_definitivamente',
        motivo:
          `${dati.shopifyProductGid} e' stato eliminato definitivamente in VestiFlow: ` +
          'non viene reimportato (docs/24 §11.8).',
      };
    }
    return {
      tipo: 'gia_collegato',
      motivo:
        `${dati.shopifyProductGid} appartiene gia' a un articolo locale ` +
        `(${identita.originalProductId}): non se ne crea un secondo.`,
    };
  }

  /** Lo stesso, per una variante. */
  async siPuoCreareVariante(
    tx: Prisma.TransactionClient,
    dati: { readonly shopId: string; readonly shopifyVariantGid: string },
  ): Promise<VerdettoCreazione> {
    const identita = await tx.shopifyVariantIdentity.findFirst({
      where: { shopId: dati.shopId, shopifyVariantGid: dati.shopifyVariantGid },
      select: { id: true, localDeletedAt: true, originalVariantId: true },
    });
    if (!identita) {
      return { tipo: 'si_crea' };
    }
    if (identita.localDeletedAt) {
      return {
        tipo: 'eliminato_definitivamente',
        motivo:
          `${dati.shopifyVariantGid} e' stata eliminata definitivamente in VestiFlow: ` +
          'non viene ricreata (docs/24 §11.8).',
      };
    }
    return {
      tipo: 'gia_collegato',
      motivo:
        `${dati.shopifyVariantGid} appartiene gia' a una variante locale ` +
        `(${identita.originalVariantId}): non se ne crea una seconda.`,
    };
  }

  /**
   * 26.7 · si può usare questo GID di PRODOTTO per questa anagrafica?
   *
   * ⭐ **Sola lettura**: risponde e basta, non scrive niente. Chi chiama decide
   *    che cosa farne — l'import salta, il push non scrive — e registra.
   */
  async collegamentoUsabileProdotto(
    tx: Prisma.TransactionClient,
    dati: {
      readonly shopId: string;
      readonly shopifyProductGid: string;
      readonly productId: string;
    },
  ): Promise<UsoCollegamento> {
    const identita = await tx.shopifyProductIdentity.findFirst({
      where: { shopId: dati.shopId, shopifyProductGid: dati.shopifyProductGid },
      select: { id: true, localDeletedAt: true, originalProductId: true },
    });
    // ⭐ Mai collegato: si procede. È anche il caso delle connessioni non
    //    ancora migrate, che di storico non ne hanno affatto.
    if (!identita) {
      return { tipo: 'utilizzabile' };
    }
    if (identita.localDeletedAt) {
      return {
        tipo: 'identita_eliminata',
        motivo:
          `${dati.shopifyProductGid} e' stato eliminato definitivamente in VestiFlow: ` +
          "il collegamento non si riusa (docs/24 §11.8). ⚠️ Il prodotto su Shopify puo' " +
          'esistere ancora: qui si parla del collegamento locale, non del remoto.',
      };
    }
    if (identita.originalProductId !== dati.productId) {
      return {
        tipo: 'gid_di_un_altro',
        motivo:
          `${dati.shopifyProductGid} appartiene a un altro articolo locale ` +
          `(${identita.originalProductId}): non si usa per questo.`,
      };
    }
    const attivo = await tx.shopifyProductLink.count({
      where: { identityId: identita.id, status: 'active' },
    });
    if (attivo === 0) {
      return {
        tipo: 'collegamento_chiuso',
        motivo:
          `il collegamento con ${dati.shopifyProductGid} e' chiuso: ` +
          'gli aggiornamenti non passano finche\' non viene riagganciato ' +
          "con un'azione esplicita (docs/24 §8.5.2).",
      };
    }
    return { tipo: 'utilizzabile' };
  }

  /** 26.7 · lo stesso per una VARIANTE. */
  async collegamentoUsabileVariante(
    tx: Prisma.TransactionClient,
    dati: {
      readonly shopId: string;
      readonly shopifyVariantGid: string;
      readonly variantId: string;
    },
  ): Promise<UsoCollegamento> {
    const identita = await tx.shopifyVariantIdentity.findFirst({
      where: { shopId: dati.shopId, shopifyVariantGid: dati.shopifyVariantGid },
      select: { id: true, localDeletedAt: true, originalVariantId: true },
    });
    if (!identita) {
      return { tipo: 'utilizzabile' };
    }
    if (identita.localDeletedAt) {
      return {
        tipo: 'identita_eliminata',
        motivo:
          `${dati.shopifyVariantGid} e' stata eliminata definitivamente in VestiFlow: ` +
          "il collegamento non si riusa (docs/24 §11.8). ⚠️ La variante su Shopify puo' " +
          'esistere ancora.',
      };
    }
    if (identita.originalVariantId !== dati.variantId) {
      return {
        tipo: 'gid_di_un_altro',
        motivo:
          `${dati.shopifyVariantGid} appartiene a un'altra variante locale ` +
          `(${identita.originalVariantId}): non si usa per questa.`,
      };
    }
    const attivo = await tx.shopifyVariantLink.count({
      where: { identityId: identita.id, status: 'active' },
    });
    if (attivo === 0) {
      return {
        tipo: 'collegamento_chiuso',
        motivo:
          `il collegamento con ${dati.shopifyVariantGid} e' chiuso: ` +
          "gli aggiornamenti non passano finche' non viene riagganciato (docs/24 §8.5.2).",
      };
    }
    return { tipo: 'utilizzabile' };
  }

  /**
   * 26.7 · questa anagrafica si può pubblicare da zero su questo negozio?
   *
   * ⛔ **No se ha gia' una storia**: un articolo con un'identita' — chiusa o
   *    eliminata — non si ripubblica come effetto di «Sincronizza». La
   *    ripubblicazione e' un comando esplicito (`docs/24` §11.9) e crea
   *    identificativi NUOVI; il riaggancio di un collegamento chiuso e' un
   *    altro comando ancora (§8.5.2).
   *
   * ⭐ **Un articolo MAI collegato si pubblica come sempre**: e' il caso
   *    normale della prima pubblicazione, e non si tocca.
   */
  async puoPubblicareDaZero(
    tx: Prisma.TransactionClient,
    dati: { readonly shopId: string; readonly productId: string },
  ): Promise<UsoPubblicazione> {
    const identita = await tx.shopifyProductIdentity.findFirst({
      where: { shopId: dati.shopId, originalProductId: dati.productId },
      select: { id: true, shopifyProductGid: true, localDeletedAt: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!identita) {
      return { tipo: 'si_pubblica' };
    }
    if (identita.localDeletedAt) {
      return {
        tipo: 'ha_storia',
        motivo:
          `l'articolo era collegato a ${identita.shopifyProductGid}, eliminato definitivamente ` +
          "in VestiFlow: la ripubblicazione e' un comando esplicito (docs/24 §11.9), " +
          'e creerebbe identificativi nuovi.',
      };
    }
    // ⚠️ **Periodo ancora ATTIVO e nessuna cache**: non e' un collegamento
    //    chiuso, e' una cache disallineata — e dirlo «chiuso» sarebbe falso.
    //    Pubblicare da zero fabbricherebbe un secondo prodotto remoto per la
    //    stessa anagrafica, quindi si rifiuta lo stesso, con il motivo giusto.
    const attivo = await tx.shopifyProductLink.count({
      where: { identityId: identita.id, status: 'active' },
    });
    return {
      tipo: 'ha_storia',
      motivo:
        attivo > 0
          ? `l'articolo risulta ancora collegato a ${identita.shopifyProductGid} nello storico, ` +
            "ma l'identificativo non e' piu' sull'anagrafica: non si pubblica un secondo " +
            'prodotto remoto per lo stesso articolo.'
          : `l'articolo e' collegato a ${identita.shopifyProductGid} con un collegamento chiuso: ` +
            "si riaggancia con un'azione esplicita (docs/24 §8.5.2), non ripubblicando.",
    };
  }

  /**
   * Registra l'identità del prodotto e apre il periodo, se non c'è.
   *
   * ⚠️ **Idempotente per costruzione**: l'identità si cerca per
   *    `(shop_id, gid)`, il periodo attivo per identità. Una richiesta ripetuta
   *    — e i webhook si ripetono per contratto — non crea doppioni.
   */
  async registraProdotto(
    tx: Prisma.TransactionClient,
    dati: DatiProdotto,
  ): Promise<EsitoStorico> {
    const { tenantId, shopId, productId, shopifyProductGid } = dati;

    const esistente = await tx.shopifyProductIdentity.findFirst({
      where: { shopId, shopifyProductGid },
    });

    if (esistente?.localDeletedAt) {
      // ⛔ Eliminata localmente: non si riaggancia e non si apre un periodo.
      //    ⭐ Controllata PRIMA della proprietà (dal 09/09/2026): un'identità
      //    eliminata non «appartiene» più a nessuno, e dire «di un altro» a un
      //    GID escluso sarebbe il motivo sbagliato nel registro (§10.3). Gli
      //    effetti non cambiano: in entrambi i rami non si scrive niente.
      return { tipo: 'identita_eliminata', identityId: esistente.id };
    }

    if (esistente && esistente.originalProductId !== productId) {
      // ⛔ Lo stesso GID su un'altra anagrafica: non si riassegna mai.
      this.logger.warn(
        `Storico Shopify: ${shopifyProductGid} appartiene gia' a un altro articolo locale. ` +
          'Nessuna identita scritta.',
      );
      return { tipo: 'gid_di_un_altro', identityId: esistente.id };
    }

    const identita =
      esistente ??
      (await tx.shopifyProductIdentity.create({
        data: {
          tenantId,
          shopId,
          shopifyProductGid,
          originalProductId: productId,
          productId,
        },
      }));

    const periodo = await this.apriPeriodoProdotto(tx, {
      tenantId,
      identityId: identita.id,
      originalProductId: identita.originalProductId,
    });
    if ('chiuso' in periodo) {
      // ⛔ Collegamento chiuso: non si riapre in automatico (§8.5.2).
      return { tipo: 'collegamento_chiuso', identityId: identita.id };
    }

    return { tipo: 'registrato', identityId: identita.id, linkId: periodo.id };
  }

  /**
   * Registra l'identità della variante e apre il suo periodo.
   *
   * ⚠️ **Appesa all'identità del prodotto e al suo periodo**: le FK
   *    `…_padre_*_fkey` impongono che padre e figlia stiano nello stesso
   *    negozio, nello stesso tenant e sulla stessa anagrafica originaria.
   */
  /**
   * ⭐ **Restituisce che cosa ha deciso**, dal 09/09/2026: prima i rami che non
   *    scrivevano tornavano in silenzio, e il chiamante non poteva registrare
   *    il rifiuto del riaggancio (§10.3). Nessun comportamento cambia: si
   *    dichiara ciò che già accadeva.
   */
  async registraVariante(
    tx: Prisma.TransactionClient,
    dati: DatiVariante,
  ): Promise<EsitoVariante> {
    const esistente = await tx.shopifyVariantIdentity.findFirst({
      where: { shopId: dati.shopId, shopifyVariantGid: dati.shopifyVariantGid },
    });

    // ⭐ Eliminata PRIMA della proprietà, come per il prodotto: un GID escluso
    //    non «appartiene» a nessuno, e il registro deve dire il motivo giusto.
    if (esistente?.localDeletedAt) {
      return 'identita_eliminata';
    }
    if (esistente && esistente.originalVariantId !== dati.variantId) {
      this.logger.warn(
        `Storico Shopify: ${dati.shopifyVariantGid} appartiene gia' a un'altra variante locale. ` +
          'Nessuna identita scritta.',
      );
      return 'gid_di_un_altra';
    }

    const identita =
      esistente ??
      (await tx.shopifyVariantIdentity.create({
        data: {
          tenantId: dati.tenantId,
          shopId: dati.shopId,
          productIdentityId: dati.productIdentityId,
          shopifyVariantGid: dati.shopifyVariantGid,
          shopifyInventoryItemGid: dati.shopifyInventoryItemGid,
          originalVariantId: dati.variantId,
          originalProductId: dati.productId,
          variantId: dati.variantId,
          productId: dati.productId,
        },
      }));

    // ⭐ L'articolo di inventario può arrivare DOPO l'identità: alla creazione
    //    su Shopify non è sempre noto. Si completa senza toccare il resto.
    if (esistente && !esistente.shopifyInventoryItemGid && dati.shopifyInventoryItemGid) {
      await tx.shopifyVariantIdentity.update({
        where: { id: esistente.id },
        data: { shopifyInventoryItemGid: dati.shopifyInventoryItemGid },
      });
    }

    // ⛔ **Nessuna riapertura automatica**, come per il prodotto: un periodo
    //    chiuso e nessuno attivo significa che quella variante è stata
    //    scollegata, e ricollegarla è un'azione esplicita autorizzata (§8.5.2).
    //    Prima bastava l'assenza di un periodo ATTIVO per crearne uno nuovo.
    const periodiEsistenti = await tx.shopifyVariantLink.findMany({
      where: { identityId: identita.id },
      select: { id: true, status: true },
    });
    if (periodiEsistenti.length > 0) {
      // ⭐ Un periodo ATTIVO: la variante è già agganciata, idempotente. Solo
      //    periodi chiusi: il riaggancio è rifiutato, e chi chiama lo registra.
      return periodiEsistenti.some((p) => p.status === 'active')
        ? 'gia_agganciata'
        : 'collegamento_chiuso';
    }

    await tx.shopifyVariantLink.create({
      data: {
        tenantId: dati.tenantId,
        identityId: identita.id,
        originalVariantId: identita.originalVariantId,
        productLinkId: dati.productLinkId,
      },
    });
    return 'registrato';
  }

  /**
   * B4 · sgancia la variante PRIMA che la sua riga sparisca.
   *
   * ⛔ **Senza questo, l'eliminazione di una variante collegata diventa
   *    impossibile**: la FK su `variant_id` è `RESTRICT`. È la ragione per cui
   *    B4 sta nello stesso blocco di B2 e B3 e non in uno successivo.
   *
   * ⚠️ **L'ordine è obbligato**: prima si chiudono i periodi, poi si sgancia
   *    l'identità. Al contrario, la FK `…_identita_viva_fkey` rifiuterebbe —
   *    un periodo attivo esige un'identità viva.
   */
  async sganciaVariante(
    tx: Prisma.TransactionClient,
    dati: { readonly tenantId: string; readonly variantId: string },
  ): Promise<void> {
    const identita = await tx.shopifyVariantIdentity.findMany({
      where: { tenantId: dati.tenantId, variantId: dati.variantId },
      select: { id: true },
    });
    if (identita.length === 0) {
      return;
    }
    const ids = identita.map((riga) => riga.id);

    await chiudiPeriodi(tx, 'shopify_variant_links', ids);

    await tx.shopifyVariantIdentity.updateMany({
      where: { id: { in: ids } },
      // ⚠️ I due riferimenti vivi si sganciano INSIEME: lo impone il CHECK
      //    `…_riferimenti_insieme`, e la data si scrive una volta sola.
      data: { variantId: null, productId: null, localDeletedAt: new Date() },
    });
  }

  /**
   * B4 · lo stesso per un prodotto, varianti comprese.
   *
   * ⚠️ **Le varianti per prime**: la FK `…_padre_vivo_fkey` esige che
   *    l'identità padre sia viva finché una figlia lo è.
   */
  async sganciaProdotto(
    tx: Prisma.TransactionClient,
    dati: { readonly tenantId: string; readonly productId: string },
  ): Promise<void> {
    const varianti = await tx.shopifyVariantIdentity.findMany({
      where: { tenantId: dati.tenantId, productId: dati.productId },
      select: { variantId: true },
    });
    for (const variante of varianti) {
      if (variante.variantId) {
        await this.sganciaVariante(tx, { tenantId: dati.tenantId, variantId: variante.variantId });
      }
    }

    const identita = await tx.shopifyProductIdentity.findMany({
      where: { tenantId: dati.tenantId, productId: dati.productId },
      select: { id: true },
    });
    if (identita.length === 0) {
      return;
    }
    const ids = identita.map((riga) => riga.id);

    await chiudiPeriodi(tx, 'shopify_product_links', ids);

    await tx.shopifyProductIdentity.updateMany({
      where: { id: { in: ids } },
      data: { productId: null, localDeletedAt: new Date() },
    });
  }

  /**
   * Il periodo attivo dell'identità, o uno nuovo — **mai una riapertura**.
   *
   * ⛔ **Qui c'era una ripresa automatica**, e non dipendeva dalla colonna-cache:
   *    bastava un periodo chiuso e nessun periodo attivo perché questa funzione
   *    ne creasse uno nuovo. Un articolo scollegato che restava in VestiFlow col
   *    suo `shopify_product_id` passava dal ramo di AGGIORNAMENTO — dove la
   *    guardia di creazione non arriva — e si ritrovava **ricollegato da solo**.
   *
   * ⭐ **La ripresa vuole un'azione esplicita autorizzata** (`docs/24` §8.5.2),
   *    e un import automatico non è quella. Trovando periodi chiusi e nessuno
   *    attivo, qui non si apre niente e si dichiara al chiamante.
   *
   * ⚠️ **Il primo collegamento resta possibile**: nessun periodo, nemmeno
   *    chiuso, significa che quell'identità non è mai stata collegata.
   */
  private async apriPeriodoProdotto(
    tx: Prisma.TransactionClient,
    dati: {
      readonly tenantId: string;
      readonly identityId: string;
      readonly originalProductId: string;
    },
  ): Promise<{ readonly id: string } | { readonly chiuso: true }> {
    const esistenti = await tx.shopifyProductLink.findMany({
      where: { identityId: dati.identityId },
      select: { id: true, status: true },
    });
    const attivo = esistenti.find((periodo) => periodo.status === ShopifyLinkStatus.active);
    if (attivo) {
      return { id: attivo.id };
    }
    if (esistenti.length > 0) {
      return { chiuso: true };
    }

    const creato = await tx.shopifyProductLink.create({
      data: {
        tenantId: dati.tenantId,
        identityId: dati.identityId,
        originalProductId: dati.originalProductId,
      },
      select: { id: true },
    });
    return { id: creato.id };
  }
}
