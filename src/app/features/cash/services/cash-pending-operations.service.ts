import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';

import { AuthService } from '@core/auth';
import { creationResultUncertain } from '@core/models/creation-intent-error.util';

import type { CashCheckoutPayload, CashReturnPayload } from '@domain/cash/models/cash.model';

interface Payloads {
  checkout: CashCheckoutPayload;
  returns: CashReturnPayload;
}
type Operation = keyof Payloads;
export interface PendingCashRequest<K extends Operation> {
  readonly version: 1;
  readonly operation: K;
  readonly description: string;
  readonly payload: Payloads[K];
}

const STORAGE_ERROR =
  'Non è possibile conservare l’invio in questo browser. Ripristina l’accesso ai dati della sessione prima di registrare.';

/** Conserva il comando prima del POST. Il registro intenti del server resta l'autorità. */
@Injectable({ providedIn: 'root' })
export class CashPendingOperationsService {
  private readonly auth = inject(AuthService);
  private readonly document = inject(DOCUMENT);
  private readonly revision = signal(0);
  private readonly storageError = signal<string | null>(null);

  watch<K extends Operation>(operation: K) {
    return computed(() => {
      this.revision();
      try {
        return { request: this.read(operation), error: this.storageError() };
      } catch (error) {
        return { request: null, error: error instanceof Error ? error.message : STORAGE_ERROR };
      }
    });
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
      this.storage().setItem(this.key(operation), JSON.stringify(request));
    } catch {
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
      this.storageError.set(null);
    } catch {
      this.storageError.set(STORAGE_ERROR);
    } finally {
      this.revision.update((value) => value + 1);
    }
  }

  private key(operation: Operation): string {
    const user = this.auth.currentUser();
    if (!user?.id || !user.tenantId) throw new Error('Accedi nuovamente prima di registrare.');
    return `vestiflow.cash.pending.v1:${user.tenantId}:${user.id}:${operation}`;
  }

  private storage(): Storage {
    const storage = this.document.defaultView?.sessionStorage;
    if (!storage) throw new Error(STORAGE_ERROR);
    return storage;
  }

  private read<K extends Operation>(operation: K): PendingCashRequest<K> | null {
    let raw: string | null;
    try {
      raw = this.storage().getItem(this.key(operation));
    } catch {
      throw new Error(STORAGE_ERROR);
    }
    if (raw === null) return null;
    try {
      const request = JSON.parse(raw) as PendingCashRequest<K>;
      if (
        request.version !== 1 ||
        request.operation !== operation ||
        typeof request.description !== 'string' ||
        !request.payload?.creationIntentId ||
        !request.payload.locationId ||
        !request.payload.sessionId ||
        !Array.isArray(request.payload.lines)
      ) {
        throw new Error('invalid');
      }
      return request;
    } catch {
      // Mai scartare silenziosamente un comando il cui esito potrebbe essere già registrato.
      throw new Error(
        'I dati dell’invio precedente non sono leggibili. Fai verificare l’operazione prima di registrarne un’altra.',
      );
    }
  }
}
