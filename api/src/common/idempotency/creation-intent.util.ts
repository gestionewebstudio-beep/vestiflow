import { createHash } from 'node:crypto';

import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

/**
 * Il registro degli intenti di creazione (T15): rende idempotenti i salvataggi
 * che creano un record con effetti irreversibili.
 *
 * ⛔ **Non conosce il dominio che protegge**, ed è la ragione per cui esiste
 * come pezzo comune invece che come colonna su una tabella. Il chiamante gli
 * dice tre cose — chi è (`tenantId`), che intento sta rivendicando, e che
 * richiesta sta eseguendo — e il registro risponde a una domanda sola:
 * **posso procedere, o questo lavoro è già stato fatto?**
 *
 * ── COME SI USA ────────────────────────────────────────────────────────────
 *
 * ```text
 * 1. fingerprintOf(payload)          fuori dalla transazione
 * 2. claimTx(tx, …)                  PRIMA scrittura della transazione
 * 3. …il lavoro e i suoi effetti…
 * 4. recordResultTx(tx, …)           l'ultima, col riferimento al record creato
 * 5. resolveConflict(...)            nel catch, FUORI dalla transazione morta
 * ```
 *
 * ⚠️ **Il claim deve essere la PRIMA scrittura**, non una qualunque: è ciò che
 * fa aspettare la seconda transazione sul vincolo unico *prima* che tocchi le
 * giacenze. Messo dopo, gli effetti sarebbero già stati applicati e il rollback
 * dovrebbe disfarli — che è la stessa disciplina «rivendica prima di produrre
 * effetti» applicata all'annullamento documenti.
 *
 * ── PERCHÉ IL P2002 SI CATTURA FUORI DALLA TRANSAZIONE ──────────────────────
 *
 * Uno statement fallito **aborta la transazione** in PostgreSQL: dentro non si
 * può più leggere niente. Il riconoscimento e la lettura dell'intento esistente
 * vivono quindi nel `catch`, col client root — la stessa forma dei sette
 * gestori del conflitto di numero.
 */
@Injectable()
export class CreationIntentService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Impronta stabile della richiesta.
   *
   * ⚠️ **Le chiavi si ordinano ricorsivamente**: `{a:1,b:2}` e `{b:2,a:1}` sono
   * la stessa richiesta, e un `JSON.stringify` nudo direbbe di no. Un'impronta
   * che dipende dall'ordine di serializzazione trasformerebbe un reinvio
   * identico in un «conflitto di impronta», cioè in un errore inventato.
   *
   * ⚠️ `undefined` sparisce, `null` resta: è la stessa distinzione che i DTO
   * fanno altrove (assente ≠ vuoto), e appiattirla qui renderebbe uguali due
   * richieste che il server tratta diversamente.
   */
  static fingerprintOf(payload: unknown): string {
    return createHash('sha256').update(stabile(payload)).digest('hex');
  }

  /**
   * Rivendica l'intento. **Prima scrittura della transazione.**
   *
   * Non ritorna niente: o passa, o lancia il P2002 che `resolveConflict`
   * interpreterà. Il silenzio è il caso normale.
   */
  async claimTx(
    tx: Prisma.TransactionClient,
    params: {
      readonly tenantId: string;
      readonly intentId: string;
      readonly scope: string;
      readonly fingerprint: string;
    },
  ): Promise<void> {
    await tx.creationIntent.create({
      data: {
        tenantId: params.tenantId,
        intentId: params.intentId,
        scope: params.scope,
        fingerprint: params.fingerprint,
      },
    });
  }

  /**
   * Registra il riferimento al record creato. **Ultima scrittura**, dentro la
   * stessa transazione: se il lavoro fallisce, il claim se ne va con lui.
   *
   * ⚠️ Il riferimento è **opaco**: qui è una stringa. Che sia l'id di un
   * documento, di un ordine o di una registrazione lo sa solo chi l'ha scritto,
   * ed è quello che rende questo registro riusabile senza sapere niente del
   * dominio.
   */
  async recordResultTx(
    tx: Prisma.TransactionClient,
    params: {
      readonly tenantId: string;
      readonly intentId: string;
      readonly resultRef: string;
    },
  ): Promise<void> {
    await tx.creationIntent.updateMany({
      where: { tenantId: params.tenantId, intentId: params.intentId },
      data: { resultRef: params.resultRef },
    });
  }

  /**
   * Interpreta un errore di rivendicazione. Da chiamare nel `catch`, **fuori**
   * dalla transazione.
   *
   * - `null` → non era un conflitto di intento: l'errore prosegue intatto.
   * - `{ replay: ref }` → **stesso intento, stessa impronta**: il lavoro è già
   *   stato fatto, e `ref` dice quale record ne è uscito. Il chiamante lo
   *   ricarica e risponde come al primo invio.
   * - lancia `ConflictException` → **stesso intento, impronta diversa**: due
   *   comandi diversi rivendicano la stessa identità. Non è un reinvio, è un
   *   errore del chiamante, e non si crea niente.
   *
   * ⚠️ `resultRef` può essere `null` anche su un'impronta uguale: significa che
   * la prima richiesta ha rivendicato e **non ha ancora finito**, oppure è
   * fallita dopo il claim in un modo che non ha fatto rollback. Non è un replay
   * riproducibile, ed è giusto che l'operatore lo sappia invece di ricevere una
   * risposta vuota travestita da successo.
   */
  async resolveConflict(params: {
    readonly error: unknown;
    readonly tenantId: string;
    readonly intentId: string;
    readonly fingerprint: string;
  }): Promise<{ readonly replay: string } | null> {
    if (!isCreationIntentConflict(params.error)) {
      return null;
    }
    const esistente = await this.prisma.creationIntent.findFirst({
      where: { tenantId: params.tenantId, intentId: params.intentId },
      select: { fingerprint: true, resultRef: true, scope: true },
    });
    if (!esistente) {
      // La riga è sparita fra il conflitto e questa lettura: la transazione che
      // l'aveva scritta ha fatto rollback. L'intento è di nuovo libero, e dirlo
      // è meglio che fingere un replay che non esiste.
      throw new ConflictException({
        code: 'creation_intent_vanished',
        message: 'La richiesta precedente non è andata a buon fine. Riprova.',
      });
    }
    if (esistente.fingerprint !== params.fingerprint) {
      throw new ConflictException({
        code: 'creation_intent_mismatch',
        message:
          'Questa richiesta riusa l’identificativo di un’operazione diversa già registrata. Ricarica la pagina e riprova.',
        scope: esistente.scope,
      });
    }
    if (!esistente.resultRef) {
      throw new ConflictException({
        code: 'creation_intent_in_progress',
        message: 'La stessa operazione è già in corso. Attendi qualche istante e ricarica.',
      });
    }
    return { replay: esistente.resultRef };
  }
}

/**
 * True se l'errore è la violazione del vincolo unico sull'intento.
 *
 * ⛔ Si riconosce dal MODELLO, come `isDocumentNumberConflict` — e per la stessa
 * ragione: i nomi delle colonne non sono affidabili quando l'indice cambia
 * forma. ⭐ E per la ragione opposta i due non si incontrano mai:
 * `CreationIntent` non è fra i `MODELLI_NUMERATI`, quindi un intento duplicato
 * non può essere scambiato per un numero già assegnato.
 */
export function isCreationIntentConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const candidate = error as { code?: unknown; meta?: { modelName?: unknown } };
  return candidate.code === 'P2002' && candidate.meta?.modelName === 'CreationIntent';
}

/** Serializzazione con le chiavi in ordine, ricorsiva. Vedi `fingerprintOf`. */
function stabile(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value ?? null);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(stabile).join(',') + ']';
  }
  const record = value as Record<string, unknown>;
  const chiavi = Object.keys(record)
    .filter((k) => record[k] !== undefined)
    .sort();
  return '{' + chiavi.map((k) => JSON.stringify(k) + ':' + stabile(record[k])).join(',') + '}';
}
