import { describe, expect, it } from 'vitest';

import { mapAccountantDocumentCountsRow } from './accountant-register-document-counts.util';

describe('accountant-register-document-counts.util', () => {
  it('mapAccountantDocumentCountsRow converte bigint in number', () => {
    expect(
      mapAccountantDocumentCountsRow({
        total: 10n,
        invoice_draft_to_issue: 1n,
        invoice_draft_sent: 2n,
        invoice_draft_externally_issued: 0n,
        invoice_draft_registered: 1n,
        sales_ddt_pending_invoice: 3n,
        supplier_docs_pending: 2n,
      }),
    ).toEqual({
      total: 10,
      invoiceDraftToIssue: 1,
      invoiceDraftSent: 2,
      invoiceDraftExternallyIssued: 0,
      invoiceDraftRegistered: 1,
      salesDdtPendingInvoice: 3,
      supplierDocsPending: 2,
    });
  });
});
