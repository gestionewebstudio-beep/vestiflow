import { describe, expect, it, vi } from 'vitest';

import { persistDocumentLinesByIdTx } from './document-line-upsert.util';

const tenantId = 'tenant-1';
const documentId = 'doc-1';

function createTxMock() {
  return {
    documentLine: {
      create: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn(),
    },
  };
}

interface TestLine {
  readonly id?: string | null;
  readonly quantity: number;
}

function run(
  tx: ReturnType<typeof createTxMock>,
  existingLineIds: readonly string[],
  lines: readonly TestLine[],
) {
  return persistDocumentLinesByIdTx(tx as never, {
    tenantId,
    documentId,
    existingLineIds,
    lines,
    toData: (line) => ({ quantity: line.quantity }),
  });
}

describe('persistDocumentLinesByIdTx', () => {
  it('1 · riga con id noto: update in posto, mai una create', async () => {
    const tx = createTxMock();

    await run(tx, ['line-1'], [{ id: 'line-1', quantity: 2 }]);

    expect(tx.documentLine.create).not.toHaveBeenCalled();
    const update = tx.documentLine.updateMany.mock.calls[0]![0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    // Il `where` porta anche documento e tenant: l'appartenenza la impone il
    // database, non solo il controllo applicativo.
    expect(update.where).toEqual({ id: 'line-1', documentId, tenantId });
    expect(update.data).toEqual({ quantity: 2 });
  });

  it('2 · riga senza id: create con tenant e documento', async () => {
    const tx = createTxMock();

    await run(tx, [], [{ quantity: 3 }]);

    expect(tx.documentLine.updateMany).not.toHaveBeenCalled();
    const created = tx.documentLine.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(created.data).toEqual({ quantity: 3, tenantId, documentId });
  });

  it('3 · riga sparita: si elimina solo quella, e con la guardia di tenant', async () => {
    const tx = createTxMock();

    await run(tx, ['line-1', 'line-2'], [{ id: 'line-1', quantity: 1 }]);

    const removed = tx.documentLine.deleteMany.mock.calls[0]![0] as {
      where: { id: { in: string[] }; documentId: string; tenantId: string };
    };
    expect(removed.where.id.in).toEqual(['line-2']);
    expect(removed.where.tenantId).toBe(tenantId);
  });

  it('4 · due righe dello stesso articolo restano DUE: l’identità è la riga', async () => {
    const tx = createTxMock();

    await run(
      tx,
      ['line-1', 'line-2'],
      [
        { id: 'line-1', quantity: 1 },
        { id: 'line-2', quantity: 2 },
      ],
    );

    expect(tx.documentLine.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.documentLine.deleteMany).not.toHaveBeenCalled();
  });

  it('5 · id che non appartiene al documento: 422, mai una creazione silenziosa', async () => {
    const tx = createTxMock();

    await expect(run(tx, ['line-1'], [{ id: 'line-altrui', quantity: 1 }])).rejects.toThrow(
      /non appartiene a questo documento/,
    );
    expect(tx.documentLine.create).not.toHaveBeenCalled();
    expect(tx.documentLine.updateMany).not.toHaveBeenCalled();
    expect(tx.documentLine.deleteMany).not.toHaveBeenCalled();
  });

  it('6 · stessa riga inviata due volte nello stesso salvataggio: 422', async () => {
    const tx = createTxMock();

    await expect(
      run(tx, ['line-1'], [
        { id: 'line-1', quantity: 1 },
        { id: 'line-1', quantity: 5 },
      ]),
    ).rejects.toThrow(/due volte/);
  });

  it('7 · riga sparita sotto i piedi durante il salvataggio: 409, non si scrive altrove', async () => {
    const tx = createTxMock();
    tx.documentLine.updateMany.mockResolvedValue({ count: 0 });

    await expect(run(tx, ['line-1'], [{ id: 'line-1', quantity: 1 }])).rejects.toThrow(
      /modificata o eliminata da un altro salvataggio/,
    );
  });

  it('8 · nessuna riga inviata: tutte le esistenti diventano orfane e si eliminano', async () => {
    const tx = createTxMock();

    await run(tx, ['line-1', 'line-2'], []);

    const removed = tx.documentLine.deleteMany.mock.calls[0]![0] as {
      where: { id: { in: string[] } };
    };
    expect(removed.where.id.in).toEqual(['line-1', 'line-2']);
    expect(tx.documentLine.create).not.toHaveBeenCalled();
  });
});
