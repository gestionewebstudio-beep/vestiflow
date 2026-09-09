import 'reflect-metadata';

import { describe, expect, it, vi } from 'vitest';

import { deleteTenantData } from './tenant-delete.util';

describe('deleteTenantData', () => {
  it('elimina entita tenant in ordine sicuro', async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const deleteOne = vi.fn().mockResolvedValue({});
    const eseguiGrezzo = vi.fn().mockResolvedValue(1);
    const tx = new Proxy(
      {},
      {
        get: (_target, model) => {
          // ⚠️ `$executeRawUnsafe` e` una FUNZIONE, non un delegate: la
          //    cancellazione accende con quella il permesso di riga. Un Proxy
          //    che restituisce un oggetto anche per i metodi grezzi fallisce
          //    dicendo un'altra cosa.
          if (typeof model === 'string' && model.startsWith('$')) return eseguiGrezzo;
          return {
          findMany: vi.fn().mockResolvedValue([]),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          deleteMany:
            model === 'paymentMethodCode' || model === 'vatNature'
              ? vi.fn(() => {
                  throw new Error('Global catalog touched');
                })
              : deleteMany,
            delete: deleteOne,
          };
        },
      },
    );

    await deleteTenantData(tx as never, 'tenant-1');

    expect(deleteMany).toHaveBeenCalled();
    expect(deleteMany).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1' } });
    expect(deleteOne).toHaveBeenCalledWith({ where: { id: 'tenant-1' } });
    // ⭐ Il permesso si accende PER QUEL TENANT, e in forma LOCALE: sono le due
    //    proprieta` che lo rendono un'eccezione e non un interruttore.
    expect(eseguiGrezzo).toHaveBeenCalledWith(
      expect.stringContaining('set_config'),
      'vestiflow.cancellazione_tenant',
      'tenant-1',
    );
    expect(eseguiGrezzo.mock.calls[0]![0]).toContain('true');
  });
});
