import { Router, provideRouter } from '@angular/router';
import { fireEvent, render, screen, waitFor } from '@testing-library/angular';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';
import { DocumentStatus, DocumentType } from '@core/models/document.model';
import { SalesOrderSource } from '@core/models/sales-order.model';
import { UserRole, type User } from '@core/models/user.model';
import { CustomerService } from '@domain/customers/services/customer.service';
import { DocumentService } from '@domain/documents/services/document.service';
import { ProductService } from '@domain/products/services/product.service';
import { SalesOrderService } from '@domain/sales-orders/services/sales-order.service';
import { SupplierOrderService } from '@domain/supplier-orders/services/supplier-order.service';
import { SupplierService } from '@domain/suppliers/services/supplier.service';
import type { NavSection } from '@shared/models/nav-item.model';

import { GlobalSearchComponent } from './global-search.component';

/** Titolare: apre tutto. Il filtro sui permessi ha prove sue nel routing. */
const UTENTE = { role: UserRole.Owner } as unknown as User;

const FULL_NAV: readonly NavSection[] = [
  {
    id: 'main',
    items: [
      { label: 'Prodotti', icon: 'pi-tags', route: '/app/products' },
      { label: 'Fornitori', icon: 'pi-building', route: '/app/suppliers' },
      { label: 'Documenti', icon: 'pi-file', route: '/app/documents' },
      { label: 'Clienti', icon: 'pi-users', route: '/app/customers' },
      // La sorgente `salesOrders` è gated su questa voce: senza, la ricerca
      // non la interroga nemmeno e le prove sull’origine non vedrebbero nulla.
      { label: 'Ordini cliente', icon: 'pi-shopping-cart', route: '/app/sales' },
    ],
  },
];

const CUSTOMER = {
  id: 'cust-1',
  firstName: '',
  lastName: '',
  companyName: 'Rossi Moda SRL',
  code: 'CL-001',
  email: 'info@rossimoda.it',
};

const QUOTE_DOC = {
  id: 'doc-9',
  type: DocumentType.Quote,
  status: DocumentStatus.Confirmed,
  series: 'PRE',
  year: 2026,
  reference: 'PRE-2026-0007',
  documentDate: '2026-08-01',
  customerName: 'Rossi Moda SRL',
};

const SUPPLIER = {
  id: 'sup-1',
  name: 'Tessuti Rossi SPA',
  code: 'FR-002',
  email: 'ordini@tessutirossi.it',
};

const SUPPLIER_ORDER = {
  id: 'po-1',
  reference: 'OF-2026-0042',
  supplierName: 'Tessuti Rossi SPA',
  orderDate: '2026-07-20',
};

function paginated(data: readonly unknown[]): unknown {
  return { data, meta: { page: 1, pageSize: 5, total: data.length, totalPages: 1 } };
}

describe('GlobalSearchComponent', () => {
  beforeEach(() => {
    // jsdom non implementa scrollIntoView (usato per tenere visibile la voce attiva).
    Element.prototype.scrollIntoView = vi.fn();
  });

  async function setup(options?: {
    readonly navSections?: readonly NavSection[];
    readonly customers?: readonly unknown[];
    readonly documents?: readonly unknown[];
    readonly suppliers?: readonly unknown[];
    readonly supplierOrders?: readonly unknown[];
    readonly salesOrders?: readonly unknown[];
  }) {
    const getProducts = vi.fn(() => of(paginated([])));
    const getCustomers = vi.fn(() => of(paginated(options?.customers ?? [])));
    const getDocuments = vi.fn(() => of(paginated(options?.documents ?? [])));
    const list = vi.fn(() => of(paginated(options?.suppliers ?? [])));
    const getSupplierOrders = vi.fn(() => of(paginated(options?.supplierOrders ?? [])));
    const getSalesOrders = vi.fn(() => of(paginated(options?.salesOrders ?? [])));

    const rendered = await render(GlobalSearchComponent, {
      componentInputs: {
        open: true,
        navSections: options?.navSections ?? FULL_NAV,
      },
      providers: [
        provideRouter([]),
        // La ricerca globale decide DOVE porta un risultato in base a cio' che
        // questo utente puo' aprire: senza un utente manderebbe tutti
        // sull'anteprima, e la prova sull'apertura in modifica cadrebbe.
        { provide: AuthService, useValue: { currentUser: () => UTENTE } },
        { provide: ProductService, useValue: { getProducts } },
        { provide: CustomerService, useValue: { getCustomers } },
        { provide: DocumentService, useValue: { getDocuments } },
        { provide: SupplierService, useValue: { list } },
        { provide: SupplierOrderService, useValue: { getSupplierOrders } },
        { provide: SalesOrderService, useValue: { getSalesOrders } },
      ],
    });
    const router = rendered.fixture.debugElement.injector.get(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    /** Digita e attende il debounce reale (spinner comparso e sparito). */
    const search = async (term: string): Promise<void> => {
      fireEvent.input(screen.getByRole('combobox'), { target: { value: term } });
      await waitFor(() => {
        rendered.detectChanges();
        expect(screen.queryByText(/Ricerca in corso/)).toBeNull();
      });
    };
    return { ...rendered, navigate, search, getSalesOrders, list, getSupplierOrders };
  }

  it('un cliente azienda mostra la ragione sociale, non un nominativo vuoto', async () => {
    const { search } = await setup({ customers: [CUSTOMER] });

    await search('rossi');

    const option = screen.getByRole('option', { name: /Rossi Moda SRL/ });
    expect(option).toHaveTextContent('CL-001 · info@rossimoda.it');
  });

  /**
   * ⛔ Qui si attendeva `/app/documents/quote/doc-9`, cioè l'anteprima. La
   * ricerca globale deve dare la **stessa** risposta del clic di riga (`14` §2
   * e §13.3): se le due divergessero, lo stesso documento avrebbe due aperture
   * diverse a seconda di dove lo si è trovato.
   */
  it('un documento mostra riferimento e tipo, e lo apre in MODIFICA', async () => {
    const { search, navigate } = await setup({ documents: [QUOTE_DOC] });

    await search('pre-2026');

    const option = screen.getByRole('option', { name: /PRE-2026-0007/ });
    expect(option).toHaveTextContent('Preventivo');
    fireEvent.click(option);
    expect(navigate).toHaveBeenCalledWith(['/app/documents/quote/doc-9/edit'], { queryParams: {} });
  });

  it('trova fornitori e ordini fornitore, incluse le pagine ordini', async () => {
    const { search } = await setup({
      suppliers: [SUPPLIER],
      supplierOrders: [SUPPLIER_ORDER],
    });

    await search('ordine fornitore');

    // Pagina di secondo livello: prima era irraggiungibile (parent /app/orders
    // mai presente in nav).
    expect(screen.getByRole('option', { name: /Nuovo ordine fornitore/ })).toBeVisible();
    // FR-002 e OF-2026-0042 identificano fornitore e ordine senza ambiguita'
    // (il nome del fornitore compare anche nel sottotitolo dell'ordine).
    expect(screen.getByRole('option', { name: /FR-002/ })).toBeVisible();
    expect(screen.getByRole('option', { name: /OF-2026-0042/ })).toBeVisible();
  });

  it('le fonti non raggiungibili dalla nav non vengono interrogate', async () => {
    const { search, list, getSupplierOrders, getSalesOrders } = await setup({
      navSections: [
        { id: 'main', items: [{ label: 'Prodotti', icon: 'pi-tags', route: '/app/products' }] },
      ],
    });

    await search('rossi');

    expect(list).not.toHaveBeenCalled();
    expect(getSupplierOrders).not.toHaveBeenCalled();
    expect(getSalesOrders).not.toHaveBeenCalled();
    expect(screen.queryByRole('option', { name: /Nuovo ordine fornitore/ })).toBeNull();
  });

  it('trova le azioni «Nuovo …» dei documenti di vendita', async () => {
    const { search } = await setup();

    await search('nuova proforma');
    expect(screen.getByRole('option', { name: /Nuova proforma/ })).toBeVisible();

    await search('nuovo ddt vendita');
    expect(screen.getByRole('option', { name: /Nuovo DDT vendita/ })).toBeVisible();

    await search('nuova fattura accompagnatoria');
    expect(screen.getByRole('option', { name: /Nuova fattura accompagnatoria/ })).toBeVisible();
  });

  it('il match tollera singolare/plurale («preventivo» trova «Preventivi»)', async () => {
    const { search } = await setup();

    await search('preventivo');
    expect(screen.getByRole('option', { name: /^Preventivi/ })).toBeVisible();
    expect(screen.getByRole('option', { name: /Nuovo preventivo/ })).toBeVisible();
  });

  it('sotto la soglia di ricerca i risultati remoti precedenti spariscono subito', async () => {
    const { search, detectChanges } = await setup({ customers: [CUSTOMER] });

    await search('rossi');
    expect(screen.getByRole('option', { name: /Rossi Moda SRL/ })).toBeVisible();

    // Query accorciata sotto soglia: niente attesa del debounce, la lista
    // non deve mostrare entita' della query precedente.
    fireEvent.input(screen.getByRole('combobox'), { target: { value: 'r' } });
    detectChanges();
    expect(screen.queryByRole('option', { name: /Rossi Moda SRL/ })).toBeNull();
  });
  /**
   * ⛔ **La prova che mancava, e testare il solo resolver non la dava.**
   *
   * `salesOrderRowPath` può essere corretto e il consumer non usarlo: la ricerca
   * globale aveva la rotta CABLATA, e nessuno se ne accorgeva. Queste prove
   * attraversano `GlobalSearchComponent` — digitazione, risultato, clic — e
   * guardano dove il router viene davvero mandato.
   *
   * ⚠️ **Un `SalesOrder` non è sempre un Ordine cliente.** Le origini sono tre e
   * solo `manual` è del gestionale: `online` e `pos` sono possedute dal canale e
   * restano in sola lettura (`regole-gestionale`, ownership dei dati).
   */
  /**
   * ⭐ **La ricerca globale porta un Ordine fornitore alla Modifica**, come il
   * clic sulla riga dell'elenco.
   *
   * ⛔ Qui la rotta era CABLATA a `/app/orders/${order.id}` — il Dettaglio —
   * mentre l'elenco apriva la Modifica: lo stesso ordine aveva due aperture a
   * seconda di dove lo si era trovato. Il commit `166e7cb` dichiarava la parità
   * già ottenuta perché `documentOpenPath` delegava al punto comune: vero per i
   * documenti che stanno in `documents`, **falso per i due ordini**, che una
   * riga lì non ce l'hanno mai e arrivano da una sorgente propria.
   */
  it('⭐ un Ordine fornitore si apre in MODIFICA, come dall’elenco', async () => {
    const { search, navigate } = await setup({ supplierOrders: [SUPPLIER_ORDER] });

    await search('of-2026');

    fireEvent.click(screen.getByRole('option', { name: /OF-2026-0042/ }));
    expect(navigate).toHaveBeenCalledWith(['/app/orders/po-1/edit'], { queryParams: {} });
  });

  describe('risultati Ordine cliente: la destinazione dipende dall’ORIGINE', () => {
    const ordine = (id: string, source: SalesOrderSource) => ({
      id,
      orderNumber: `OC-2026-${id}`,
      source,
      customerName: 'Rossi Moda SRL',
      placedAt: '2026-08-10',
    });

    it('⭐ origine MANUALE: apre la Modifica', async () => {
      const { search, navigate } = await setup({
        salesOrders: [ordine('so-1', SalesOrderSource.Manual)],
      });

      await search('oc-2026');

      fireEvent.click(screen.getByRole('option', { name: /OC-2026-so-1/ }));
      expect(navigate).toHaveBeenCalledWith(['/app/sales/so-1/edit'], { queryParams: {} });
    });

    it('⛔ origine ONLINE: sola lettura, e l’indirizzo non dice /edit', async () => {
      const { search, navigate } = await setup({
        salesOrders: [ordine('so-2', SalesOrderSource.Online)],
      });

      await search('oc-2026');

      fireEvent.click(screen.getByRole('option', { name: /OC-2026-so-2/ }));
      expect(navigate).toHaveBeenCalledWith(['/app/sales/so-2'], { queryParams: {} });
      expect(navigate.mock.calls[0]?.[0]?.[0]).not.toContain('/edit');
    });

    it('⛔ origine POS: identica all’online, mai la Modifica', async () => {
      const { search, navigate } = await setup({
        salesOrders: [ordine('so-3', SalesOrderSource.Pos)],
      });

      await search('oc-2026');

      fireEvent.click(screen.getByRole('option', { name: /OC-2026-so-3/ }));
      expect(navigate).toHaveBeenCalledWith(['/app/sales/so-3'], { queryParams: {} });
      expect(navigate.mock.calls[0]?.[0]?.[0]).not.toContain('/edit');
    });

    /**
     * ⚠️ L'errore vicino: `/app/sales/online/:id` appartiene alla **Vendita
     * online** (`OnlineSale`, documento interno generato dall'evasione), che non
     * è un Ordine di canale. Nessuna origine deve produrlo.
     *
     * ⚠️ Un `it` per origine, non un ciclo dentro uno solo: `TestBed` non si
     * riconfigura dopo il primo `render`.
     */
    it.each(Object.values(SalesOrderSource))(
      '⛔ origine %s: non produce il percorso della Vendita online',
      async (source) => {
        const { search, navigate } = await setup({ salesOrders: [ordine('so-4', source)] });

        await search('oc-2026');

        fireEvent.click(screen.getByRole('option', { name: /OC-2026-so-4/ }));
        expect(navigate.mock.calls[0]?.[0]?.[0]).not.toContain('/sales/online/');
      },
    );
  });
});
