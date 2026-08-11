import { DocumentType } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { buildDocumentNumberConflict, isDocumentNumberConflict } from './document-numbering.util';

/** Tx finto: dell'intera numerazione qui serve solo il massimo della serie. */
function fakeTx(maxNumber: number | null): Prisma.TransactionClient {
  return {
    document: { aggregate: vi.fn().mockResolvedValue({ _max: { number: maxNumber } }) },
  } as unknown as Prisma.TransactionClient;
}

function conflictFor(options: {
  readonly maxNumber: number | null;
  readonly requestedNumber?: number | null;
  readonly series?: string | null;
}) {
  return buildDocumentNumberConflict({
    tx: fakeTx(options.maxNumber),
    tenantId: 'tenant-1',
    type: DocumentType.goods_receipt,
    // `??` non va: `null` è un valore VOLUTO (la serie vuota) e verrebbe
    // scambiato per «non passato», facendo passare il test sulla serie 'A'.
    series: 'series' in options ? (options.series ?? null) : 'A',
    source: 'document',
    prefix: 'AM',
    requestedNumber: options.requestedNumber,
  });
}

describe('buildDocumentNumberConflict', () => {
  /**
   * Il difetto che questi test bloccano: il payload dichiarava sempre
   * `nextAvailable - 1`, cioè l'ultimo numero occupato della serie. Da quando
   * la maschera non rimanda più indietro la propria proposta, questo conflitto
   * si raggiunge SOLO digitando un numero a mano — e in quel caso i due numeri
   * non coincidono affatto.
   *
   * Serie fino a 43, il 7 è un buco: l'operatore digita 7 per tapparlo, un
   * collega lo prende un istante prima. Il conflitto deve parlare del 7.
   */
  it('riporta il numero richiesto, non l’ultimo occupato della serie', async () => {
    const conflict = await conflictFor({ maxNumber: 43, requestedNumber: 7 });

    expect(conflict.number).toBe(7);
    expect(conflict.nextAvailable).toBe(44);
    expect(conflict.code).toBe('document_number_taken');
    expect(conflict.series).toBe('A');
  });

  it('il numero richiesto non sposta il primo libero della serie', async () => {
    const conflict = await conflictFor({ maxNumber: 43, requestedNumber: 200 });

    expect(conflict.number).toBe(200);
    expect(conflict.nextAvailable).toBe(44);
  });

  /**
   * Numero assegnato d'ufficio (nessuna richiesta): il server aveva preso
   * «massimo + 1», qualcuno l'ha bruciato, quindi ora quel numero È il massimo.
   * Qui `nextAvailable - 1` è la risposta giusta, e resta il fallback.
   */
  it('senza numero richiesto ripiega sull’ultimo occupato', async () => {
    const conflict = await conflictFor({ maxNumber: 43, requestedNumber: null });

    expect(conflict.number).toBe(43);
    expect(conflict.nextAvailable).toBe(44);
  });

  it('numero richiesto assente o non valido: stesso ripiego', async () => {
    await expect(conflictFor({ maxNumber: 43 })).resolves.toMatchObject({ number: 43 });
    await expect(conflictFor({ maxNumber: 43, requestedNumber: 0 })).resolves.toMatchObject({
      number: 43,
    });
  });

  it('serie vuota: il payload la riporta come null', async () => {
    const conflict = await conflictFor({ maxNumber: 6, requestedNumber: 3, series: null });

    expect(conflict.series).toBeNull();
    expect(conflict.number).toBe(3);
    expect(conflict.nextAvailable).toBe(7);
  });

  it('serie senza documenti: il primo libero è 1', async () => {
    const conflict = await conflictFor({ maxNumber: null, requestedNumber: 5 });

    expect(conflict.number).toBe(5);
    expect(conflict.nextAvailable).toBe(1);
  });
});

describe('isDocumentNumberConflict', () => {
  it('riconosce la violazione del vincolo unico sul numero', () => {
    const error = { code: 'P2002', meta: { target: ['tenantId', 'type', 'series', 'number'] } };

    expect(isDocumentNumberConflict(error)).toBe(true);
  });

  it('ignora gli altri vincoli e gli altri errori', () => {
    expect(isDocumentNumberConflict({ code: 'P2002', meta: { target: ['sku'] } })).toBe(false);
    expect(isDocumentNumberConflict({ code: 'P2025' })).toBe(false);
    expect(isDocumentNumberConflict(null)).toBe(false);
    expect(isDocumentNumberConflict('boom')).toBe(false);
  });
});
