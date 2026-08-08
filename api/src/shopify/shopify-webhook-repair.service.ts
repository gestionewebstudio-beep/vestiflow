import { Injectable, Logger } from '@nestjs/common';

import { ShopifyOAuthService } from './shopify-oauth.service';
import type { ShopifyWebhookStatusResult } from './shopify-webhook-status.service';
import { ShopifyWebhookStatusService } from './shopify-webhook-status.service';

/**
 * Ripara: registra le notifiche mancanti, poi **rimisura** e restituisce la misura.
 *
 * Sta in una classe sua e non dentro `ShopifyWebhookStatusService` per la stessa ragione per
 * cui quel servizio non inietta l'OAuth: **la diagnosi non deve poter scrivere**. Mettere qui
 * la registrazione avrebbe rimesso la capacita' di modificare dentro la classe che deve solo
 * guardare, e la separazione sarebbe tornata a essere una convenzione invece di un fatto.
 *
 * Qui invece scrivere e' il mestiere, ed e' dichiarato nel nome.
 */
@Injectable()
export class ShopifyWebhookRepairService {
  private readonly logger = new Logger(ShopifyWebhookRepairService.name);

  constructor(
    private readonly shopifyOAuth: ShopifyOAuthService,
    private readonly shopifyWebhookStatus: ShopifyWebhookStatusService,
  ) {}

  /**
   * Le due meta' stanno in una sola azione di proposito.
   *
   * La registrazione riporta cio' che **crede** di aver fatto: la somma delle risposte alle
   * proprie chiamate. La verifica riporta cio' che **c'e'**. Sono due modi diversi di sapere,
   * e quando divergono ha ragione il secondo — per questo si restituisce il referto della
   * rilettura, non l'esito della scrittura.
   *
   * Incatenare le due chiamate nel frontend lascerebbe vivo lo stato «ho registrato e non so
   * cosa e' successo», che e' il difetto di partenza in una terza forma.
   *
   * L'operazione usata e' quella **additiva**: salta i topic presenti, aggiunge solo i
   * mancanti, non cancella mai niente. Non passa dall'interruttore, che invece spegnerebbe
   * tutto per poi riaccendere. Il rifiuto su un indirizzo a cui Shopify non puo' consegnare
   * arriva dal percorso condiviso (registro 1.7): qui non serve ripeterlo, e ripeterlo
   * darebbe l'idea che sia una cortesia di questa azione invece che una regola.
   */
  async registerMissingAndRecheck(tenantId: string): Promise<ShopifyWebhookStatusResult> {
    const registration = await this.shopifyOAuth.resyncWebhooks(tenantId);

    if (registration.failed.length > 0) {
      this.logger.warn(
        `Riparazione notifiche (${tenantId}): ${registration.failed.length} non registrate — ${registration.failed
          .map((entry) => entry.topic)
          .join(', ')}`,
      );
    }

    return this.shopifyWebhookStatus.check(tenantId);
  }
}
