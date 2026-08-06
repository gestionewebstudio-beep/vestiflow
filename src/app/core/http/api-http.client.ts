import { HttpClient, HttpContext, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import { withSilentHttpError } from './http-context.util';

type HttpParamsInput =
  | HttpParams
  | Record<string, string | number | boolean | readonly (string | number | boolean)[]>;

interface ApiHttpOptionsBase {
  headers?: HttpHeaders | Record<string, string | string[]>;
  context?: HttpContext;
  params?: HttpParamsInput;
  reportProgress?: boolean;
  withCredentials?: boolean;
  transferCache?: boolean | { includeHeaders?: string[] };
}

interface ApiHttpJsonOptions extends ApiHttpOptionsBase {
  observe?: 'body';
  responseType?: 'json';
}

interface ApiHttpBlobOptions extends ApiHttpOptionsBase {
  observe?: 'body';
  responseType: 'blob';
}

interface ApiHttpMutationOptions extends ApiHttpOptionsBase {
  observe?: 'body';
  responseType?: 'json';
}

/**
 * Wrapper HttpClient per chiamate API gestionale: silenzia i toast globali
 * lasciando error-state / submitError / alert form come unica UX di errore.
 * Per errori non gestiti usare HttpClient diretto (raro).
 */
@Injectable({ providedIn: 'root' })
export class ApiHttpClient {
  private readonly http = inject(HttpClient);

  get<T>(url: string, options?: ApiHttpJsonOptions): Observable<T>;
  get(url: string, options: ApiHttpBlobOptions): Observable<Blob>;
  get<T>(url: string, options?: ApiHttpJsonOptions | ApiHttpBlobOptions): Observable<T | Blob> {
    if (options?.responseType === 'blob') {
      return this.http.get(url, withSilentHttpError(options));
    }
    return this.http.get<T>(url, withSilentHttpError(options));
  }

  post<T>(url: string, body: unknown, options?: ApiHttpMutationOptions): Observable<T> {
    return this.http.post<T>(url, body, withSilentHttpError(options));
  }

  put<T>(url: string, body: unknown, options?: ApiHttpMutationOptions): Observable<T> {
    return this.http.put<T>(url, body, withSilentHttpError(options));
  }

  patch<T>(url: string, body: unknown, options?: ApiHttpMutationOptions): Observable<T> {
    return this.http.patch<T>(url, body, withSilentHttpError(options));
  }

  delete<T>(url: string, options?: ApiHttpMutationOptions): Observable<T> {
    return this.http.delete<T>(url, withSilentHttpError(options));
  }
}
