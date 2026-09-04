import { ForbiddenException } from '@nestjs/common';
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
  // I tre tipi della famiglia Fattura condividono UNA sola famiglia di
  // permessi: chi può gestire le fatture gestisce anche le note di credito.
  // Un permesso separato per la nota renderebbe possibile emettere fatture
  // senza poterle stornare — cioè metà di un mestiere.
  invoice: [
    DocumentType.invoice,
    DocumentType.invoice_accompanying,
    DocumentType.credit_note,
  ],
  store_sale: [DocumentType.store_sale, DocumentType.store_return],
  online_sale: [DocumentType.online_sale],
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

/**
 * Famiglia di un tipo, o `null` se non ne ha. Serve alle DUE domande che
 * arrivano da fuori — «può vedere?» e «può gestire?» — dove un tipo senza
 * famiglia deve dare un **diniego**, non un errore.
 *
 * ⚠️ La differenza con `documentFamilyOf` non è cosmetica. Quella tira apposta,
 * perché il chiamante che le passa un tipo sta lavorando su un documento vero e
 * un tipo orfano lì è un difetto. Qui invece il tipo arriva **dal client** —
 * `assertCanViewDocumentType` è nata per le rotte che lo ricevono come
 * parametro — e un tipo che non esiste nella matrice non deve produrre un 500:
 * deve essere negato. È la stessa risposta che dà già il frontend.
 */
function familyOrNull(type: DocumentType): DocumentPermissionFamily | null {
  return TYPE_TO_FAMILY.get(type) ?? null;
}

export function canViewDocumentType(
  user: PermissionUser | null | undefined,
  type: DocumentType,
): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  const family = familyOrNull(type);
  if (!family) {
    return false;
  }
  // «Gestisci» implica «Consulta»: chi può creare una fattura può leggerla.
  return (
    hasTenantPermission(user, docViewPermission(family)) ||
    hasTenantPermission(user, docManagePermission(family))
  );
}

/**
 * Gate di CONSULTAZIONE per le rotte che ricevono il tipo documento come
 * PARAMETRO invece di leggerlo da un documento salvato: anteprima numero e
 * controllo cronologico.
 *
 * Su quelle rotte il gate di rotta («consulta almeno una famiglia») non basta:
 * il tipo lo sceglie il client, quindi chi può vedere i soli Preventivi
 * chiederebbe `?type=invoice` e leggerebbe numeri, date e riferimenti del
 * registro fatture — che è la stessa cosa che il filtro dell'elenco impedisce.
 *
 * `user` assente = chiamata interna al dominio: passa, come in
 * `assertDocumentTypeManageable`.
 */
export function assertCanViewDocumentType(
  user: PermissionUser | null | undefined,
  type: DocumentType,
): void {
  if (!user) {
    return;
  }
  if (!canViewDocumentType(user, type)) {
    throw new ForbiddenException('Non hai il permesso di consultare questo tipo di documento.');
  }
}

export function canManageDocumentType(
  user: PermissionUser | null | undefined,
  type: DocumentType,
): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  const family = familyOrNull(type);
  // Un tipo senza famiglia non è gestibile da nessuno: vedi `familyOrNull`.
  return family !== null && hasTenantPermission(user, docManagePermission(family));
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
