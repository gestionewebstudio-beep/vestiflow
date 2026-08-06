import { inject, Injectable } from '@angular/core';
import { map, type Observable, timeout } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';
import type { EntityId } from '@core/models/common.model';
import type {
  VatCalculationMode,
  VatCode,
  VatNature,
  VatUsageScope,
} from '@core/models/vat-code.model';

const HTTP_TIMEOUT_MS = 15000;

interface VatNatureApiRow {
  readonly id: EntityId;
  readonly key: string;
  readonly officialCode?: string | null;
  readonly label: string;
  readonly description?: string | null;
  readonly defaultUsageScope: VatUsageScope;
  readonly defaultCalculationMode: VatCalculationMode;
  readonly sortOrder: number;
}

interface VatCodeApiRow {
  readonly id: EntityId;
  readonly code: string;
  readonly natureId: EntityId;
  readonly nature: VatNatureApiRow;
  readonly ratePercent: string | number;
  readonly nonDeductiblePercent: string | number;
  readonly description: string;
  readonly notes?: string | null;
  readonly usageScope: VatUsageScope;
  readonly calculationMode: VatCalculationMode;
  readonly vatAffectsSupplierTotal: boolean;
  readonly isDefault: boolean;
  readonly isActive: boolean;
  readonly isSystem: boolean;
  readonly sortOrder: number;
}

export interface UpsertVatCodeBody {
  readonly code?: string;
  readonly natureId?: EntityId;
  readonly ratePercent?: number;
  readonly nonDeductiblePercent?: number;
  readonly description?: string;
  readonly notes?: string;
  readonly usageScope?: VatUsageScope;
  readonly calculationMode?: VatCalculationMode;
  readonly vatAffectsSupplierTotal?: boolean;
  readonly isDefault?: boolean;
  readonly isActive?: boolean;
}

function mapNature(row: VatNatureApiRow): VatNature {
  return {
    id: row.id,
    key: row.key,
    officialCode: row.officialCode ?? null,
    label: row.label,
    description: row.description ?? null,
    defaultUsageScope: row.defaultUsageScope,
    defaultCalculationMode: row.defaultCalculationMode,
    sortOrder: row.sortOrder,
  };
}

function mapVatCode(row: VatCodeApiRow): VatCode {
  return {
    id: row.id,
    code: row.code,
    natureId: row.natureId,
    nature: mapNature(row.nature),
    ratePercent: Number(row.ratePercent),
    nonDeductiblePercent: Number(row.nonDeductiblePercent),
    description: row.description,
    notes: row.notes ?? null,
    usageScope: row.usageScope,
    calculationMode: row.calculationMode,
    vatAffectsSupplierTotal: row.vatAffectsSupplierTotal,
    isDefault: row.isDefault,
    isActive: row.isActive,
    isSystem: row.isSystem,
    sortOrder: row.sortOrder,
  };
}

/** Accesso HTTP ai Codici IVA aziendali e al catalogo Nature (seed lazy server-side). */
@Injectable({ providedIn: 'root' })
export class VatCodeService {
  private readonly http = inject(ApiHttpClient);
  private readonly config = inject(APP_CONFIG);

  list(): Observable<readonly VatCode[]> {
    return this.http.get<readonly VatCodeApiRow[]>(this.url('')).pipe(
      timeout(HTTP_TIMEOUT_MS),
      map((rows) => rows.map(mapVatCode)),
    );
  }

  listNatures(): Observable<readonly VatNature[]> {
    return this.http.get<readonly VatNatureApiRow[]>(this.url('/natures')).pipe(
      timeout(HTTP_TIMEOUT_MS),
      map((rows) => rows.map(mapNature)),
    );
  }

  create(body: UpsertVatCodeBody): Observable<VatCode> {
    return this.http
      .post<VatCodeApiRow>(this.url(''), body)
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapVatCode));
  }

  update(id: EntityId, body: UpsertVatCodeBody): Observable<VatCode> {
    return this.http
      .patch<VatCodeApiRow>(this.url(`/${id}`), body)
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapVatCode));
  }

  duplicate(id: EntityId, code: string): Observable<VatCode> {
    return this.http
      .post<VatCodeApiRow>(this.url(`/${id}/duplicate`), { code })
      .pipe(timeout(HTTP_TIMEOUT_MS), map(mapVatCode));
  }

  delete(id: EntityId): Observable<void> {
    return this.http.delete<void>(this.url(`/${id}`)).pipe(timeout(HTTP_TIMEOUT_MS));
  }

  private url(path: string): string {
    return `${this.config.apiBaseUrl}/vat-codes${path}`;
  }
}
