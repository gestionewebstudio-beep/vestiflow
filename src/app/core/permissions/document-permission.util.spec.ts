import { describe, expect, it } from 'vitest';

import { DocumentType } from '@core/models/document.model';
import { TenantChannelProfile } from '@core/models/tenant-channel-profile.model';
import {
  DOCUMENT_PERMISSION_FAMILIES,
  docManagePermission,
  docViewPermission,
  type DocumentPermissionFamily,
} from '@core/models/tenant-permission.model';
import type { User } from '@core/models/user.model';
import { UserRole } from '@core/models/user.model';

import {
  canManageDocumentType,
  canViewDocumentType,
  documentFamilyOf,
  documentTypesOfFamily,
  manageableDocumentFamilies,
} from './document-permission.util';

/**
 * PERCHÉ questo test esiste.
 *
 * `document-permission.util.ts` è lo SPECCHIO di
 * `api/src/auth/document-permission.util.ts`: la stessa mappa tipo → famiglia,
 * la stessa regola «gestisci implica consulta». Se le due divergono la UI offre
 * un documento che l'API poi rifiuta, oppure lo nasconde a chi avrebbe diritto
 * di vederlo — e nessuna delle due cose fa arrossare qualcosa: il codice
 * compila, la pagina si apre, il permesso semplicemente smette di funzionare.
 *
 * `npm run check:permissions` confronta i due file leggendone il TESTO. Questo
 * spec verifica invece il COMPORTAMENTO, e copre i rami che il confronto
 * testuale non può vedere:
 *  - un tipo spostato nella famiglia sbagliata (`supplier_invoice` è della
 *    famiglia `purchase_invoice`, `customer_order` di `sales_order`: i nomi
 *    non coincidono, ed è lì che si sbaglia);
 *  - il ramo NEGATO — famiglia non concessa, e «consulta» che NON deve
 *    implicare «gestisci» (l'implicazione vale in una direzione sola);
 *  - il titolare, che passa con l'array permessi VUOTO perché è
 *    `hasFullTenantAccess` a decidere, non l'elenco.
 */

/**
 * Risposta giusta presa dalla mappa dell'API (`FAMILY_TO_TYPES` in
 * api/src/auth/document-permission.util.ts) e trascritta qui a mano: se fosse
 * derivata dallo stesso file sotto test, una mappa sbagliata resterebbe
 * sbagliata in entrambi e il test passerebbe lo stesso.
 */
const FAMIGLIA_ATTESA: Readonly<Record<string, DocumentPermissionFamily>> = {
  supplier_order: 'supplier_order',
  goods_receipt: 'goods_receipt',
  supplier_invoice: 'purchase_invoice',
  manual_load: 'adjustment',
  initial_load: 'adjustment',
  sales_ddt: 'sales_ddt',
  transfer: 'transfer',
  manual_unload: 'manual_unload',
  adjustment: 'adjustment',
  inventory: 'adjustment',
  proforma: 'proforma',
  invoice: 'invoice',
  invoice_accompanying: 'invoice',
  // Terzo tipo della famiglia: stessi permessi degli altri due — chi emette
  // fatture deve poterle stornare.
  credit_note: 'invoice',
  online_sale: 'online_sale',
  customer_order: 'sales_order',
  store_sale: 'store_sale',
  store_return: 'store_sale',
  quote: 'quote',
};

function utente(
  role: User['role'],
  permissions: readonly string[],
  overrides: Partial<User> = {},
): User {
  return {
    id: 'u1',
    tenantId: 't1',
    email: 'test@example.com',
    displayName: 'Test',
    avatarUrl: null,
    role,
    storeIds: [],
    isActive: true,
    isPlatformAdmin: false,
    tenantChannelProfile: TenantChannelProfile.Shopify,
    tenantName: 'Cliente test',
    hasAllLocationsAccess: true,
    assignedLocationIds: [],
    assignedLocations: [],
    defaultLocationId: null,
    defaultLocation: null,
    permissions: [...permissions],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Titolare: l'array è vuoto per scelta, l'accesso pieno viene dal ruolo. */
const titolare = utente(UserRole.Owner, []);

describe('document-permission.util (FE) — mappa tipo → famiglia', () => {
  it('ogni tipo documento risolve alla famiglia dichiarata dall’API', () => {
    const risolte = Object.fromEntries(
      Object.keys(FAMIGLIA_ATTESA).map((type) => [type, documentFamilyOf(type)]),
    );

    expect(risolte).toEqual(FAMIGLIA_ATTESA);
  });

  it('nessun tipo del catalogo frontend resta senza famiglia', () => {
    const orfani = Object.values(DocumentType).filter((type) => documentFamilyOf(type) === null);

    expect(orfani).toEqual([]);
  });

  it('i tipi raggiungibili dalle famiglie sono esattamente quelli mappati', () => {
    const daiFamiglie = DOCUMENT_PERMISSION_FAMILIES.flatMap((family) => [
      ...documentTypesOfFamily(family),
    ]);

    expect([...daiFamiglie].sort()).toEqual(Object.keys(FAMIGLIA_ATTESA).sort());
  });

  it('un tipo sconosciuto o assente non ha famiglia (il frontend non solleva, l’API sì)', () => {
    expect(documentFamilyOf('tipo_inventato')).toBeNull();
    expect(documentFamilyOf(null)).toBeNull();
    expect(documentFamilyOf(undefined)).toBeNull();
    expect(documentFamilyOf('')).toBeNull();
  });
});

describe('document-permission.util (FE) — «gestisci implica consulta»', () => {
  it('chi può gestire una famiglia può anche consultarla', () => {
    const gestisceFatture = utente(UserRole.Clerk, [docManagePermission('invoice')]);

    expect(canManageDocumentType(gestisceFatture, DocumentType.Invoice)).toBe(true);
    expect(canViewDocumentType(gestisceFatture, DocumentType.Invoice)).toBe(true);
  });

  it('il permesso vale per l’intera famiglia, non per il singolo tipo', () => {
    const gestisceFatture = utente(UserRole.Clerk, [docManagePermission('invoice')]);
    const gestisceRettifiche = utente(UserRole.Clerk, [docManagePermission('adjustment')]);

    // Stessa famiglia «invoice»: la accompagnatoria segue la fattura.
    expect(canViewDocumentType(gestisceFatture, DocumentType.InvoiceAccompanying)).toBe(true);
    expect(canManageDocumentType(gestisceFatture, DocumentType.InvoiceAccompanying)).toBe(true);

    // Famiglia «adjustment»: rettifica, carico manuale, carico iniziale, inventario.
    for (const type of [
      DocumentType.Adjustment,
      DocumentType.ManualLoad,
      DocumentType.InitialLoad,
      DocumentType.Inventory,
    ]) {
      expect(canManageDocumentType(gestisceRettifiche, type)).toBe(true);
    }
  });

  it('l’implicazione vale in una direzione sola: consultare non è gestire', () => {
    const consultaArrivi = utente(UserRole.Clerk, [docViewPermission('goods_receipt')]);

    expect(canViewDocumentType(consultaArrivi, DocumentType.GoodsReceipt)).toBe(true);
    expect(canManageDocumentType(consultaArrivi, DocumentType.GoodsReceipt)).toBe(false);
  });
});

describe('document-permission.util (FE) — ramo negato', () => {
  it('un tipo di famiglia non concessa è negato in consulta e in gestione', () => {
    const soloFatture = utente(UserRole.Clerk, [docManagePermission('invoice')]);

    expect(canViewDocumentType(soloFatture, DocumentType.GoodsReceipt)).toBe(false);
    expect(canManageDocumentType(soloFatture, DocumentType.GoodsReceipt)).toBe(false);
    expect(canViewDocumentType(soloFatture, DocumentType.SupplierInvoice)).toBe(false);
    expect(canViewDocumentType(soloFatture, DocumentType.CustomerOrder)).toBe(false);
    expect(canViewDocumentType(soloFatture, DocumentType.StoreSale)).toBe(false);
  });

  it('con l’array permessi vuoto un dipendente non vede nessun documento', () => {
    const senzaNulla = utente(UserRole.Clerk, []);

    for (const type of Object.keys(FAMIGLIA_ATTESA)) {
      expect(canViewDocumentType(senzaNulla, type)).toBe(false);
      expect(canManageDocumentType(senzaNulla, type)).toBe(false);
    }
    expect(manageableDocumentFamilies(senzaNulla)).toEqual([]);
  });

  it('un permesso concesso non apre le famiglie vicine', () => {
    // La vendita al banco NON apre la vendita online, e viceversa: sono due
    // famiglie distinte anche se il documento «somiglia».
    const banco = utente(UserRole.Clerk, [docManagePermission('store_sale')]);

    expect(canViewDocumentType(banco, DocumentType.StoreReturn)).toBe(true);
    expect(canViewDocumentType(banco, 'online_sale')).toBe(false);
    // `corrispettivo` è stato ritirato il 17/08/2026 e resta solo come valore
    // morto nell'enum PostgreSQL: senza famiglia è negato a chiunque — che è
    // la risposta giusta se una riga vecchia lo nominasse.
    expect(canViewDocumentType(banco, 'corrispettivo')).toBe(false);
  });

  it('un tipo senza famiglia è negato anche a chi ha tutti i permessi documento', () => {
    const tuttiIDocumenti = utente(UserRole.Clerk, [
      ...DOCUMENT_PERMISSION_FAMILIES.map((family) => docViewPermission(family)),
      ...DOCUMENT_PERMISSION_FAMILIES.map((family) => docManagePermission(family)),
    ]);

    expect(canViewDocumentType(tuttiIDocumenti, 'tipo_inventato')).toBe(false);
    expect(canManageDocumentType(tuttiIDocumenti, 'tipo_inventato')).toBe(false);
    expect(canViewDocumentType(tuttiIDocumenti, null)).toBe(false);
    expect(canManageDocumentType(tuttiIDocumenti, undefined)).toBe(false);
  });

  it('senza utente non si consulta e non si gestisce nulla', () => {
    expect(canViewDocumentType(null, DocumentType.GoodsReceipt)).toBe(false);
    expect(canViewDocumentType(undefined, DocumentType.GoodsReceipt)).toBe(false);
    expect(canManageDocumentType(null, DocumentType.GoodsReceipt)).toBe(false);
    expect(canManageDocumentType(undefined, DocumentType.GoodsReceipt)).toBe(false);
    expect(manageableDocumentFamilies(null)).toEqual([]);
    expect(manageableDocumentFamilies(undefined)).toEqual([]);
  });

  it('i permessi di sezione non sostituiscono la matrice documenti', () => {
    // Aprire la sezione Documenti non dice nulla su COSA si vede lì dentro.
    const soloSezione = utente(UserRole.Clerk, ['section.documents', 'inventory.manage']);

    expect(canViewDocumentType(soloSezione, DocumentType.GoodsReceipt)).toBe(false);
    expect(manageableDocumentFamilies(soloSezione)).toEqual([]);
  });
});

describe('document-permission.util (FE) — titolare e assistenza', () => {
  it('il titolare vede e gestisce ogni tipo anche con l’array permessi vuoto', () => {
    expect(titolare.permissions).toEqual([]);

    for (const type of Object.keys(FAMIGLIA_ATTESA)) {
      expect(canViewDocumentType(titolare, type)).toBe(true);
      expect(canManageDocumentType(titolare, type)).toBe(true);
    }
  });

  it('al titolare le famiglie gestibili sono tutte, nell’ordine della matrice', () => {
    expect(manageableDocumentFamilies(titolare)).toEqual(DOCUMENT_PERMISSION_FAMILIES);
  });

  it('la sessione di assistenza dà accesso pieno anche a un ruolo minimo', () => {
    const operatore = utente(UserRole.Clerk, [], {
      supportSession: {
        sessionId: 'session-1',
        targetTenantId: 'tenant-cliente',
        targetTenantName: 'Cliente',
        expiresAt: '2026-08-11T16:00:00.000Z',
      },
    });

    expect(canViewDocumentType(operatore, DocumentType.Invoice)).toBe(true);
    expect(canManageDocumentType(operatore, DocumentType.ManualUnload)).toBe(true);
    expect(manageableDocumentFamilies(operatore)).toEqual(DOCUMENT_PERMISSION_FAMILIES);
  });
});

describe('document-permission.util (FE) — famiglie gestibili (menu «Nuovo documento»)', () => {
  it('elenca solo le famiglie con «gestisci», mai quelle di sola consultazione', () => {
    const misto = utente(UserRole.Clerk, [
      docManagePermission('goods_receipt'),
      docViewPermission('invoice'),
      docViewPermission('sales_order'),
      docManagePermission('quote'),
    ]);

    expect(manageableDocumentFamilies(misto)).toEqual(['goods_receipt', 'quote']);
  });

  it('rispetta l’ordine di presentazione della matrice, non quello dei permessi salvati', () => {
    const disordinato = utente(UserRole.Clerk, [
      docManagePermission('manual_unload'),
      docManagePermission('goods_receipt'),
      docManagePermission('invoice'),
    ]);

    expect(manageableDocumentFamilies(disordinato)).toEqual([
      'goods_receipt',
      'invoice',
      'manual_unload',
    ]);
  });

  it('i tipi offerti derivano dalle famiglie gestibili', () => {
    const soloArrivi = utente(UserRole.Clerk, [docManagePermission('goods_receipt')]);

    const tipiOfferti = manageableDocumentFamilies(soloArrivi).flatMap((family) => [
      ...documentTypesOfFamily(family),
    ]);

    expect(tipiOfferti).toEqual([DocumentType.GoodsReceipt]);
  });
});
