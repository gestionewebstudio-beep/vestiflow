import { describe, expect, it } from 'vitest';

import { DocumentType } from '@core/models/document.model';
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
  // ⚠️ E serve alla Vendita manuale: dal 26/08/2026 la sua maschera si apre solo
  //   dove l’interruttore aziendale e’ acceso. Spento, la riga porta al
  //   Dettaglio — che e’ il caso provato piu’ sotto.
  manualUnloadEnabled: true,
} as unknown as User;

/** Nessun permesso: vede l'elenco per famiglia, ma non gestisce niente. */
const SOLA_CONSULTAZIONE = {
  role: UserRole.Clerk,
  permissions: [docViewPermission('quote'), docViewPermission('invoice')],
} as unknown as User;

describe('documentOpenPath', () => {
  // ⭐ Nessuno `status`: dal 28/08/2026 il routing non lo riceve — la firma di
  //   `documentRowPath` accetta id e tipo, e basta.
  const doc = (type: DocumentType) => ({
    id: 'doc-1',
    type,
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

  it('registrazione fattura: il form del modulo', () => {
    // ⛔ Qui c'era una seconda asserzione — `Cancelled → '/app/documents/doc-1'` —
    //   ed era il caso da cui la regola «annullato → Dettaglio» venne
    //   GENERALIZZATA a tutti i tipi il 20/08.
    //
    // ⭐ Rimossa il 28/08/2026, per decisione del proprietario: **la
    //   Registrazione fattura non ha stati funzionali**. Ne hanno soltanto
    //   l'Ordine cliente e l'Ordine fornitore, e servono ai COLLEGAMENTI
    //   documentali, non al routing. Qui non si asserisce niente per stato,
    //   in nessuna delle due direzioni.
    expect(documentOpenPath(doc(DocumentType.SupplierInvoice), TITOLARE)).toBe(
      '/app/documents/registrazioni-fatture-fornitori/doc-1/edit',
    );
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
      '/app/documents/ddt-vendita/doc-1/edit',
    );
    expect(documentOpenPath(doc(DocumentType.Invoice), TITOLARE)).toBe(
      '/app/documents/fattura/doc-1/edit',
    );
    expect(documentOpenPath(doc(DocumentType.InvoiceAccompanying), TITOLARE)).toBe(
      '/app/documents/fattura-accompagnatoria/doc-1/edit',
    );
    expect(documentOpenPath(doc(DocumentType.CreditNote), TITOLARE)).toBe(
      '/app/documents/nota-di-credito/doc-1/edit',
    );
    expect(documentOpenPath(doc(DocumentType.ManualUnload), TITOLARE)).toBe(
      '/app/documents/vendita-manuale/doc-1/edit',
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
   * ⛔ **Qui c'era: «un documento annullato apre il Dettaglio, qualunque sia il
   * tipo»**, con tre asserzioni su Preventivo, Trasferimento e Vendita al banco.
   *
   * ⭐ Rimosso il 28/08/2026, per decisione del proprietario: **quei documenti
   * non hanno stati funzionali**. Ne hanno solo l'Ordine cliente e l'Ordine
   * fornitore, e lì lo stato governa l'eleggibilità in «Includi/Genera» — non
   * il routing, non l'apertura, non la modifica.
   *
   * ⚠️ **E non è stato sostituito con l'asserzione opposta**: dire «un annullato
   * apre la Modifica» sarebbe di nuovo una policy generica sugli stati, cioè lo
   * stesso errore alla rovescia. Il routing non riceve lo stato — la firma di
   * `documentRowPath` non lo accetta più — e non c'è niente da provare per stato.
   *
   * ⚠️ Che `DocumentStatus` esista comunque su questi tipi è debito noto:
   * GAP-DOC-STATUS-LEGACY, censimento separato.
   */
  it('⭐ la destinazione dipende dal TIPO e dai permessi, mai dallo stato', () => {
    // La stessa risposta di sopra, e la firma impedisce di chiedere altro.
    expect(documentOpenPath(doc(DocumentType.Quote), TITOLARE)).toBe(
      '/app/documents/quote/doc-1/edit',
    );
    expect(documentOpenPath(doc(DocumentType.Transfer), TITOLARE)).toBe(
      '/app/documents/transfer/doc-1/edit',
    );
    expect(documentOpenPath(doc(DocumentType.StoreSale), TITOLARE)).toBe(
      '/app/vendita-al-banco/vendita/doc-1/edit',
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
  // ⭐ Nessuno `status`: dal 28/08/2026 il routing non lo riceve — la firma di
  //   `documentRowPath` accetta id e tipo, e basta.
  const doc = (type: DocumentType) => ({
    id: 'doc-1',
    type,
  });

  it('⛔ sola consultazione: il preventivo apre l’ANTEPRIMA, non la maschera', () => {
    expect(documentRowPath(doc(DocumentType.Quote), SOLA_CONSULTAZIONE)).toBe(
      '/app/documents/quote/doc-1',
    );
  });

  it('⛔ sola consultazione: anche le fatture restano sul Dettaglio', () => {
    expect(documentRowPath(doc(DocumentType.Invoice), SOLA_CONSULTAZIONE)).toBe(
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
    expect(documentEditPath({ id: 'd', type: DocumentType.Invoice })).toBe(
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

/**
 * ⛔ **La Vendita manuale spenta non apre la maschera: porta al Dettaglio.**
 *
 * È il modo in cui l'interruttore protegge lo storico senza inventare uno stato
 * parallelo. La maschera non si apre «in sola lettura» — nascondendo Salva,
 * nascondendo Sblocca, bloccando i campi: **non ci si arriva**, e la
 * destinazione giusta esiste già.
 *
 * ⚠️ La prova sta qui e non nei chiamanti: `documentRowPath` è l'unica risposta
 * per tutti gli elenchi, e `documentOpenPath` (ricerca globale, link
 * trasversali) le delega. Chiuso qui, è chiuso ovunque.
 */
describe('Vendita manuale spenta: dove porta il documento', () => {
  const SPENTA = {
    role: UserRole.Owner,
    tenantChannelProfile: TenantChannelProfile.Shopify,
    manualUnloadEnabled: false,
  } as unknown as User;

  // ⭐ Nessuno `status`: dal 28/08/2026 il routing non lo riceve — la firma di
  //   `documentRowPath` accetta id e tipo, e basta.
  const doc = (type: DocumentType) => ({
    id: 'doc-1',
    type,
  });

  it('⛔ a funzione spenta la riga porta al DETTAGLIO, non alla maschera', () => {
    // ⚠️ Il Dettaglio della Vendita manuale ha una rotta DEDICATA, non quella
    //   generica: e' `/vendita-manuale/:id` senza `/edit`. La differenza sta tutta
    //   in quel suffisso, e scriverla per intero e’ il modo di non confonderle.
    expect(documentRowPath(doc(DocumentType.ManualUnload), SPENTA)).toBe(
      '/app/documents/vendita-manuale/doc-1',
    );
  });

  it('⭐ accesa, porta alla maschera come ogni altro documento', () => {
    expect(documentRowPath(doc(DocumentType.ManualUnload), TITOLARE)).toBe(
      '/app/documents/vendita-manuale/doc-1/edit',
    );
  });

  it('⛔ e la ricerca globale segue, perché delega alla stessa funzione', () => {
    expect(documentOpenPath(doc(DocumentType.ManualUnload), SPENTA)).toBe(
      '/app/documents/vendita-manuale/doc-1',
    );
  });

  it('⭐ nessun ALTRO tipo cambia destinazione a Vendita manuale spenta', () => {
    // ⚠️ È il confine: spegne una funzione, non il registro.
    expect(documentRowPath(doc(DocumentType.Quote), SPENTA)).toContain('/edit');
    expect(documentRowPath(doc(DocumentType.SalesDdt), SPENTA)).toContain('/edit');
    expect(documentRowPath(doc(DocumentType.GoodsReceipt), SPENTA)).toContain('/edit');
  });
});
