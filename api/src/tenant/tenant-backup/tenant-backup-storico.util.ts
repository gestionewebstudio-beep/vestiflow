import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import {
  TENANT_BACKUP_STORICO_SHOPIFY,
  type TenantBackupEntityFile,
} from './tenant-backup.constants';
import { backupDelegate, type BackupData, type BackupRow } from './tenant-backup-entities.util';

/**
 * Le FK verso l'anagrafica che il ripristino deve poter differire.
 *
 * ⛔ **Si differiscono PER NOME, mai `SET CONSTRAINTS ALL DEFERRED`.** Quella
 *    forma spegnerebbe ogni vincolo differibile della transazione, compresi
 *    quelli che nessuno ha esaminato: un errore verrebbe alla luce al commit,
 *    lontano dalla riga che l'ha causato, invece che subito.
 */
export const VINCOLI_DA_DIFFERIRE = [
  'shopify_product_identities_product_id_tenant_id_fkey',
  'shopify_variant_identities_variant_id_tenant_id_fkey',
  'shopify_variant_identities_variante_del_prodotto_fkey',
  'shopify_location_pairs_location_id_tenant_id_fkey',
] as const;

/** Il parametro che accende il permesso di riga, per quel tenant e per quella transazione. */
export const PERMESSO_RIPRISTINO = 'vestiflow.ripristino_tenant';

/**
 * Le colonne che un ripristino NON puo' vedere cambiate.
 *
 * ⛔ **Ci sta l'identita', non lo stato.** `local_deleted_at`, `status`,
 *    `closed_at`, `product_id` e `variant_id` restano fuori di proposito: sono
 *    cio' che puo' essere cambiato DOPO il backup — un articolo escluso la
 *    settimana scorsa, un periodo chiuso ieri — e un ripristino che li
 *    confrontasse rifiuterebbe proprio i casi normali. Non essendo confrontati
 *    e non essendo riscritti, restano quelli del database.
 */
const COLONNE_IMMUTABILI: Record<(typeof TENANT_BACKUP_STORICO_SHOPIFY)[number], readonly string[]> =
  {
    shopifyShops: ['tenantId', 'shopGid'],
    shopifyProductIdentities: ['tenantId', 'shopId', 'shopifyProductGid', 'originalProductId'],
    shopifyVariantIdentities: [
      'tenantId',
      'shopId',
      'productIdentityId',
      'shopifyVariantGid',
      'shopifyInventoryItemGid',
      'originalVariantId',
      'originalProductId',
    ],
    shopifyProductLinks: ['tenantId', 'identityId', 'originalProductId'],
    shopifyVariantLinks: ['tenantId', 'identityId', 'originalVariantId', 'productLinkId'],
    shopifyLocationPairs: ['tenantId', 'shopId', 'locationId', 'shopifyLocationGid'],
    shopifyLocationLinks: ['tenantId', 'pairId'],
  };

/**
 * Le identita' remote che il database garantisce uniche, e su quali colonne.
 *
 * ⚠️ `shopifyShops.shopGid` e' unico GLOBALMENTE, non per tenant (docs/24
 *    §8.5.1): la ricerca del conflitto non filtra per tenant, o non troverebbe
 *    proprio il caso peggiore — lo stesso negozio Shopify rivendicato da due
 *    aziende.
 */
const IDENTITA_UNICHE: Partial<
  Record<(typeof TENANT_BACKUP_STORICO_SHOPIFY)[number], readonly (readonly string[])[]>
> = {
  shopifyShops: [['shopGid']],
  shopifyProductIdentities: [['shopId', 'shopifyProductGid']],
  shopifyVariantIdentities: [
    ['shopId', 'shopifyVariantGid'],
    ['shopId', 'shopifyInventoryItemGid'],
  ],
  shopifyLocationPairs: [['locationId'], ['shopId', 'shopifyLocationGid']],
};

/**
 * I riferimenti dallo storico verso l'anagrafica, che il ripristino ricrea.
 * Il file di backup deve contenerli, o al commit la FK differita fallisce con
 * un errore che non nomina niente.
 */
const RIFERIMENTI_ALL_ANAGRAFICA: readonly {
  readonly storico: (typeof TENANT_BACKUP_STORICO_SHOPIFY)[number];
  readonly campo: string;
  readonly anagrafica: TenantBackupEntityFile;
  readonly etichetta: string;
}[] = [
  {
    storico: 'shopifyProductIdentities',
    campo: 'productId',
    anagrafica: 'products',
    etichetta: 'anagrafiche articolo',
  },
  {
    storico: 'shopifyVariantIdentities',
    campo: 'variantId',
    anagrafica: 'productVariants',
    etichetta: 'varianti',
  },
  {
    storico: 'shopifyVariantIdentities',
    campo: 'productId',
    anagrafica: 'products',
    etichetta: 'anagrafiche articolo',
  },
  {
    storico: 'shopifyLocationPairs',
    campo: 'locationId',
    anagrafica: 'locations',
    etichetta: 'sedi',
  },
];

/** Gli id gia' presenti nel database, per file di storico. */
export type StoricoPresente = ReadonlyMap<TenantBackupEntityFile, ReadonlySet<string>>;

function testo(valore: unknown): string {
  return valore instanceof Date ? valore.toISOString() : String(valore);
}

/** Due valori sono lo stesso valore per il database? `Date` e stringa ISO lo sono. */
function stessoValore(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;
  return testo(a) === testo(b);
}

/**
 * Il pre-controllo del ripristino sullo storico dei collegamenti.
 *
 * ⭐ **Spiega prima invece di fallire dopo.** Senza, un'incongruenza arriva come
 *    violazione di chiave esterna o di unicita' al momento del commit: un
 *    errore PostgreSQL grezzo, che non dice quale articolo ne' quale GID.
 *
 * ⛔ **E non sostituisce i vincoli**: quelli restano, e restano l'ultima parola.
 *    Questo controllo esiste per NOMINARE, non per autorizzare — se domani
 *    dimenticasse un caso, a fermarlo sarebbe comunque il database.
 *
 * Restituisce, per ogni file di storico, gli id gia' presenti: il ripristino
 * reinserisce **solo per assenza**, e questa e' la mappa che glielo dice.
 */
export async function verificaStoricoRipristinabile(
  tx: Prisma.TransactionClient,
  data: BackupData,
  tenantId: string,
): Promise<StoricoPresente> {
  const presenti = new Map<TenantBackupEntityFile, Set<string>>();

  for (const key of TENANT_BACKUP_STORICO_SHOPIFY) {
    const righeBackup = data[key] ?? [];
    const nelDatabase = await backupDelegate(tx, key).findMany({ where: { tenantId } });
    const perId = new Map(nelDatabase.map((riga) => [String(riga['id']), riga]));
    presenti.set(key, new Set(perId.keys()));

    for (const riga of righeBackup) {
      const id = String(riga['id']);
      const esistente = perId.get(id);
      if (!esistente) continue;
      // ── La riga c'e' gia': puo' essere solo LA STESSA riga ────────────────
      for (const colonna of COLONNE_IMMUTABILI[key]) {
        if (!stessoValore(riga[colonna], esistente[colonna])) {
          throw new BadRequestException(
            `Storico collegamenti incongruente: ${key}.${colonna} della riga ${id} vale ` +
              `«${testo(esistente[colonna])}» nel database e «${testo(riga[colonna])}» nel backup. ` +
              'Ripristino annullato.',
          );
        }
      }
    }

    // ── Una riga NUOVA non puo' rivendicare un'identita' remota gia' presa ──
    const daInserire = righeBackup.filter((riga) => !perId.has(String(riga['id'])));
    for (const chiave of IDENTITA_UNICHE[key] ?? []) {
      for (const riga of daInserire) {
        if (chiave.some((colonna) => riga[colonna] === null || riga[colonna] === undefined)) {
          continue;
        }
        const conflitti = await backupDelegate(tx, key).findMany({
          where: Object.fromEntries(chiave.map((colonna) => [colonna, riga[colonna]])),
        });
        const altrove = conflitti.filter((altra) => String(altra['id']) !== String(riga['id']));
        if (altrove.length > 0) {
          // ⚠️ Si nomina il VALORE in conflitto, non chi lo possiede: dire di
          //    quale azienda sia trasformerebbe il messaggio in un modo per
          //    scoprire i negozi altrui.
          throw new BadRequestException(
            `Identità remota già assegnata: ${key} ${chiave
              .map((colonna) => `${colonna}=${testo(riga[colonna])}`)
              .join(', ')}. Ripristino annullato.`,
          );
        }
      }
    }
  }

  await verificaAnagraficheRiferite(tx, data, tenantId);
  return presenti;
}

/**
 * Lo storico che RESTA in piedi punta ad anagrafiche che il ripristino ricrea:
 * se il backup non le contiene, la FK differita fallisce al commit.
 *
 * ⭐ Questo controllo esiste per trasformare quel fallimento muto in una frase
 *    che nomina l'articolo mancante.
 */
async function verificaAnagraficheRiferite(
  tx: Prisma.TransactionClient,
  data: BackupData,
  tenantId: string,
): Promise<void> {
  for (const riferimento of RIFERIMENTI_ALL_ANAGRAFICA) {
    // ⚠️ Il «non nullo» si filtra in memoria, non nella query: `NOT: { x: null }`
    //    e' invalido su una colonna NOT NULL, e due dei quattro riferimenti lo
    //    sono. Una condizione che vale per uno solo dei casi non e' una
    //    condizione: e' un ramo che fallisce sull'altro.
    const nelDatabase = await backupDelegate(tx, riferimento.storico).findMany({
      where: { tenantId },
    });
    const riferiti = nelDatabase
      .map((riga) => riga[riferimento.campo])
      .filter((valore) => valore !== null && valore !== undefined)
      .map(String);
    if (riferiti.length === 0) continue;
    const nelBackup = new Set(
      (data[riferimento.anagrafica] ?? []).map((riga) => String(riga['id'])),
    );
    const mancanti = [...new Set(riferiti.filter((id) => !nelBackup.has(id)))];
    if (mancanti.length > 0) {
      // ⚠️ Si nominano i primi, non tutti: un elenco di mille identificativi non
      //    e' un messaggio d'errore. Il numero c'e' comunque.
      throw new BadRequestException(
        `Il backup non contiene ${mancanti.length} ${riferimento.etichetta} ancora ` +
          `collegate a Shopify (${mancanti.slice(0, 3).join(', ')}` +
          `${mancanti.length > 3 ? ', …' : ''}). Ripristino annullato: lo storico dei ` +
          'collegamenti resterebbe senza anagrafica.',
      );
    }
  }
}

/** Le righe di storico da inserire: solo quelle assenti dal database. */
export function soloAssenti(
  righe: BackupRow[],
  presenti: ReadonlySet<string> | undefined,
): BackupRow[] {
  if (!presenti || presenti.size === 0) return righe;
  return righe.filter((riga) => !presenti.has(String(riga['id'])));
}

/**
 * 26.7 · le colonne-cache che il ripristino ha rimesso ma che lo storico NON
 * autorizza piu' a usare, azzerate.
 *
 * ⛔ **Il backup riporta l'anagrafica com'era, `shopify_product_id` compreso.**
 *    Se nel frattempo quel collegamento e' stato chiuso — o l'identita'
 *    eliminata definitivamente — la riga torna con un identificativo che lo
 *    storico vieta: e' esattamente la situazione misurata il 09/09/2026 (`S8`).
 *
 * ⭐ **Allineare NON e' la protezione, e' la pulizia.** La sicurezza sta nelle
 *    guardie di import e push, che interrogano lo storico prima di usare un
 *    identificativo: se dipendesse da qui, basterebbe non essere passati da un
 *    ripristino perche' non valesse (decisione del proprietario, 09/09/2026).
 *    Questa funzione toglie l'incoerenza, non la rende innocua.
 *
 * ⚠️ **Tre condizioni, e sono le stesse delle guardie**: identita' eliminata
 *    definitivamente, nessun periodo attivo, oppure GID che appartiene a
 *    un'altra riga locale. Una cache che punta a un GID SENZA identita' non si
 *    tocca: e' la connessione non ancora migrata, che di storico non ne ha.
 *
 * ⛔ Set-based, in due istruzioni: riga per riga sarebbero due round-trip per
 *    articolo su un ripristino che ne porta migliaia.
 */
export async function allineaCacheIncoerenti(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<{ readonly prodotti: number; readonly varianti: number }> {
  const prodotti = await tx.$executeRawUnsafe(
    `UPDATE products p
        SET shopify_product_id = NULL, updated_at = now()
      WHERE p.tenant_id = $1::uuid
        AND p.shopify_product_id IS NOT NULL
        AND EXISTS (
          SELECT 1
            FROM shopify_product_identities i
           WHERE i.tenant_id = p.tenant_id
             AND i.shopify_product_gid = 'gid://shopify/Product/' || p.shopify_product_id
             AND (
               i.local_deleted_at IS NOT NULL
               OR i.original_product_id <> p.id
               OR NOT EXISTS (
                 SELECT 1 FROM shopify_product_links l
                  WHERE l.identity_id = i.id AND l.status = 'active'
               )
             )
        )`,
    tenantId,
  );
  const varianti = await tx.$executeRawUnsafe(
    `UPDATE product_variants v
        SET shopify_variant_id = NULL, shopify_inventory_item_id = NULL, updated_at = now()
      WHERE v.tenant_id = $1::uuid
        AND v.shopify_variant_id IS NOT NULL
        AND EXISTS (
          SELECT 1
            FROM shopify_variant_identities i
           WHERE i.tenant_id = v.tenant_id
             AND i.shopify_variant_gid = 'gid://shopify/ProductVariant/' || v.shopify_variant_id
             AND (
               i.local_deleted_at IS NOT NULL
               OR i.original_variant_id <> v.id
               OR NOT EXISTS (
                 SELECT 1 FROM shopify_variant_links l
                  WHERE l.identity_id = i.id AND l.status = 'active'
               )
             )
        )`,
    tenantId,
  );
  return { prodotti, varianti };
}
