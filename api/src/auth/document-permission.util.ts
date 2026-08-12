import { DocumentType } from '@prisma/client';

import {
  DOCUMENT_PERMISSION_FAMILIES,
  docManagePermission,
  docViewPermission,
  type DocumentPermissionFamily,
} from './tenant-permission.constants';
import {
  hasFullTenantAccess,
  hasTenantPermission,
  type PermissionUser,
} from './user-permissions.util';

/**
 * Ogni DocumentType appartiene a UNA famiglia della matrice permessi: la
 * famiglia raggruppa i tipi che l'utente percepisce come lo stesso documento.
 * `customer_order` è il numeratore dell'ordine cliente (l'entità vive in
 * SalesOrder) ma i suoi documenti interni seguono la stessa famiglia.
 */
const FAMILY_TO_TYPES: Readonly<Record<DocumentPermissionFamily, readonly DocumentType[]>> = {
  goods_receipt: [DocumentType.goods_receipt],
  purchase_invoice: [DocumentType.supplier_invoice],
  supplier_order: [DocumentType.supplier_order],
  sales_order: [DocumentType.customer_order],
  quote: [DocumentType.quote],
  proforma: [DocumentType.proforma],
  sales_ddt: [DocumentType.sales_ddt],
  invoice: [DocumentType.invoice_draft, DocumentType.invoice_accompanying],
  store_sale: [DocumentType.store_sale, DocumentType.store_return],
  online_sale: [DocumentType.online_sale, DocumentType.corrispettivo],
  transfer: [DocumentType.transfer],
  adjustment: [
    DocumentType.adjustment,
    DocumentType.manual_load,
    DocumentType.initial_load,
    DocumentType.inventory,
  ],
  manual_unload: [DocumentType.manual_unload],
};

const TYPE_TO_FAMILY: ReadonlyMap<DocumentType, DocumentPermissionFamily> = new Map(
  DOCUMENT_PERMISSION_FAMILIES.flatMap((family) =>
    FAMILY_TO_TYPES[family].map((type) => [type, family] as const),
  ),
);

export function documentFamilyOf(type: DocumentType): DocumentPermissionFamily {
  const family = TYPE_TO_FAMILY.get(type);
  if (!family) {
    // Tipo nuovo non ancora mappato: fallire rumorosamente in sviluppo è
    // meglio di un documento invisibile o visibile a tutti in silenzio.
    throw new Error(`DocumentType senza famiglia permessi: ${type}`);
  }
  return family;
}

export function documentTypesOfFamily(family: DocumentPermissionFamily): readonly DocumentType[] {
  return FAMILY_TO_TYPES[family];
}

export function canViewDocumentType(
  user: PermissionUser | null | undefined,
  type: DocumentType,
): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  const family = documentFamilyOf(type);
  // «Gestisci» implica «Consulta»: chi può creare una fattura può leggerla.
  return (
    hasTenantPermission(user, docViewPermission(family)) ||
    hasTenantPermission(user, docManagePermission(family))
  );
}

export function canManageDocumentType(
  user: PermissionUser | null | undefined,
  type: DocumentType,
): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  return hasTenantPermission(user, docManagePermission(documentFamilyOf(type)));
}

/**
 * Tipi documento che l'utente può vedere nel registro: il filtro delle liste.
 * `null` = nessuna restrizione (titolare/assistenza).
 */
export function viewableDocumentTypesFor(
  user: PermissionUser | null | undefined,
): readonly DocumentType[] | null {
  if (hasFullTenantAccess(user)) {
    return null;
  }
  return DOCUMENT_PERMISSION_FAMILIES.filter(
    (family) =>
      hasTenantPermission(user, docViewPermission(family)) ||
      hasTenantPermission(user, docManagePermission(family)),
  ).flatMap((family) => [...FAMILY_TO_TYPES[family]]);
}

/**
 * Interseca il filtro tipi richiesto dal client con i tipi consultabili
 * dall'utente. Senza richiesta esplicita restituisce tutti i consultabili;
 * `null` = nessuna restrizione da applicare al where.
 */
export function intersectViewableDocumentTypes(
  user: PermissionUser | null | undefined,
  requested: readonly DocumentType[] | undefined,
): readonly DocumentType[] | null {
  const allowed = viewableDocumentTypesFor(user);
  if (allowed === null) {
    return requested && requested.length > 0 ? requested : null;
  }
  if (!requested || requested.length === 0) {
    return allowed;
  }
  return requested.filter((type) => allowed.includes(type));
}
