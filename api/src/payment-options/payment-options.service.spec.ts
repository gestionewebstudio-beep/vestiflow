import {
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import { SDI_PAYMENT_METHODS } from './payment-option-seed.data';
import { PaymentOptionsService } from './payment-options.service';

const tenantId = 'tenant-1';

/** Il catalogo globale come lo restituisce il database: codice + id. */
const CATALOGO = SDI_PAYMENT_METHODS.map((entry) => ({
  id: `id-${entry.code}`,
  code: entry.code,
  label: entry.name,
  isActive: true,
}));

function creaPrismaMock() {
  return {
    paymentOption: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi
        .fn()
        .mockImplementation(({ data }: { data: unknown }) => ({ id: 'po-1', ...(data as object) })),
      delete: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
      aggregate: vi.fn().mockResolvedValue({ _max: { sortOrder: 0 } }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    paymentMethodCode: {
      findMany: vi.fn().mockResolvedValue(CATALOGO),
      findUnique: vi.fn().mockResolvedValue(null),
    },
  };
}

/**
 * ⛔ Ciò che questi test falsificano: un seed che crea le voci normative
 *    SCOLLEGATE. La migration collega le righe presenti quando viene
 *    applicata; un tenant nato dopo non passa di lì, e senza il collegamento
 *    nel seed nascerebbe con ventitré voci mute.
 */
describe('PaymentOptionsService — modalità normative (C2A)', () => {
  let prisma: ReturnType<typeof creaPrismaMock>;
  let service: PaymentOptionsService;

  beforeEach(() => {
    prisma = creaPrismaMock();
    service = new PaymentOptionsService(prisma as unknown as PrismaService);
  });

  describe('seed di un tenant nuovo', () => {
    it('crea le 23 voci normative GIÀ COLLEGATE al catalogo', async () => {
      prisma.paymentOption.count.mockResolvedValue(0);

      await service.list(tenantId);

      const creati = prisma.paymentOption.createMany.mock.calls[0]?.[0]?.data as {
        kind: string;
        name: string;
        methodCodeId: string | null;
      }[];
      const method = creati.filter((v) => v.kind === 'method');
      expect(method).toHaveLength(23);
      expect(method.every((v) => v.methodCodeId !== null)).toBe(true);
      expect(method.find((v) => v.name === 'Bonifico (MP05)')?.methodCodeId).toBe('id-MP05');
    });

    it('lascia le condizioni di pagamento senza modalità', async () => {
      prisma.paymentOption.count.mockResolvedValue(0);

      await service.list(tenantId);

      const creati = prisma.paymentOption.createMany.mock.calls[0]?.[0]?.data as {
        kind: string;
        methodCodeId: string | null;
      }[];
      const terms = creati.filter((v) => v.kind === 'terms');
      expect(terms).toHaveLength(7);
      expect(terms.every((v) => v.methodCodeId === null)).toBe(true);
    });

    /**
     * ⛔ Il catalogo è una DIPENDENZA, non un di più.
     *
     * Prima il seed proseguiva creando voci scollegate: corrette in
     * apparenza, mute per il mapper fiscale, e il disallineamento fra
     * migration e applicazione restava invisibile finché qualcuno non
     * provava a emettere un documento commerciale.
     */
    it('con catalogo VUOTO fallisce e non scrive nulla', async () => {
      prisma.paymentOption.count.mockResolvedValue(0);
      prisma.paymentMethodCode.findMany.mockResolvedValue([]);

      await expect(service.list(tenantId)).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(prisma.paymentOption.createMany).not.toHaveBeenCalled();
    });

    it('con catalogo PARZIALE fallisce e non scrive nulla', async () => {
      prisma.paymentOption.count.mockResolvedValue(0);
      // Manca MP23: uno solo basta a fermare tutto.
      prisma.paymentMethodCode.findMany.mockResolvedValue(
        CATALOGO.filter((c) => c.code !== 'MP23'),
      );

      await expect(service.list(tenantId)).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(prisma.paymentOption.createMany).not.toHaveBeenCalled();
    });

    it('l_errore nomina i codici mancanti, non dice solo «errore»', async () => {
      prisma.paymentOption.count.mockResolvedValue(0);
      prisma.paymentMethodCode.findMany.mockResolvedValue(
        CATALOGO.filter((c) => c.code !== 'MP05' && c.code !== 'MP12'),
      );

      await expect(service.list(tenantId)).rejects.toThrow(/MP05, MP12/);
    });

    it('con catalogo COMPLETO crea 23 method collegati e 7 terms nulli', async () => {
      prisma.paymentOption.count.mockResolvedValue(0);

      await service.list(tenantId);

      const creati = prisma.paymentOption.createMany.mock.calls[0]?.[0]?.data as {
        kind: string;
        methodCodeId: string | null;
      }[];
      expect(creati.filter((v) => v.kind === 'method' && v.methodCodeId !== null)).toHaveLength(23);
      expect(creati.filter((v) => v.kind === 'terms' && v.methodCodeId === null)).toHaveLength(7);
    });

    it('anche il top-up si ferma se il catalogo è incompleto', async () => {
      prisma.paymentOption.count.mockResolvedValue(30);
      prisma.paymentMethodCode.findMany.mockResolvedValue([]);

      await expect(service.list(tenantId)).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(prisma.paymentOption.createMany).not.toHaveBeenCalled();
      expect(prisma.paymentOption.update).not.toHaveBeenCalled();
    });
  });

  describe('top-up di un tenant già inizializzato', () => {
    it('aggiunge solo le voci normative mancanti, collegate', async () => {
      prisma.paymentOption.count.mockResolvedValue(30);
      // Tutte presenti tranne MP23.
      prisma.paymentOption.findMany.mockResolvedValue(
        SDI_PAYMENT_METHODS.filter((e) => e.code !== 'MP23').map((e, i) => ({
          id: `esistente-${i}`,
          name: e.name,
          isSystem: true,
          methodCodeId: `id-${e.code}`,
        })),
      );

      await service.list(tenantId);

      const creati = prisma.paymentOption.createMany.mock.calls[0]?.[0]?.data as {
        name: string;
        methodCodeId: string | null;
      }[];
      expect(creati).toHaveLength(1);
      const [prima] = creati;
      expect(prima?.name).toBe('PagoPA (MP23)');
      expect(prima?.methodCodeId).toBe('id-MP23');
    });

    it('COLLEGA una voce di sistema già presente ma scollegata', async () => {
      prisma.paymentOption.count.mockResolvedValue(30);
      prisma.paymentOption.findMany.mockResolvedValue(
        SDI_PAYMENT_METHODS.map((e, i) => ({
          id: `esistente-${i}`,
          name: e.name,
          isSystem: true,
          // Solo MP05 è rimasta indietro.
          methodCodeId: e.code === 'MP05' ? null : `id-${e.code}`,
        })),
      );

      await service.list(tenantId);

      expect(prisma.paymentOption.update).toHaveBeenCalledTimes(1);
      expect(prisma.paymentOption.update).toHaveBeenCalledWith({
        where: { id: expect.any(String) },
        data: { methodCodeId: 'id-MP05' },
      });
    });

    it('NON tocca una voce personalizzata con lo stesso nome', async () => {
      prisma.paymentOption.count.mockResolvedValue(30);
      prisma.paymentOption.findMany.mockResolvedValue(
        SDI_PAYMENT_METHODS.map((e, i) => ({
          id: `esistente-${i}`,
          name: e.name,
          // Quella su MP05 è dell'utente: stesso nome, ma non è di sistema.
          isSystem: e.code !== 'MP05',
          methodCodeId: e.code === 'MP05' ? null : `id-${e.code}`,
        })),
      );

      await service.list(tenantId);

      expect(prisma.paymentOption.update).not.toHaveBeenCalled();
    });

    it('non collega per somiglianza: una voce rinominata resta scollegata', async () => {
      prisma.paymentOption.count.mockResolvedValue(30);
      prisma.paymentOption.findMany.mockResolvedValue([
        {
          id: 'rinominata',
          name: 'Bonifico (MP05) - ns. banca',
          isSystem: true,
          methodCodeId: null,
        },
      ]);

      await service.list(tenantId);

      expect(prisma.paymentOption.update).not.toHaveBeenCalled();
    });
  });

  describe('assegnazione manuale della modalità', () => {
    const tipo = { id: 'po-1', tenantId, kind: 'method', name: 'Bonifico 60 gg' };
    const condizione = { id: 'po-2', tenantId, kind: 'terms', name: '60 gg f.m.' };

    it('rifiuta un codice inesistente', async () => {
      prisma.paymentOption.findFirst.mockResolvedValue(tipo);
      prisma.paymentMethodCode.findUnique.mockResolvedValue(null);

      await expect(
        service.update(tenantId, 'po-1', { methodCodeId: 'inesistente' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rifiuta un codice DISATTIVATO per una nuova associazione', async () => {
      prisma.paymentOption.findFirst.mockResolvedValue(tipo);
      prisma.paymentMethodCode.findUnique.mockResolvedValue({
        id: 'id-MP09',
        code: 'MP09',
        label: 'RID',
        isActive: false,
      });

      await expect(
        service.update(tenantId, 'po-1', { methodCodeId: 'id-MP09' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('rifiuta di associare una modalità a una CONDIZIONE di pagamento', async () => {
      prisma.paymentOption.findFirst.mockResolvedValue(condizione);
      prisma.paymentMethodCode.findUnique.mockResolvedValue({
        id: 'id-MP01',
        code: 'MP01',
        isActive: true,
      });

      await expect(
        service.update(tenantId, 'po-2', { methodCodeId: 'id-MP01' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('ammette null per scollegare, senza interrogare il catalogo', async () => {
      prisma.paymentOption.findFirst.mockResolvedValue(tipo);

      await service.update(tenantId, 'po-1', { methodCodeId: null });

      expect(prisma.paymentMethodCode.findUnique).not.toHaveBeenCalled();
      expect(prisma.paymentOption.update).toHaveBeenCalledWith({
        where: { id: 'po-1' },
        data: { methodCodeId: null },
      });
    });

    it('associa un codice attivo a un Tipo di pagamento', async () => {
      prisma.paymentOption.findFirst.mockResolvedValue(tipo);
      prisma.paymentMethodCode.findUnique.mockResolvedValue({
        id: 'id-MP05',
        code: 'MP05',
        isActive: true,
      });

      await service.update(tenantId, 'po-1', { methodCodeId: 'id-MP05' });

      expect(prisma.paymentOption.update).toHaveBeenCalledWith({
        where: { id: 'po-1' },
        data: { methodCodeId: 'id-MP05' },
      });
    });

    it('non tocca la modalità quando il campo non arriva', async () => {
      prisma.paymentOption.findFirst.mockResolvedValue(tipo);

      await service.update(tenantId, 'po-1', { isActive: false });

      expect(prisma.paymentOption.update).toHaveBeenCalledWith({
        where: { id: 'po-1' },
        data: { isActive: false },
      });
    });
  });

  it('il catalogo espone solo le modalità attive, in ordine', async () => {
    await service.listMethodCodes();

    expect(prisma.paymentMethodCode.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  });
});
