import { isManualUnloadEnabled } from './tenant-permissions.util';
import { DocumentType } from '@core/models/document.model';
import {
  DOCUMENT_PERMISSION_FAMILIES,
  docManagePermission,
  docViewPermission,
  type DocumentPermissionFamily,
} from '@core/models/tenant-permission.model';
import type { User } from '@core/models/user.model';

import { hasFullTenantAccess, hasTenantPermission } from './user-permissions.util';

/**
 * Mappa tipo documento → famiglia della matrice permessi. SPECCHIO di
 * `api/src/auth/document-permission.util.ts`: se le due divergono, la UI
 * mostra un'azione che l'API poi rifiuta. `check:permissions` in `npm run lint`
 * confronta le due mappe a ogni build.
 */
const FAMILY_TO_TYPES: Readonly<Record<DocumentPermissionFamily, readonly string[]>> = {
  goods_receipt: [DocumentType.GoodsReceipt],
  purchase_invoice: [DocumentType.SupplierInvoice],
  supplier_order: [DocumentType.SupplierOrder],
  sales_order: [DocumentType.CustomerOrder],
  quote: [DocumentType.Quote],
  proforma: [DocumentType.Proforma],
  sales_ddt: [DocumentType.SalesDdt],
  // I tre tipi della famiglia condividono UNA sola famiglia di permessi: chi
  // gestisce le fatture gestisce anche le note di credito. Specchio della
  // mappa API (`api/src/auth/document-permission.util.ts`).
  invoice: [DocumentType.Invoice, DocumentType.InvoiceAccompanying, DocumentType.CreditNote],
  store_sale: [DocumentType.StoreSale, DocumentType.StoreReturn],
  // Documento interno generato dall'evasione online: esiste nell'enum API ma
  // non nel modello frontend, che non lo crea mai — qui serve solo a mappare
  // la famiglia di un tipo che arriva dal server.
  //
  // ⚠️ `corrispettivo` stava qui accanto: ritirato il 17/08/2026, resta solo
  // come valore morto nell'enum PostgreSQL. Un tipo senza famiglia è negato
  // a chiunque, che è la risposta giusta se una riga vecchia lo nominasse.
  online_sale: ['online_sale'],
  transfer: [DocumentType.Transfer],
  adjustment: [
    DocumentType.Adjustment,
    DocumentType.ManualLoad,
    DocumentType.InitialLoad,
    DocumentType.Inventory,
  ],
  manual_unload: [DocumentType.ManualUnload],
};

const TYPE_TO_FAMILY = new Map<string, DocumentPermissionFamily>(
  DOCUMENT_PERMISSION_FAMILIES.flatMap((family) =>
    FAMILY_TO_TYPES[family].map((type) => [type, family] as const),
  ),
);

/** Famiglia del tipo, o `null` se il tipo non è mappato (mai, in teoria). */
export function documentFamilyOf(type: string | null | undefined): DocumentPermissionFamily | null {
  return type ? (TYPE_TO_FAMILY.get(type) ?? null) : null;
}

export function documentTypesOfFamily(family: DocumentPermissionFamily): readonly string[] {
  return FAMILY_TO_TYPES[family];
}

/** «Gestisci» implica «Consulta»: la stessa regola dell'API. */
export function canViewDocumentType(
  user: User | null | undefined,
  type: string | null | undefined,
): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  const family = documentFamilyOf(type);
  if (!family) {
    return false;
  }
  return (
    hasTenantPermission(user, docViewPermission(family)) ||
    hasTenantPermission(user, docManagePermission(family))
  );
}

export function canManageDocumentType(
  user: User | null | undefined,
  type: string | null | undefined,
): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  const family = documentFamilyOf(type);
  return family ? hasTenantPermission(user, docManagePermission(family)) : false;
}

/**
 * ⛔ **Se questo utente può CREARE un documento di questo tipo.**
 *
 * Non è un sinonimo di `canManageDocumentType`, e la differenza è tutta nella
 * Vendita manuale: il permesso dice se la persona può, l’interruttore aziendale
 * dice se l’azienda **usa** quella funzione. Sono due assi, e servono entrambi.
 *
 * ⚠️ **Gestire non è creare.** Chi ha il permesso continua a consultare,
 * stampare ed eliminare i documenti storici anche a funzione spenta: quello
 * resta governato da `canManageDocumentType`, che qui non si tocca.
 *
 * ⭐ Esiste perché le porte di creazione sono SEI, e una condizione scritta sei
 * volte comincia a divergere subito dopo.
 */
export function canCreateDocumentType(user: User | null | undefined, type: DocumentType): boolean {
  if (type === DocumentType.ManualUnload && !isManualUnloadEnabled(user)) {
    return false;
  }
  return canManageDocumentType(user, type);
}

/** Famiglie che l'utente può gestire: guida i menu «Nuovo documento». */
export function manageableDocumentFamilies(
  user: User | null | undefined,
): readonly DocumentPermissionFamily[] {
  if (hasFullTenantAccess(user)) {
    return DOCUMENT_PERMISSION_FAMILIES;
  }
  return DOCUMENT_PERMISSION_FAMILIES.filter((family) =>
    hasTenantPermission(user, docManagePermission(family)),
  );
}
