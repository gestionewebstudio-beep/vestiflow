import { DocumentType, UserRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { DOCUMENT_PERMISSION_FAMILIES } from './tenant-permission.constants';
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

/**
 * Chiavi che stanno in `DocumentType` SOLO per chiedere un numero al motore
 * comune, e che documento non sono: vivono in tabella propria e non avranno mai
 * una riga in `documents`. Elenco gemello di quello in
 * `scripts/check-permissions.mjs`, tenuto a mano nei due posti apposta — se
 * fosse derivato dal file sotto test, una dimenticanza resterebbe invisibile.
 */
const CHIAVI_SOLO_NUMERATORE: readonly DocumentType[] = [DocumentType.manual_receipt];

describe('document-permission.util', () => {
  it('ogni DocumentType documentale ha una famiglia (nessun tipo orfano)', () => {
    const documentali = Object.values(DocumentType).filter(
      (type) => !CHIAVI_SOLO_NUMERATORE.includes(type),
    );
    for (const type of documentali) {
      expect(() => documentFamilyOf(type)).not.toThrow();
    }
  });

  // Il verso opposto, ed è il più importante dei due: su una chiave di solo
  // numeratore la funzione DEVE tirare. Dargli una famiglia di comodo legherebbe
  // una registrazione che documento non è al permesso di un documento con cui
  // non c'entra, e nessuno se ne accorgerebbe finché qualcuno non vede ciò che
  // non deve. Se una di queste chiavi arriva ai permessi documentali è un
  // difetto, e va scoperto rumorosamente.
  it('una chiave di solo numeratore NON ha famiglia, e fallisce rumorosamente', () => {
    for (const type of CHIAVI_SOLO_NUMERATORE) {
      expect(() => documentFamilyOf(type)).toThrow(/senza famiglia permessi/);
    }
  });

  // Il verso pratico: sulle rotte che ricevono il tipo COME PARAMETRO dal
  // client, un tipo senza famiglia deve dare un DINIEGO, non un 500. Prima
  // `canViewDocumentType` passava da `documentFamilyOf` e tirava: bastava
  // `?type=manual_receipt` per far esplodere l'anteprima numero.
  it('un tipo senza famiglia è negato a chiunque, e non fa esplodere la rotta', () => {
    for (const type of CHIAVI_SOLO_NUMERATORE) {
      expect(() => canViewDocumentType(clerk([]), type)).not.toThrow();
      expect(canViewDocumentType(clerk([]), type)).toBe(false);
      expect(canManageDocumentType(clerk([]), type)).toBe(false);
      // Nemmeno con TUTTI i permessi documento: non è un documento.
      const tuttiIDocumenti = clerk(
        DOCUMENT_PERMISSION_FAMILIES.flatMap((f) => [`doc.${f}.view`, `doc.${f}.manage`]),
      );
      expect(canViewDocumentType(tuttiIDocumenti, type)).toBe(false);
    }
  });

  it('la fattura accompagnatoria appartiene alla famiglia della fattura', () => {
    expect(documentFamilyOf(DocumentType.invoice_accompanying)).toBe('invoice');
    expect(documentFamilyOf(DocumentType.invoice)).toBe('invoice');
  });

  it('canView segue la famiglia; «Gestisci» implica «Consulta»', () => {
    const user = clerk(['doc.invoice.manage']);
    expect(canViewDocumentType(user, DocumentType.invoice)).toBe(true);
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
    expect(canManageDocumentType(owner, DocumentType.invoice)).toBe(true);
    expect(viewableDocumentTypesFor(owner)).toBeNull();
  });

  it('viewableDocumentTypesFor espande le famiglie nei tipi', () => {
    const types = viewableDocumentTypesFor(clerk(['doc.store_sale.view']));
    expect(types).toEqual([DocumentType.store_sale, DocumentType.store_return]);
  });

  it('intersectViewableDocumentTypes interseca la richiesta con il consentito', () => {
    const user = clerk(['doc.sales_ddt.view', 'doc.quote.view']);
    expect(
      intersectViewableDocumentTypes(user, [DocumentType.sales_ddt, DocumentType.invoice]),
    ).toEqual([DocumentType.sales_ddt]);
    expect(intersectViewableDocumentTypes(user, undefined)).toEqual([
      DocumentType.quote,
      DocumentType.sales_ddt,
    ]);
  });
});
