import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';

import { AuthService } from '@core/auth';
import { creationResultUncertain } from '@core/models/creation-intent-error.util';

import type {
  CashCheckoutPayload,
  CashReturnPayload,
  CashIntentResult,
} from '@domain/cash/models/cash.model';

interface Payloads {
  checkout: CashCheckoutPayload;
  returns: CashReturnPayload;
}
export type CashPendingOperation = keyof Payloads;
type Operation = CashPendingOperation;
export interface CashPendingEvidence {
  readonly key: string;
  readonly raw: string;
  readonly intentId: string | null;
  readonly compatible: boolean;
  readonly locationId: string | null;
  readonly sessionId: string | null;
}
export interface PendingCashRequest<K extends Operation> {
  readonly version: 1;
  readonly operation: K;
  readonly description: string;
  readonly payload: Payloads[K];
}

const STORAGE_ERROR =
  'Non è possibile conservare l’invio in questo browser. Ripristina l’accesso ai dati della sessione prima di registrare.';
const UNREADABLE =
  'I dati dell’invio precedente non sono leggibili. Fai verificare l’operazione prima di registrarne un’altra.';

/** Conserva il comando prima del POST. Il registro intenti del server resta l'autorità. */
@Injectable({ providedIn: 'root' })
export class CashPendingOperationsService {
  private readonly auth = inject(AuthService);
  private readonly document = inject(DOCUMENT);
  private readonly revision = signal(0);
  private readonly storageErrors = signal<ReadonlyMap<string, string>>(new Map());
  private readonly lastReadable = new Map<string, string>();

  watch<K extends Operation>(operation: K) {
    return computed(() => {
      this.revision();
      return this.inspect(operation);
    });
  }

  /** Riprova l'accesso: non cancella e non modifica alcun dato locale. */
  refresh(): void {
    this.storageErrors.set(new Map());
    this.revision.update((value) => value + 1);
  }

  owns(evidence: CashPendingEvidence): boolean {
    try {
      return evidence.key === this.key('checkout') || evidence.key === this.key('returns');
    } catch {
      return false;
    }
  }

  /** Solo dopo verifica server attuale e conferma dell'utente. L'originale non
   * viene eliminato finché la copia, nello stesso scope tenant/utente, non è riletta. */
  acknowledgeRecorded(
    operation: Operation,
    evidence: CashPendingEvidence,
    result: Extract<CashIntentResult, { status: 'recorded' }>,
  ): void {
    const current = this.inspect(operation).evidence;
    if (
      !current ||
      current.key !== evidence.key ||
      current.raw !== evidence.raw ||
      !current.compatible ||
      current.intentId !== result.intentId ||
      current.locationId !== result.locationId ||
      current.sessionId !== result.sessionId
    ) {
      throw new Error(
        'I dati locali non corrispondono alla verifica. La pendenza resta da verificare.',
      );
    }
    try {
      const storage = this.storage();
      const archiveKey = `${current.key}:recovered:${result.intentId}`;
      const archive = JSON.stringify({ version: 1, originalRaw: current.raw, result });
      const existing = storage.getItem(archiveKey);
      if (existing !== null && existing !== archive)
        throw new Error('Copia di recupero diversa: non verrà sovrascritta.');
      if (existing === null) storage.setItem(archiveKey, archive);
      if (storage.getItem(archiveKey) !== archive || storage.getItem(current.key) !== current.raw)
        throw new Error('Conservazione dei dati non verificabile.');
      storage.removeItem(current.key);
      if (storage.getItem(current.key) !== null) throw new Error('Pendenza locale non chiusa.');
      this.lastReadable.delete(current.key);
      this.setStorageError(operation, null);
    } catch {
      this.setStorageError(operation, STORAGE_ERROR);
      throw new Error(
        'Non è stato possibile conservare la copia e chiudere la pendenza. Rileggi i dati locali e verifica nuovamente.',
      );
    } finally {
      this.revision.update((value) => value + 1);
    }
  }

  prepare<K extends Operation>(
    operation: K,
    payload: Payloads[K],
    description: string,
  ): Payloads[K] {
    if (this.read(operation))
      throw new Error(
        'Recupera l’esito dell’invio precedente prima di registrare un’altra operazione.',
      );
    const request: PendingCashRequest<K> = { version: 1, operation, description, payload };
    try {
      const raw = JSON.stringify(request);
      const key = this.key(operation);
      this.storage().setItem(key, raw);
      this.lastReadable.set(key, raw);
    } catch {
      this.setStorageError(operation, STORAGE_ERROR);
      this.revision.update((value) => value + 1);
      throw new Error(STORAGE_ERROR);
    }
    this.revision.update((value) => value + 1);
    return structuredClone(payload);
  }

  recover<K extends Operation>(operation: K): Payloads[K] | null {
    const request = this.read(operation);
    return request ? structuredClone(request.payload) : null;
  }

  failed(operation: Operation, intentId: string, error: unknown, recovering: boolean): void {
    // Un rifiuto successivo non dimostra che il PRIMO invio incerto non abbia avuto effetti.
    if (!recovering && !creationResultUncertain(error)) this.complete(operation, intentId);
  }

  complete(operation: Operation, intentId: string): void {
    try {
      if (this.read(operation)?.payload.creationIntentId !== intentId) return;
      this.storage().removeItem(this.key(operation));
      this.lastReadable.delete(this.key(operation));
      this.setStorageError(operation, null);
    } catch {
      this.setStorageError(operation, STORAGE_ERROR);
    } finally {
      this.revision.update((value) => value + 1);
    }
  }

  private key(operation: Operation): string {
    const user = this.auth.currentUser();
    if (!user?.id || !user.tenantId) throw new Error('Accedi nuovamente prima di registrare.');
    return `vestiflow.cash.pending.v1:${user.tenantId}:${user.id}:${operation}`;
  }

  private setStorageError(operation: Operation, error: string | null): void {
    let key: string;
    try {
      key = this.key(operation);
    } catch {
      return;
    }
    this.storageErrors.update((errors) => {
      const next = new Map(errors);
      if (error) next.set(key, error);
      else next.delete(key);
      return next;
    });
  }

  private storage(): Storage {
    const storage = this.document.defaultView?.sessionStorage;
    if (!storage) throw new Error(STORAGE_ERROR);
    return storage;
  }

  private read<K extends Operation>(operation: K): PendingCashRequest<K> | null {
    const state = this.inspect(operation);
    if (state.error) throw new Error(state.error);
    return state.request;
  }

  private inspect<K extends Operation>(
    operation: K,
  ): {
    request: PendingCashRequest<K> | null;
    error: string | null;
    evidence: CashPendingEvidence | null;
  } {
    let key: string;
    try {
      key = this.key(operation);
    } catch {
      return { request: null, error: 'Accedi nuovamente prima di registrare.', evidence: null };
    }
    let raw: string | null = null;
    let accessError: string | null = null;
    try {
      raw = this.storage().getItem(key);
      if (raw === null) this.lastReadable.delete(key);
      else this.lastReadable.set(key, raw);
    } catch {
      raw = this.lastReadable.get(key) ?? null;
      accessError = STORAGE_ERROR;
    }
    if (raw === null)
      return {
        request: null,
        error: accessError ?? this.storageErrors().get(key) ?? null,
        evidence: null,
      };
    // Una versione sconosciuta non si reinvia. Si estrae soltanto l'identità
    // esplicita di un JSON leggibile, mai indovinata con una regex sul testo rotto.
    let parsed: Partial<PendingCashRequest<K>> | null = null;
    try {
      parsed = JSON.parse(raw) as Partial<PendingCashRequest<K>> | null;
    } catch {
      /* testo conservato */
    }
    const id = parsed?.operation === operation ? parsed.payload?.creationIntentId : null;
    const intentId = typeof id === 'string' && uuidShape(id) ? id : null;
    const locationId =
      typeof parsed?.payload?.locationId === 'string' && uuidShape(parsed.payload.locationId)
        ? parsed.payload.locationId
        : null;
    const sessionId =
      typeof parsed?.payload?.sessionId === 'string' && uuidShape(parsed.payload.sessionId)
        ? parsed.payload.sessionId
        : null;
    const evidence = {
      key,
      raw,
      intentId,
      locationId,
      sessionId,
      compatible:
        parsed?.version === 1 &&
        parsed.operation === operation &&
        !!intentId &&
        !!locationId &&
        !!sessionId,
    };
    if (accessError) return { request: null, error: accessError, evidence };
    try {
      const request = parsed as PendingCashRequest<K>;
      if (
        !request ||
        request.version !== 1 ||
        request.operation !== operation ||
        typeof request.description !== 'string' ||
        typeof request.payload?.creationIntentId !== 'string' ||
        !request.payload.creationIntentId ||
        typeof request.payload.locationId !== 'string' ||
        !request.payload.locationId ||
        typeof request.payload.sessionId !== 'string' ||
        !request.payload.sessionId ||
        !Array.isArray(request.payload.lines) ||
        (operation === 'checkout'
          ? !Array.isArray((request.payload as CashCheckoutPayload).payments)
          : !Array.isArray((request.payload as CashReturnPayload).refunds)) ||
        !readableContent(operation, request.payload)
      ) {
        throw new Error('invalid');
      }
      return { request, error: this.storageErrors().get(key) ?? null, evidence };
    } catch {
      // Mai scartare silenziosamente un comando il cui esito potrebbe essere già registrato.
      return { request: null, error: UNREADABLE, evidence };
    }
  }
}

function uuidShape(value: string): boolean {
  return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}

/** Decodifica del comando locale v1, non calcolo/validazione economica parallela.
 * Il server resta responsabile dei vincoli di dominio; JSON.parse non prova
 * neppure che una riga o una quota abbiano i tipi del contratto conservato. */
function readableContent(operation: Operation, payload: Payloads[Operation]): boolean {
  if (operation === 'checkout') {
    const sale = payload as CashCheckoutPayload;
    return (
      sale.lines.every(
        (line) =>
          record(line) &&
          textValue(line['variantId']) &&
          finiteValue(line['quantity']) &&
          optionalNumber(line['unitPriceMinor']) &&
          optionalNumber(line['discountPercent']) &&
          (line['description'] === undefined || typeof line['description'] === 'string') &&
          (line['vatCodeId'] == null || textValue(line['vatCodeId'])),
      ) &&
      sale.payments.every(
        (payment) =>
          record(payment) &&
          textValue(payment['paymentOptionId']) &&
          finiteValue(payment['amountMinor']) &&
          (payment['tenderedMinor'] == null || finiteValue(payment['tenderedMinor'])) &&
          (payment['confirmed'] === undefined || typeof payment['confirmed'] === 'boolean'),
      )
    );
  }
  const returned = payload as CashReturnPayload;
  return (
    textValue(returned.originalDocumentId) &&
    typeof returned.reason === 'string' &&
    returned.lines.every(
      (line) => record(line) && textValue(line['originalLineId']) && finiteValue(line['quantity']),
    ) &&
    returned.refunds.every(
      (refund) =>
        record(refund) &&
        textValue(refund['originalPaymentId']) &&
        finiteValue(refund['amountMinor']) &&
        (refund['confirmed'] === undefined || typeof refund['confirmed'] === 'boolean'),
    )
  );
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function textValue(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0;
}
function finiteValue(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}
function optionalNumber(value: unknown): boolean {
  return value === undefined || finiteValue(value);
}
