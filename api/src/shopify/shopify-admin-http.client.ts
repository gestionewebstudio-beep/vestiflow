import {
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';

import { registraChiamataRest } from './shopify-chiamata-uscente.util';
import { ShopifyConfigService } from './shopify-config.service';
import { ShopifyRateLimiterService } from './shopify-rate-limiter.service';
import {
  computeShopifyRetryDelayMs,
  parseShopifyRetryAfterHeader,
} from './shopify-rate-limiter.util';
import {
  BudgetTrasporto,
  causaDelCorpoFallito,
  causaDellaFetchFallita,
  eccezioneDiTrasporto,
  isStatoTransitorio,
} from './shopify-trasporto.util';

interface ShopifyAdminResponse<T> {
  readonly data?: T;
  readonly errors?: string;
}

const VERBI_DI_SCRITTURA = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Il solo trasporto verso l'Admin API REST: URL, token, limite di frequenza, ritentativi.
 *
 * Sta da solo perche' e' cio' che permette a un client di SOLA LETTURA di esistere davvero.
 * Finche' questo codice era privato dentro il client che sa anche registrare e cancellare,
 * chiunque volesse soltanto elencare i webhook doveva iniettare quel client — e la
 * separazione fra «diagnosticare» e «modificare» restava una promessa scritta nei commenti.
 *
 * ⭐ Dal 15/09/2026 (`docs/30` #3): ogni `fetch` ha un timeout; gli errori transitori
 *    (timeout, rete, 502/503/504 — anche a intestazioni già ricevute, sul corpo) si
 *    ritentano SOLO sulle letture, con l'attesa del limitatore per negozio; una scrittura
 *    interrotta è un esito incerto e non si ritenta; la scadenza complessiva comprende le
 *    attese del limitatore e l'intera risposta: dopo ogni attesa si rilegge il residuo, a
 *    residuo zero non si invia niente, e la chiamata dura al più il residuo. Le regole
 *    stanno in `shopify-trasporto.util.ts`, condivise col client GraphQL.
 */
@Injectable()
export class ShopifyAdminHttpClient {
  private readonly logger = new Logger(ShopifyAdminHttpClient.name);

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
    const readRetries = this.shopifyConfig.apiReadRetries;
    const budget = new BudgetTrasporto(
      this.shopifyConfig.apiDeadlineMs,
      this.shopifyConfig.apiTimeoutMs,
    );
    const scrittura = VERBI_DI_SCRITTURA.has((init.method ?? 'GET').toUpperCase());
    const verbo = `${(init.method ?? 'GET').toUpperCase()} ${path}`;

    // ⭐ Ogni chiamata lascia traccia di ciò che fa — lettura o SCRITTURA — prima di
    //    partire: è la misura con cui si dice «verso Shopify non è partito niente».
    registraChiamataRest(this.logger, init.method, path);

    // Due contatori distinti: i 429 hanno il loro limite (`apiMaxRetries`), i transitori
    // il loro (`apiReadRetries`, e solo se si legge). La scadenza vale per entrambi.
    let tentativi429 = 0;
    let tentativiTransitori = 0;

    /** Un errore transitorio: lettura → attesa e ritentativo entro i limiti; scrittura → esito incerto. */
    const ritentaTransitorio = async (
      causa: 'timeout' | 'rete' | 'server',
      dettaglio: string,
    ): Promise<void> => {
      if (scrittura || tentativiTransitori >= readRetries) {
        throw eccezioneDiTrasporto(causa, scrittura, dettaglio);
      }
      const attesa = computeShopifyRetryDelayMs(tentativiTransitori, null);
      if (budget.oltre(attesa)) {
        throw eccezioneDiTrasporto('scadenza', scrittura, dettaglio);
      }
      this.logger.warn(`Shopify ${causa} su ${verbo}: ritento fra ${attesa} ms`);
      await this.rateLimiter.waitForRetry(shopDomain, tentativiTransitori, null);
      tentativiTransitori += 1;
    };

    for (;;) {
      // ⛔ L'attesa del limitatore sta DENTRO la scadenza: alla scadenza il chiamante riceve
      //    l'errore, la chiamata non parte (né ora né dopo), e la pausa del negozio resta
      //    per le altre richieste. Poi si rilegge comunque il residuo.
      const esitoAttesa = await budget.attesaEntroIlResiduo((s) =>
        this.rateLimiter.beforeRestRequest(shopDomain, s),
      );
      const segnale = esitoAttesa === 'attesa' ? budget.segnale() : null;
      if (!segnale) {
        throw eccezioneDiTrasporto('scadenza', scrittura, `${verbo}, scaduta prima dell'invio`);
      }

      let response: Response;
      try {
        response = await fetch(url, {
          ...init,
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': accessToken,
            ...(init.headers ?? {}),
          },
          signal: segnale,
        });
      } catch (error: unknown) {
        const causa = causaDellaFetchFallita(error);
        await ritentaTransitorio(
          causa,
          `${verbo}, ${causa === 'timeout' ? 'nessuna risposta entro il tempo' : String(error instanceof Error ? error.message : error)}`,
        );
        continue;
      }

      this.rateLimiter.onCallLimitHeader(
        shopDomain,
        response.headers.get('x-shopify-shop-api-call-limit'),
      );

      if (response.status === 429) {
        const retryAfter = parseShopifyRetryAfterHeader(response.headers.get('retry-after'));
        await response.text().catch(() => undefined);
        const attesa = computeShopifyRetryDelayMs(tentativi429, retryAfter);
        if (tentativi429 >= maxRetries || budget.oltre(attesa)) {
          throw new HttpException(
            'Shopify ha limitato temporaneamente le richieste API. Riprova tra qualche minuto.',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        await this.rateLimiter.waitForRetry(shopDomain, tentativi429, retryAfter);
        tentativi429 += 1;
        continue;
      }

      if (isStatoTransitorio(response.status)) {
        await response.text().catch(() => undefined);
        await ritentaTransitorio('server', `${verbo}, HTTP ${response.status}`);
        continue;
      }

      if (!response.ok) {
        if (response.status === 404 && init.method === 'DELETE') {
          await response.text().catch(() => undefined);
          return {} as T;
        }

        const body = await response.text().catch(() => '');
        throw new InternalServerErrorException(
          `Shopify Admin API error (${response.status}): ${body.slice(0, 200)}`,
        );
      }

      if (response.status === 204) {
        return {} as T;
      }

      // ⚠️ Intestazioni ricevute, corpo ancora da leggere: qui il timeout, la rete o un
      //    corpo non valido si classificano come per la richiesta. Per una scrittura un
      //    `2xx` con corpo interrotto è un'operazione quasi certamente eseguita: incerto.
      let json: ShopifyAdminResponse<T> | T;
      try {
        json = (await response.json()) as ShopifyAdminResponse<T> | T;
      } catch (error: unknown) {
        const causa = causaDelCorpoFallito(error);
        const dettaglio = `${verbo}, corpo della risposta: ${String(error instanceof Error ? error.message : error)}`;
        if (causa === 'risposta') {
          throw eccezioneDiTrasporto('risposta', scrittura, dettaglio);
        }
        await ritentaTransitorio(causa, dettaglio);
        continue;
      }
      if (typeof json === 'object' && json !== null && 'errors' in json && json.errors) {
        throw new InternalServerErrorException(`Shopify Admin API: ${json.errors}`);
      }
      return json as T;
    }
  }
}
