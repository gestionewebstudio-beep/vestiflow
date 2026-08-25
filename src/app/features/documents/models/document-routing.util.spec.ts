import { describe, expect, it } from 'vitest';

import { DocumentStatus, DocumentType } from '@core/models/document.model';
import { TenantChannelProfile } from '@core/models/tenant-channel-profile.model';
import { docManagePermission, docViewPermission } from '@core/models/tenant-permission.model';
import { UserRole } from '@core/models/user.model';
import type { User } from '@core/models/user.model';
import { SALES_FORM_DOCUMENT_TYPES } from '@domain/documents/models/document-sales.util';

import {
  DOCUMENT_ROW_OPENS,
  documentDuplicateFormRoute,
  documentEditPath,
  documentOpenPath,
  documentRowPath,
  requireSalesDocumentType,
} from './document-routing.util';

/**
 * Il titolare può tutto: è la scorciatoia di `hasFullTenantAccess`, e serve a
 * provare l'apertura senza dover comporre la matrice permessi voce per voce.
 * La sola consultazione ha una prova sua, più sotto.
 */
const TITOLARE = {
  role: UserRole.Owner,
  // ⚠️ Serve al banco: `canOpenRetailRegister` guarda anche il profilo canale
  // del tenant, non il solo permesso. Senza, il titolare non aprirebbe la cassa.
  tenantChannelProfile: TenantChannelProfile.Shopify,
} as unknown as User;

/** Nessun permesso: vede l'elenco per famiglia, ma non gestisce niente. */
const SOLA_CONSULTAZIONE = {
  role: UserRole.Clerk,
  permissions: [docViewPermission('quote'), docViewPermission('invoice')],
} as unknown as User;

describe('documentOpenPath', () => {
  const doc = (type: DocumentType, status: DocumentStatus = DocumentStatus.Confirmed) => ({
    id: 'doc-1',
    type,
    status,
  });

  it('famiglia carico: apre il form, unica vista completa', () => {
    expect(documentOpenPath(doc(DocumentType.GoodsReceipt), TITOLARE)).toBe(
      '/app/documents/doc-1/edit',
    );
    expect(documentOpenPath(doc(DocumentType.ManualLoad), TITOLARE)).toBe(
      '/app/documents/doc-1/edit',
    );
    expect(documentOpenPath(doc(DocumentType.InitialLoad), TITOLARE)).toBe(
      '/app/documents/doc-1/edit',
    );
  });

  it('registrazione fattura attiva nel form del modulo, annullata nel dettaglio generico', () => {
    expect(documentOpenPath(doc(DocumentType.SupplierInvoice), TITOLARE)).toBe(
      '/app/documents/registrazioni-fatture-fornitori/doc-1/edit',
    );
    expect(
      documentOpenPath(doc(DocumentType.SupplierInvoice, DocumentStatus.Cancelled), TITOLARE),
    ).toBe('/app/documents/doc-1');
  });

  /**
   * ⛔ Qui c'era «documenti di vendita: Dettaglio dedicato per tipo»,
   * e sotto «tipi operativi restanti: dettaglio generico». Erano la fotografia
   * del comportamento vecchio: la stessa applicazione apriva un preventivo in
   * modifica e una fattura in sola lettura, e la differenza dipendeva
   * dall'elenco da cui si era passati.
   *
   * `14` §2, deciso il 20/08/2026: **la riga apre la modifica, sempre.**
   */
  it('⛔ ogni tipo con una maschera si apre in MODIFICA', () => {
    expect(documentOpenPath(doc(DocumentType.Quote), TITOLARE)).toBe(
      '/app/documents/quote/doc-1/edit',
    );
    expect(documentOpenPath(doc(DocumentType.Proforma), TITOLARE)).toBe(
      '/app/documents/proforma/doc-1/edit',
    );
    expect(documentOpenPath(doc(DocumentType.SalesDdt), TITOLARE)).toBe(
      '/app/documents/sales-ddt/doc-1/edit',
    );
    expect(documentOpenPath(doc(DocumentType.InvoiceDraft), TITOLARE)).toBe(
      '/app/documents/fattura/doc-1/edit',
    );
    expect(documentOpenPath(doc(DocumentType.InvoiceAccompanying), TITOLARE)).toBe(
      '/app/documents/fattura-accompagnatoria/doc-1/edit',
    );
    expect(documentOpenPath(doc(DocumentType.CreditNote), TITOLARE)).toBe(
      '/app/documents/nota-di-credito/doc-1/edit',
    );
    expect(documentOpenPath(doc(DocumentType.ManualUnload), TITOLARE)).toBe(
      '/app/documents/manual-unload/doc-1/edit',
    );
    expect(documentOpenPath(doc(DocumentType.Transfer), TITOLARE)).toBe(
      '/app/documents/transfer/doc-1/edit',
    );
    expect(documentOpenPath(doc(DocumentType.Adjustment), TITOLARE)).toBe(
      '/app/documents/adjustment/doc-1/edit',
    );
    // Un indirizzo per TIPO, come la maschera vendita (`11` A2).
    expect(documentOpenPath(doc(DocumentType.StoreSale), TITOLARE)).toBe(
      '/app/vendita-al-banco/vendita/doc-1/edit',
    );
    expect(documentOpenPath(doc(DocumentType.StoreReturn), TITOLARE)).toBe(
      '/app/vendita-al-banco/reso/doc-1/edit',
    );
  });

  /**
   * ⚠️ I due ordini hanno una maschera, ma NON dentro `/app/documents`. Senza
   * un ramo proprio cadrebbero nel ramo finale, che è la maschera dell'Arrivo
   * merce: si aprirebbe un carico su un ordine.
   */
  it('⚠️ i due ordini si aprono FUORI dal modulo documenti', () => {
    expect(documentOpenPath(doc(DocumentType.CustomerOrder), TITOLARE)).toBe(
      '/app/sales/doc-1/edit',
    );
    expect(documentOpenPath(doc(DocumentType.SupplierOrder), TITOLARE)).toBe(
      '/app/orders/doc-1/edit',
    );
  });

  /** §2.1: nessuna falsa maschera editabile dove il dominio non ne ha una. */
  it('⛔ l’inventario fisico non ha maschera documentale: Dettaglio', () => {
    expect(DOCUMENT_ROW_OPENS[DocumentType.Inventory]).toBe('detail');
    expect(documentOpenPath(doc(DocumentType.Inventory), TITOLARE)).toBe('/app/documents/doc-1');
  });

  /**
   * ⚠️ Un ANNULLATO non si modifica, e la regola non dipende più dal profilo di
   * elenco: prima valeva per le registrazioni fattura e per i profili «in stile
   * Arrivi merce», e non per gli altri.
   */
  it('⚠️ un documento annullato apre il Dettaglio, qualunque sia il tipo', () => {
    expect(documentOpenPath(doc(DocumentType.Quote, DocumentStatus.Cancelled), TITOLARE)).toBe(
      '/app/documents/quote/doc-1',
    );
    expect(documentOpenPath(doc(DocumentType.Transfer, DocumentStatus.Cancelled), TITOLARE)).toBe(
      '/app/documents/doc-1',
    );
    expect(documentOpenPath(doc(DocumentType.StoreSale, DocumentStatus.Cancelled), TITOLARE)).toBe(
      '/app/vendita-al-banco/doc-1',
    );
  });

  /**
   * ⭐ La guardia che tiene insieme il contratto: `DOCUMENT_ROW_OPENS` è un
   * Record esaustivo, quindi un tipo nuovo non compila senza decisione — ma
   * questa prova inchioda anche che nessun tipo dichiarato `'form'` finisca
   * sul ramo generico dell'Arrivo merce per sbaglio.
   */
  it('⭐ nessun tipo «form» cade per errore sulla maschera dell’Arrivo merce', () => {
    const famigliaCarico: readonly DocumentType[] = [
      DocumentType.GoodsReceipt,
      DocumentType.ManualLoad,
      DocumentType.InitialLoad,
    ];
    for (const [tipo, apre] of Object.entries(DOCUMENT_ROW_OPENS)) {
      if (apre !== 'form') continue;
      const percorso = documentEditPath({ id: 'doc-1', type: tipo as DocumentType });
      if (famigliaCarico.includes(tipo as DocumentType)) {
        expect(percorso).toBe('/app/documents/doc-1/edit');
      } else {
        expect(percorso, `${tipo} cade sul ramo generico`).not.toBe('/app/documents/doc-1/edit');
      }
    }
  });
});

/**
 * ⛔ **La porta finta**: la regola «la riga apre la modifica» vale solo per chi
 * quella maschera può aprirla.
 *
 * Le rotte di modifica chiedono `familyManage`, quelle di Dettaglio
 * `familyView`. Un operatore in sola consultazione l'elenco lo vede eccome — è
 * gated in vista — quindi senza questo filtro ogni suo clic finirebbe contro il
 * guard e lo rimbalzerebbe alla dashboard.
 *
 * ⚠️ Il difetto **esisteva già** in piccolo: il Preventivo aveva
 * `rowOpensForm: true` e la sua rotta chiede `familyManage`. Riguardava una
 * lista sola; rendere la regola comune lo avrebbe portato su tutte.
 */
describe('documentRowPath — chi non può gestire resta sul Dettaglio', () => {
  const doc = (type: DocumentType) => ({
    id: 'doc-1',
    type,
    status: DocumentStatus.Confirmed,
  });

  it('⛔ sola consultazione: il preventivo apre l’ANTEPRIMA, non la maschera', () => {
    expect(documentRowPath(doc(DocumentType.Quote), SOLA_CONSULTAZIONE)).toBe(
      '/app/documents/quote/doc-1',
    );
  });

  it('⛔ sola consultazione: anche le fatture restano sul Dettaglio', () => {
    expect(documentRowPath(doc(DocumentType.InvoiceDraft), SOLA_CONSULTAZIONE)).toBe(
      '/app/documents/fattura/doc-1',
    );
  });

  it('chi gestisce apre la maschera', () => {
    expect(documentRowPath(doc(DocumentType.Quote), TITOLARE)).toBe(
      '/app/documents/quote/doc-1/edit',
    );
  });

  /**
   * ⚠️ Il banco non chiede `familyManage` ma il permesso di **battere**, che è
   * ciò che chiede il guard delle sue rotte. Usare la famiglia qui manderebbe
   * al form chi non può aprire la cassa.
   */
  it('⚠️ il banco segue «retail.register», non la famiglia', () => {
    const gestisceMaBanconeChiuso = {
      role: UserRole.Clerk,
      permissions: [docManagePermission('store_sale')],
    } as unknown as User;

    expect(documentRowPath(doc(DocumentType.StoreSale), gestisceMaBanconeChiuso)).toBe(
      '/app/vendita-al-banco/doc-1',
    );
  });

  it('senza utente non si apre nessuna maschera', () => {
    expect(documentRowPath(doc(DocumentType.Quote), null)).toBe('/app/documents/quote/doc-1');
  });
});

/**
 * Il tipo nel percorso di modifica — regressione di `07-…§18`.
 *
 * Il difetto che questi test chiudono: la maschera vendita apriva ogni tipo su
 * `/app/documents/sales/:id/edit`, che il tipo non lo dichiarava. Il form lo
 * ricavava dal documento **caricato** e nel frattempo ricadeva su Proforma —
 * titolo sbagliato, dicitura «non valida ai fini IVA» sopra un documento
 * fiscale, tendina Serie con le serie di un altro tipo.
 *
 * I test parlano della REGOLA, non del caso: «ogni tipo della maschera vendita
 * ha il suo indirizzo» vale anche per il quinto tipo, che oggi non esiste.
 */
describe('documentEditPath — il tipo sta nel percorso', () => {
  it('ogni tipo della maschera vendita ha un indirizzo PROPRIO', () => {
    const paths = SALES_FORM_DOCUMENT_TYPES.map((type) => documentEditPath({ id: 'doc-1', type }));

    expect(new Set(paths).size).toBe(SALES_FORM_DOCUMENT_TYPES.length);
    expect(paths).not.toContain('/app/documents/sales/doc-1/edit');
  });

  it('i tre tipi della famiglia Fattura vanno su tre rotte distinte', () => {
    expect(documentEditPath({ id: 'd', type: DocumentType.InvoiceDraft })).toBe(
      '/app/documents/fattura/d/edit',
    );
    expect(documentEditPath({ id: 'd', type: DocumentType.InvoiceAccompanying })).toBe(
      '/app/documents/fattura-accompagnatoria/d/edit',
    );
    expect(documentEditPath({ id: 'd', type: DocumentType.CreditNote })).toBe(
      '/app/documents/nota-di-credito/d/edit',
    );
  });

  it('il percorso di duplicazione usa gli stessi segmenti, non una seconda tabella', () => {
    for (const type of SALES_FORM_DOCUMENT_TYPES) {
      const editPath = documentEditPath({ id: 'd', type });
      expect(documentDuplicateFormRoute(type)).toBe(editPath.replace('/d/edit', '/new'));
    }
  });
});

describe('requireSalesDocumentType', () => {
  it('restituisce il tipo dichiarato dalla rotta', () => {
    expect(requireSalesDocumentType({ salesDocumentType: DocumentType.CreditNote })).toBe(
      DocumentType.CreditNote,
    );
  });

  it('una rotta senza tipo si rompe, invece di far finta che sia una proforma', () => {
    expect(() => requireSalesDocumentType({})).toThrow(/salesDocumentType/);
    expect(() => requireSalesDocumentType({ salesDocumentType: DocumentType.SalesDdt })).toThrow();
  });
});
