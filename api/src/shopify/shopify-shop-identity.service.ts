import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/** Il GID di un negozio: `gid://shopify/Shop/{numero}`. */
const FORMA_GID_NEGOZIO = /^gid:\/\/shopify\/Shop\/\d+$/;

/**
 * L'esito dell'acquisizione, dichiarato invece che dedotto dal chiamante.
 *
 * ⛔ **`rivendicato_altrove` NON e' un errore tecnico**: e' la regola di §8.5.1
 *    che scatta — lo stesso negozio Shopify non puo' appartenere a due aziende
 *    insieme — e va detta a chi ha premuto «collega», non ingoiata.
 */
export type EsitoIdentitaNegozio =
  | { readonly tipo: 'registrata'; readonly shopId: string; readonly shopGid: string }
  | { readonly tipo: 'rivendicato_altrove'; readonly shopGid: string }
  | { readonly tipo: 'negozio_diverso'; readonly shopGid: string; readonly shopIdCorrente: string }
  | { readonly tipo: 'non_acquisita'; readonly motivo: string };

/**
 * I codici che un CONFLITTO DI CONCORRENZA produce davvero, misurati.
 *
 * ⛔ **Non si assume che siano sempre dello stesso tipo**, ed era un'assunzione
 *    sbagliata: su 195 coppie concorrenti sul database di prova (08/09/2026)
 *    sono usciti TRE codici distinti, e mai `P2002`.
 *
 * ```text
 *   P2034                      «write conflict or deadlock» di Prisma
 *   P2010 + 40001              serialization_failure grezza di PostgreSQL
 *   P2010 + 23505              unicita' violata: raro, e sulla chiave COMPOSTA
 *                              (tenant_id, shop_gid), non su quella globale
 * ```
 *
 * ⛔ **`P2028` NON e' qui dentro**, ed e' stato tolto dopo che il proprietario
 *    l'ha rilevato leggendo il codice. E' il «transaction API error» di Prisma:
 *    transazione scaduta, chiusa, o usata dopo la fine. **Non e' un conflitto
 *    con un altro collegamento**, e dirlo all'operatore lo manda a cercare un
 *    collega che sta collegando lo stesso negozio — mentre il guasto e' che la
 *    transazione non ha retto. Un timeout si affronta, non si «riprova».
 *
 * ⚠️ `P2002` resta pur non essendo stato osservato, e la differenza e' che
 *    quello E' un conflitto: e' la forma con cui Prisma segnala l'unicita'
 *    violata, che qui puo' venire solo da un secondo collegamento sullo stesso
 *    `shop_gid`. Coprire un percorso non misurato con la classificazione GIUSTA
 *    e' diverso dal coprirlo con una comoda.
 */
const CODICI_PRISMA_CONFLITTO = new Set(['P2034', 'P2002']);
const CODICI_POSTGRES_CONFLITTO = new Set(['40001', '40P01', '23505']);

/**
 * Il conflitto e' RIPROVABILE: la transazione e' rotolata indietro per intero e
 * un secondo tentativo puo' riuscire.
 */
export function conflittoDiConcorrenza(errore: unknown): boolean {
  const candidato = errore as { code?: unknown; meta?: { code?: unknown } } | null;
  const codice = typeof candidato?.code === 'string' ? candidato.code : null;
  if (codice && CODICI_PRISMA_CONFLITTO.has(codice)) {
    return true;
  }
  const codicePostgres = typeof candidato?.meta?.code === 'string' ? candidato.meta.code : null;
  return codicePostgres !== null && CODICI_POSTGRES_CONFLITTO.has(codicePostgres);
}

/**
 * Fase 2 di §8.5.8 — l'acquisizione ESPLICITA dell'identita' del negozio.
 *
 * ⭐ **Un passo dichiarato, mai nascosto dentro una migration**: il `shop_gid`
 *    non esiste nei dati locali e si puo' ottenere solo interrogando Shopify.
 *
 * ⛔ **Non anticipa la fase 5.** `shop_gid` e `shop_id` restano NULLABLE per le
 *    connessioni preesistenti: nessun vincolo nuovo le tocca, e il passaggio
 *    resta graduale.
 *
 * ⛔ **E non fonde niente.** Se il negozio appartiene a un'altra azienda, o se
 *    la connessione ne aveva gia' un altro, questo servizio **si ferma e lo
 *    dice**: riassegnare da soli e' la decisione silenziosa che tutto questo
 *    modello esiste per impedire.
 */
@Injectable()
export class ShopifyShopIdentityService {
  private readonly logger = new Logger(ShopifyShopIdentityService.name);

  /**
   * Registra l'identita' del negozio DENTRO la transazione del chiamante.
   *
   * ⛔ **Riceve `tx`, e deve riceverlo** — corretto l'08/09/2026. Prima apriva
   *    una transazione propria, e la riga di `shopify_shops` sopravviveva a un
   *    collegamento fallito: un tentativo incompleto del tenant A **respingeva
   *    il tenant B**, che quel negozio lo possiede davvero (§22). Nella stessa
   *    transazione della connessione, un fallimento porta via anche la riga.
   *
   * ⚠️ **Idempotente per costruzione**: la riga si cerca per `shopGid` e si crea
   *    solo se assente. Una riconnessione allo stesso negozio non produce un
   *    doppione, e non riscrive `first_seen_at`.
   *
   * ⛔ **Nessuna cattura di `P2002` qui dentro**: un conflitto di unicita' aborta
   *    la transazione, e ripescare la riga dopo sarebbe impossibile. I conflitti
   *    si classificano FUORI, dopo il rollback (`conflittoDiConcorrenza`).
   */
  async registra(
    tx: Prisma.TransactionClient,
    tenantId: string,
    identita: { readonly shopGid: string; readonly myshopifyDomain: string | null },
  ): Promise<EsitoIdentitaNegozio> {
    const shopGid = identita.shopGid.trim();
    if (!FORMA_GID_NEGOZIO.test(shopGid)) {
      // ⛔ La forma la impone anche un CHECK nel database. Fermarsi qui serve a
      //    dire COSA non andava, invece di lasciare un errore 23514 grezzo.
      return { tipo: 'non_acquisita', motivo: `identita del negozio non riconoscibile: ${shopGid}` };
    }

    const gia = await tx.shopifyShop.findUnique({ where: { shopGid } });
    if (gia && gia.tenantId !== tenantId) {
      // ⚠️ Non si nomina l'altra azienda: chi collega deve sapere che il negozio
      //    e' gia' preso, non di CHI e'.
      this.logger.warn(
        `Identita negozio: ${shopGid} e' gia' collegato a un'altra azienda. Connessione rifiutata per ${tenantId}.`,
      );
      return { tipo: 'rivendicato_altrove', shopGid };
    }

    const connessione = await tx.shopifyConnection.findUnique({
      where: { tenantId },
      select: { shopId: true },
    });
    if (connessione?.shopId && connessione.shopId !== gia?.id) {
      // ⛔ La connessione punta gia' a un ALTRO negozio: e' un cambio negozio, e
      //    ha una transazione sua (§8.5.1) che chiude i periodi attivi delle tre
      //    famiglie. Qui non si riassegna: si dichiara.
      this.logger.warn(
        `Identita negozio: la connessione di ${tenantId} punta a un negozio diverso da ${shopGid}. ` +
          'Il cambio negozio non e` implementato: nessuna riassegnazione.',
      );
      return { tipo: 'negozio_diverso', shopGid, shopIdCorrente: connessione.shopId };
    }

    const negozio = gia
      ? await tx.shopifyShop.update({
          where: { id: gia.id },
          // ⭐ `firstSeenAt` NON si tocca: e' quando quel negozio e' comparso la
          //    prima volta. Il dominio e' una fotografia e si rinfresca.
          data: { lastSeenAt: new Date(), myshopifyDomain: identita.myshopifyDomain },
        })
      : await tx.shopifyShop.create({
          data: {
            tenantId,
            shopGid,
            myshopifyDomain: identita.myshopifyDomain,
            lastSeenAt: new Date(),
          },
        });
    return { tipo: 'registrata', shopId: negozio.id, shopGid };
  }
}
