import { Injectable } from '@nestjs/common';

import { CorrispettiviService } from '../corrispettivi/corrispettivi.service';
import type { ListCorrispettiviQueryDto } from '../corrispettivi/dto/list-corrispettivi.query.dto';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildAccountantDocumentCountsQuery,
  mapAccountantDocumentCountsRow,
} from './accountant-register-document-counts.util';
import type { AccountantRegisterQueryDto } from './dto/accountant-register.query.dto';

export interface AccountantRegisterSummaryDto {
  readonly periodFrom: string | null;
  readonly periodTo: string | null;
  readonly documents: {
    readonly total: number;
    readonly invoiceDraftToIssue: number;
    readonly invoiceDraftSent: number;
    readonly invoiceDraftExternallyIssued: number;
    readonly invoiceDraftRegistered: number;
    readonly salesDdtPendingInvoice: number;
    readonly supplierDocsPending: number;
  };
  readonly corrispettivi: Awaited<ReturnType<CorrispettiviService['getSummary']>>;
}

@Injectable()
export class AccountantRegisterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly corrispettivi: CorrispettiviService,
  ) {}

  async getSummary(
    tenantId: string,
    query: AccountantRegisterQueryDto,
  ): Promise<AccountantRegisterSummaryDto> {
    const countsQuery = buildAccountantDocumentCountsQuery(tenantId, query);

    const [countsRows, corrispettiviSummary] = await Promise.all([
      this.prisma.$queryRaw<
        {
          total: number | bigint;
          invoice_draft_to_issue: number | bigint;
          invoice_draft_sent: number | bigint;
          invoice_draft_externally_issued: number | bigint;
          invoice_draft_registered: number | bigint;
          sales_ddt_pending_invoice: number | bigint;
          supplier_docs_pending: number | bigint;
        }[]
      >(countsQuery),
      this.corrispettivi.getSummary(tenantId, this.toCorrispettiviQuery(query)),
    ]);

    const counts = mapAccountantDocumentCountsRow(countsRows[0] ?? {
      total: 0,
      invoice_draft_to_issue: 0,
      invoice_draft_sent: 0,
      invoice_draft_externally_issued: 0,
      invoice_draft_registered: 0,
      sales_ddt_pending_invoice: 0,
      supplier_docs_pending: 0,
    });

    return {
      periodFrom: query.dateFrom ?? null,
      periodTo: query.dateTo ?? null,
      documents: {
        total: counts.total,
        invoiceDraftToIssue: counts.invoiceDraftToIssue,
        invoiceDraftSent: counts.invoiceDraftSent,
        invoiceDraftExternallyIssued: counts.invoiceDraftExternallyIssued,
        invoiceDraftRegistered: counts.invoiceDraftRegistered,
        salesDdtPendingInvoice: counts.salesDdtPendingInvoice,
        supplierDocsPending: counts.supplierDocsPending,
      },
      corrispettivi: corrispettiviSummary,
    };
  }

  private toCorrispettiviQuery(query: AccountantRegisterQueryDto): ListCorrispettiviQueryDto {
    return {
      page: 1,
      pageSize: 1,
      placedFrom: query.dateFrom,
      placedTo: query.dateTo,
      ...(query.channel === 'online' ? { onlineOnly: true } : {}),
      ...(query.channel === 'pos' ? { posOnly: true } : {}),
    };
  }
}
