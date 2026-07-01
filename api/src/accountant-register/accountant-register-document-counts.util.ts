import { DocumentStatus, DocumentType, Prisma } from '@prisma/client';

import { ACCOUNTANT_DOCUMENT_TYPES } from '../documents/accountant-document-types.constant';
import type { AccountantRegisterQueryDto } from './dto/accountant-register.query.dto';

export interface AccountantDocumentCountsRow {
  readonly total: number;
  readonly invoiceDraftToIssue: number;
  readonly invoiceDraftSent: number;
  readonly invoiceDraftExternallyIssued: number;
  readonly invoiceDraftRegistered: number;
  readonly salesDdtPendingInvoice: number;
  readonly supplierDocsPending: number;
}

type CountQueryRow = {
  readonly total: number | bigint;
  readonly invoice_draft_to_issue: number | bigint;
  readonly invoice_draft_sent: number | bigint;
  readonly invoice_draft_externally_issued: number | bigint;
  readonly invoice_draft_registered: number | bigint;
  readonly sales_ddt_pending_invoice: number | bigint;
  readonly supplier_docs_pending: number | bigint;
};

const SUPPLIER_PENDING_TYPES = [
  DocumentType.goods_receipt,
  DocumentType.supplier_ddt,
  DocumentType.supplier_invoice_accompanying,
] as const;

const SALES_DDT_ACTIVE_STATUSES = [
  DocumentStatus.confirmed,
  DocumentStatus.printed,
  DocumentStatus.sent,
] as const;

/** Una sola query aggregata per i conteggi documenti del registro commercialista. */
export function buildAccountantDocumentCountsQuery(
  tenantId: string,
  query: AccountantRegisterQueryDto,
): Prisma.Sql {
  const accountantTypes = Prisma.join(
    ACCOUNTANT_DOCUMENT_TYPES.map((type) => Prisma.sql`${type}::"DocumentType"`),
  );
  const salesDdtStatuses = Prisma.join(
    SALES_DDT_ACTIVE_STATUSES.map((status) => Prisma.sql`${status}::"DocumentStatus"`),
  );
  const supplierPendingTypes = Prisma.join(
    SUPPLIER_PENDING_TYPES.map((type) => Prisma.sql`${type}::"DocumentType"`),
  );
  const supplierPendingStatuses = Prisma.join(
    SALES_DDT_ACTIVE_STATUSES.map((status) => Prisma.sql`${status}::"DocumentStatus"`),
  );

  const dateFromFilter = query.dateFrom
    ? Prisma.sql`AND d.document_date >= ${new Date(query.dateFrom)}`
    : Prisma.empty;
  const dateToFilter = query.dateTo
    ? Prisma.sql`AND d.document_date <= ${new Date(query.dateTo)}`
    : Prisma.empty;

  return Prisma.sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (
        WHERE d.type = ${DocumentType.invoice_draft}::"DocumentType"
          AND d.status = ${DocumentStatus.confirmed}::"DocumentStatus"
          AND d.externally_issued_at IS NULL
      )::int AS invoice_draft_to_issue,
      COUNT(*) FILTER (
        WHERE d.type = ${DocumentType.invoice_draft}::"DocumentType"
          AND d.status = ${DocumentStatus.sent}::"DocumentStatus"
          AND d.externally_issued_at IS NULL
      )::int AS invoice_draft_sent,
      COUNT(*) FILTER (
        WHERE d.type = ${DocumentType.invoice_draft}::"DocumentType"
          AND d.status = ${DocumentStatus.sent}::"DocumentStatus"
          AND d.externally_issued_at IS NOT NULL
      )::int AS invoice_draft_externally_issued,
      COUNT(*) FILTER (
        WHERE d.type = ${DocumentType.invoice_draft}::"DocumentType"
          AND d.status = ${DocumentStatus.externally_registered}::"DocumentStatus"
      )::int AS invoice_draft_registered,
      COUNT(*) FILTER (
        WHERE d.type = ${DocumentType.sales_ddt}::"DocumentType"
          AND d.status IN (${salesDdtStatuses})
          AND NOT EXISTS (
            SELECT 1
            FROM documents child
            WHERE child.source_document_id = d.id
              AND child.type = ${DocumentType.invoice_draft}::"DocumentType"
              AND child.status <> ${DocumentStatus.cancelled}::"DocumentStatus"
          )
      )::int AS sales_ddt_pending_invoice,
      COUNT(*) FILTER (
        WHERE d.type IN (${supplierPendingTypes})
          AND d.status IN (${supplierPendingStatuses})
          AND d.external_doc_number IS NULL
      )::int AS supplier_docs_pending
    FROM documents d
    WHERE d.tenant_id = ${tenantId}::uuid
      AND d.type IN (${accountantTypes})
      AND d.status <> ${DocumentStatus.cancelled}::"DocumentStatus"
      ${dateFromFilter}
      ${dateToFilter}
  `;
}

export function mapAccountantDocumentCountsRow(row: CountQueryRow): AccountantDocumentCountsRow {
  return {
    total: Number(row.total),
    invoiceDraftToIssue: Number(row.invoice_draft_to_issue),
    invoiceDraftSent: Number(row.invoice_draft_sent),
    invoiceDraftExternallyIssued: Number(row.invoice_draft_externally_issued),
    invoiceDraftRegistered: Number(row.invoice_draft_registered),
    salesDdtPendingInvoice: Number(row.sales_ddt_pending_invoice),
    supplierDocsPending: Number(row.supplier_docs_pending),
  };
}
