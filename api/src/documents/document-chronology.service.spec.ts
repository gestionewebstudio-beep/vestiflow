import { ForbiddenException } from '@nestjs/common';
import { DocumentType } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { testClerkUser, testOwnerUser } from '../test/fixtures/user-profile.fixture';
import { DocumentChronologyService } from './document-chronology.service';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Il controllo cronologico riceve il tipo documento come PARAMETRO, non lo
 * legge da un documento salvato: il gate di rotta («consulta almeno una
 * famiglia») non basta, perché è il client a scegliere il tipo.
 *
 * Senza questi test la guardia sopravvive per abitudine: la risposta nomina
 * numeri, date e riferimenti dei documenti fuori posto, e chi consulta i soli
 * Preventivi leggerebbe il registro fatture chiedendo `?type=invoice_draft`.
 */
describe('DocumentChronologyService — matrice permessi documenti', () => {
  const tenantId = 'tenant-1';

  let prisma: {
    $queryRaw: ReturnType<typeof vi.fn>;
    userDocumentChronologyWarningPreference: {
      findUnique: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
    };
  };
  let service: DocumentChronologyService;

  /** Utente con le sole famiglie indicate (nessun permesso di preset). */
  const clerkWith = (...permissions: string[]): UserProfileDto =>
    testClerkUser({ hasAllLocationsAccess: true, permissions });

  const checkInvoice = (user: UserProfileDto | undefined) =>
    service.check({
      tenantId,
      user,
      type: DocumentType.invoice_draft,
      series: null,
      number: 7,
      documentDate: new Date('2026-08-14'),
    });

  beforeEach(() => {
    prisma = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      userDocumentChronologyWarningPreference: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue(undefined),
      },
    };
    service = new DocumentChronologyService(prisma as unknown as PrismaService);
  });

  describe('check: il tipo chiesto dal client passa dalla famiglia permessi', () => {
    it('nega la famiglia che l’utente non consulta, senza interrogare il database', async () => {
      await expect(checkInvoice(clerkWith('doc.quote.view'))).rejects.toBeInstanceOf(
        ForbiddenException,
      );

      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(prisma.userDocumentChronologyWarningPreference.findUnique).not.toHaveBeenCalled();
    });

    it('consente la famiglia consultabile', async () => {
      await expect(checkInvoice(clerkWith('doc.invoice.view'))).resolves.toMatchObject({
        conflicts: [],
        dismissed: false,
      });

      expect(prisma.$queryRaw).toHaveBeenCalled();
    });

    it('«Gestisci» implica «Consulta»', async () => {
      await expect(checkInvoice(clerkWith('doc.invoice.manage'))).resolves.toBeDefined();
    });

    it('il titolare non ha restrizioni di tipo', async () => {
      await expect(checkInvoice(testOwnerUser())).resolves.toBeDefined();
    });

    it('chiamata interna senza utente: passa, come le altre guardie di famiglia', async () => {
      await expect(checkInvoice(undefined)).resolves.toBeDefined();
    });
  });

  describe('dismiss: spegnere l’avviso è un’operazione sul tipo', () => {
    it('nega la famiglia non consultabile e non scrive la preferenza', async () => {
      await expect(
        service.dismiss(tenantId, clerkWith('doc.quote.view'), DocumentType.invoice_draft),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(prisma.userDocumentChronologyWarningPreference.upsert).not.toHaveBeenCalled();
    });

    it('consente la famiglia consultabile e scrive per (tenant, utente, tipo)', async () => {
      const user = clerkWith('doc.invoice.view');
      await service.dismiss(tenantId, user, DocumentType.invoice_draft);

      expect(prisma.userDocumentChronologyWarningPreference.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: { tenantId, userId: user.id, documentType: DocumentType.invoice_draft },
        }),
      );
    });
  });
});
