import { Injectable } from '@nestjs/common';

import { ShopifyAdminHttpClient } from './shopify-admin-http.client';

/** Una sottoscrizione webhook come la riporta Shopify. */
export interface ShopifyWebhookSubscription {
  readonly id: string;
  readonly topic: string;
  readonly address: string;
}

interface ShopifyWebhookRow {
  readonly id?: number | string;
  readonly topic?: string;
  readonly address?: string;
}

/**
 * Elenca le sottoscrizioni webhook di un negozio. **Sa fare solo questo.**
 *
 * Non e' una convenzione: e' l'unica cosa che questa classe puo' fare. Non ha accesso ne'
 * alla registrazione ne' alla cancellazione, quindi una diagnosi non puo' trasformarsi in
 * una modifica nemmeno per errore — e in particolare non puo' creare sottoscrizioni verso
 * `localhost` se qualcuno la esegue da un ambiente locale, che e' il rischio concreto
 * descritto nel registro dei difetti al 2.2-bis.
 *
 * La regola «mai da locale» resta scritta, ma non e' piu' l'unica cosa che protegge: se
 * l'unica difesa e' la memoria di chi preme, prima o poi cede.
 */
@Injectable()
export class ShopifyWebhookReaderClient {
  constructor(private readonly http: ShopifyAdminHttpClient) {}

  async listWebhooks(
    shopDomain: string,
    accessToken: string,
  ): Promise<readonly ShopifyWebhookSubscription[]> {
    // `limit=250` esplicito: il valore predefinito di Shopify e' 50, e una diagnosi che
    // tronca in silenzio direbbe «non c'e'» al posto di «non l'ho guardato» — cioe'
    // esattamente il difetto che questa parte serve a togliere.
    const response = await this.http.request<{ webhooks?: readonly ShopifyWebhookRow[] }>(
      shopDomain,
      accessToken,
      '/webhooks.json?limit=250',
    );

    return (response.webhooks ?? [])
      .filter((row): row is ShopifyWebhookRow & { topic: string; address: string } =>
        Boolean(row.topic && row.address),
      )
      .map((row) => ({
        id: String(row.id ?? ''),
        topic: row.topic,
        address: row.address,
      }));
  }
}
