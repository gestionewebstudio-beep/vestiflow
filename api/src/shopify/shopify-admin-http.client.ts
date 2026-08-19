import { HttpException, HttpStatus, Injectable, InternalServerErrorException } from '@nestjs/common';

import { ShopifyConfigService } from './shopify-config.service';
import { ShopifyRateLimiterService } from './shopify-rate-limiter.service';
import { parseShopifyRetryAfterHeader } from './shopify-rate-limiter.util';

interface ShopifyAdminResponse<T> {
  readonly data?: T;
  readonly errors?: string;
}

/**
 * Il solo trasporto verso l'Admin API REST: URL, token, limite di frequenza, ritentativi.
 *
 * Sta da solo perche' e' cio' che permette a un client di SOLA LETTURA di esistere davvero.
 * Finche' questo codice era privato dentro il client che sa anche registrare e cancellare,
 * chiunque volesse soltanto elencare i webhook doveva iniettare quel client — e la
 * separazione fra «diagnosticare» e «modificare» restava una promessa scritta nei commenti.
 *
 * Il corpo e' quello che stava in ShopifyAdminClient.request, spostato senza modifiche.
 */
@Injectable()
export class ShopifyAdminHttpClient {
  constructor(
    private readonly shopifyConfig: ShopifyConfigService,
    private readonly rateLimiter: ShopifyRateLimiterService,
  ) {}

  async request<T>(
    shopDomain: string,
    accessToken: string,
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const apiVersion = this.shopifyConfig.apiVersion;
    const url = `https://${shopDomain}/admin/api/${apiVersion}${path}`;
    const maxRetries = this.shopifyConfig.apiMaxRetries;

    for (let attempt = 0; ; attempt += 1) {
      await this.rateLimiter.beforeRestRequest(shopDomain);

      const response = await fetch(url, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
          ...(init.headers ?? {}),
        },
      });

      this.rateLimiter.onCallLimitHeader(
        shopDomain,
        response.headers.get('x-shopify-shop-api-call-limit'),
      );

      if (response.status === 429) {
        if (attempt >= maxRetries) {
          throw new HttpException(
            'Shopify ha limitato temporaneamente le richieste API. Riprova tra qualche minuto.',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }

        const retryAfter = parseShopifyRetryAfterHeader(response.headers.get('retry-after'));
        await response.text().catch(() => undefined);
        await this.rateLimiter.waitForRetry(shopDomain, attempt, retryAfter);
        continue;
      }

      if (!response.ok) {
        if (response.status === 404 && init.method === 'DELETE') {
          await response.text().catch(() => undefined);
          return {} as T;
        }

        const body = await response.text();
        throw new InternalServerErrorException(
          `Shopify Admin API error (${response.status}): ${body.slice(0, 200)}`,
        );
      }

      if (response.status === 204) {
        return {} as T;
      }

      const json = (await response.json()) as ShopifyAdminResponse<T> | T;
      if (typeof json === 'object' && json !== null && 'errors' in json && json.errors) {
        throw new InternalServerErrorException(`Shopify Admin API: ${json.errors}`);
      }
      return json as T;
    }
  }
}
