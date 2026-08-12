import { DocumentType, UserRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  canManageDocumentType,
  canViewDocumentType,
  documentFamilyOf,
  intersectViewableDocumentTypes,
  viewableDocumentTypesFor,
} from './document-permission.util';

const clerk = (permissions: readonly string[]) => ({
  role: UserRole.clerk,
  permissions: [...permissions],
});

describe('document-permission.util', () => {
  it('ogni DocumentType ha una famiglia (nessun tipo orfano)', () => {
    for (const type of Object.values(DocumentType)) {
      expect(() => documentFamilyOf(type)).not.toThrow();
    }
  });

  it('la fattura accompagnatoria appartiene alla famiglia della fattura', () => {
    expect(documentFamilyOf(DocumentType.invoice_accompanying)).toBe('invoice');
    expect(documentFamilyOf(DocumentType.invoice_draft)).toBe('invoice');
  });

  it('canView segue la famiglia; «Gestisci» implica «Consulta»', () => {
    const user = clerk(['doc.invoice.manage']);
    expect(canViewDocumentType(user, DocumentType.invoice_draft)).toBe(true);
    expect(canViewDocumentType(user, DocumentType.invoice_accompanying)).toBe(true);
    expect(canViewDocumentType(user, DocumentType.sales_ddt)).toBe(false);
  });

  it('canManage richiede la chiave manage della famiglia', () => {
    const user = clerk(['doc.sales_ddt.view']);
    expect(canManageDocumentType(user, DocumentType.sales_ddt)).toBe(false);
    expect(canManageDocumentType(clerk(['doc.sales_ddt.manage']), DocumentType.sales_ddt)).toBe(
      true,
    );
  });

  it('il titolare non ha restrizioni', () => {
    const owner = { role: UserRole.owner, permissions: [] };
    expect(canManageDocumentType(owner, DocumentType.invoice_draft)).toBe(true);
    expect(viewableDocumentTypesFor(owner)).toBeNull();
  });

  it('viewableDocumentTypesFor espande le famiglie nei tipi', () => {
    const types = viewableDocumentTypesFor(clerk(['doc.store_sale.view']));
    expect(types).toEqual([DocumentType.store_sale, DocumentType.store_return]);
  });

  it('intersectViewableDocumentTypes interseca la richiesta con il consentito', () => {
    const user = clerk(['doc.sales_ddt.view', 'doc.quote.view']);
    expect(
      intersectViewableDocumentTypes(user, [DocumentType.sales_ddt, DocumentType.invoice_draft]),
    ).toEqual([DocumentType.sales_ddt]);
    expect(intersectViewableDocumentTypes(user, undefined)).toEqual([
      DocumentType.quote,
      DocumentType.sales_ddt,
    ]);
  });
});
