import { HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, type Observable, timeout } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';
import { DEFAULT_CURRENCY } from '@core/utils/money.util';

import type { CorrispettiviSummary } from '../models/corrispettivi.model';
import type {
  AccountantRegisterQuery,
  AccountantRegisterSummary,
} from '../models/accountant-register.model';

const HTTP_TIMEOUT_MS = 15000;

interface AccountantRegisterSummaryApi {
  readonly periodFrom: string | null;
  readonly periodTo: string | null;
  readonly documents: AccountantRegisterSummary['documents'];
  readonly corrispettivi: {
    readonly orderCount: number;
    readonly refundsCount: number;
    readonly subtotalMinor: number;
    readonly taxMinor: number;
    readonly shippingMinor: number;
    readonly discountMinor: number;
    readonly totalMinor: number;
    readonly taxableMinor: number;
    readonly pendingDeliveryCount: number;
  };
}

@Injectable({ providedIn: 'root' })
export class AccountantRegisterService {
  private readonly http = inject(ApiHttpClient);
  private readonly config = inject(APP_CONFIG);

  getSummary(query: AccountantRegisterQuery = {}): Observable<AccountantRegisterSummary> {
    let params = new HttpParams();
    if (query.dateFrom) {
      params = params.set('dateFrom', query.dateFrom);
    }
    if (query.dateTo) {
      params = params.set('dateTo', query.dateTo);
    }
    if (query.channel) {
      params = params.set('channel', query.channel);
    }

    return this.http
      .get<AccountantRegisterSummaryApi>(this.url('/accountant-register/summary'), { params })
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapSummary));
  }

  private url(path: string): string {
    return `${this.config.apiBaseUrl}${path}`;
  }
}

function mapSummary(row: AccountantRegisterSummaryApi): AccountantRegisterSummary {
  return {
    periodFrom: row.periodFrom,
    periodTo: row.periodTo,
    documents: row.documents,
    corrispettivi: mapCorrispettiviSummary(row.corrispettivi),
  };
}

function mapCorrispettiviSummary(
  row: AccountantRegisterSummaryApi['corrispettivi'],
): CorrispettiviSummary {
  return {
    orderCount: row.orderCount,
    refundsCount: row.refundsCount,
    subtotal: money(row.subtotalMinor),
    tax: money(row.taxMinor),
    shipping: money(row.shippingMinor),
    discount: money(row.discountMinor),
    total: money(row.totalMinor),
    taxable: money(row.taxableMinor),
    pendingDeliveryCount: row.pendingDeliveryCount,
  };
}

function money(amountMinor: number) {
  return { amountMinor, currencyCode: DEFAULT_CURRENCY };
}
