import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { ShopifyConfigService } from './shopify-config.service';
import { ShopifyConnectionService } from './shopify-connection.service';
import { ShopifyCryptoService } from './shopify-crypto.service';
import { ShopifyWebhookReaderClient } from './shopify-webhook-reader.client';
import {
  chooseObservedAddressGroup,
  groupWebhooksByAddress,
  missingShopifyWebhookTopics,
  unexpectedShopifyWebhookTopics,
} from './shopify-webhook-topics';

/** Cosa risulta su Shopify adesso, e come si confronta con quello che VestiFlow si aspetta. */
export interface ShopifyWebhookStatusResult {
  readonly checkedAt: string;
  readonly shopDomain: string;
  /** L'indirizzo che questo ambiente userebbe per registrare. `null` = non configurato. */
  readonly configuredAddress: string | null;
  /** L'indirizzo a cui le sottoscrizioni consegnano davvero. `null` = non ce ne sono. */
  readonly observedAddress: string | null;
  /** `null` quando manca un termine del confronto: non e' un allarme, e' un non-confronto. */
  readonly addressMatchesConfigured: boolean | null;
  readonly topics: readonly string[];
  readonly missingTopics: readonly string[];
  readonly unexpectedTopics: readonly string[];
  /** Sottoscrizioni verso altri indirizzi: si sono sommate invece di sostituirsi. */
  readonly otherAddresses: readonly { readonly address: string; readonly topicCount: number }[];
  readonly totalSubscriptions: number;
}

/**
 * «Verifica ora»: chiede a Shopify quali sottoscrizioni esistono davvero e lo registra.
 *
 * **Legge da Shopify, non ci scrive mai.** Non e' una promessa: le dipendenze di questa
 * classe non contengono niente che sappia registrare o cancellare. In particolare NON viene
 * iniettato `ShopifyOAuthService` — che pure avrebbe il metodo comodo per il token — proprio
 * perche' porta con se' `resyncWebhooks` e `disableWebhooks`. La credenziale si legge qui,
 * in cinque righe, e in cambio questa classe non ha alcuna strada verso una modifica.
 *
 * Il motivo e' concreto e sta nel registro al 2.2-bis: `.env.example` distribuisce
 * `SHOPIFY_APP_URL=http://localhost:3000`, e una registrazione fatta da un ambiente con quel
 * valore creerebbe sottoscrizioni verso `localhost` che si sommano a quelle buone.
 *
 * Sull'archivio VestiFlow invece scrive: l'osservazione con la sua data, che e' l'unico modo
 * perche' la schermata smetta di nascere muta sulle connessioni gia' esistenti.
 */
@Injectable()
export class ShopifyWebhookStatusService {
  private readonly logger = new Logger(ShopifyWebhookStatusService.name);

  constructor(
    private readonly webhookReader: ShopifyWebhookReaderClient,
    private readonly shopifyConnection: ShopifyConnectionService,
    private readonly shopifyConfig: ShopifyConfigService,
    private readonly shopifyCrypto: ShopifyCryptoService,
    private readonly prisma: PrismaService,
  ) {}

  async check(tenantId: string): Promise<ShopifyWebhookStatusResult> {
    const credential = await this.prisma.shopifyCredential.findUnique({ where: { tenantId } });
    if (!credential) {
      throw new NotFoundException('Shopify non connesso per questo tenant');
    }

    const subscriptions = await this.webhookReader.listWebhooks(
      credential.shopDomain,
      this.shopifyCrypto.decrypt(credential.accessTokenEnc),
    );

    const groups = groupWebhooksByAddress(subscriptions);
    const configuredAddress = this.shopifyConfig.webhookUrl ?? null;
    const observed = chooseObservedAddressGroup(groups, configuredAddress);
    const topics = observed?.topics ?? [];

    // Si scrive anche quando non si e' trovato niente: la data distingue «verificato, zero»
    // da «mai guardato», ed e' la distinzione su cui si gioca tutta questa parte.
    const checkedAt = await this.shopifyConnection.recordWebhooksObserved(tenantId, {
      topics,
      address: observed?.address ?? null,
    });

    const missingTopics = missingShopifyWebhookTopics(topics);
    if (missingTopics.length > 0) {
      this.logger.warn(
        `Webhook mancanti su ${credential.shopDomain} (${tenantId}): ${missingTopics.join(', ')}`,
      );
    }

    return {
      checkedAt: checkedAt.toISOString(),
      shopDomain: credential.shopDomain,
      configuredAddress,
      observedAddress: observed?.address ?? null,
      addressMatchesConfigured:
        observed && configuredAddress ? observed.address === configuredAddress : null,
      topics,
      missingTopics,
      unexpectedTopics: unexpectedShopifyWebhookTopics(topics),
      otherAddresses: groups
        .filter((group) => group.address !== observed?.address)
        .map((group) => ({ address: group.address, topicCount: group.topics.length })),
      totalSubscriptions: subscriptions.length,
    };
  }
}
