import { Router, provideRouter } from '@angular/router';
import { fireEvent, render, screen, waitFor } from '@testing-library/angular';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DocumentStatus, DocumentType } from '@core/models/document.model';
import { CustomerService } from '@domain/customers/services/customer.service';
import { DocumentService } from '@domain/documents/services/document.service';
import { ProductService } from '@domain/products/services/product.service';
import { SalesOrderService } from '@domain/sales-orders/services/sales-order.service';
import { SupplierOrderService } from '@domain/supplier-orders/services/supplier-order.service';
import { SupplierService } from '@domain/suppliers/services/supplier.service';
import type { NavSection } from '@shared/models/nav-item.model';

import { GlobalSearchComponent } from './global-search.component';

const FULL_NAV: readonly NavSection[] = [
  {
    id: 'main',
    items: [
      { label: 'Prodotti', icon: 'pi-tags', route: '/app/products' },
      { label: 'Fornitori', icon: 'pi-building', route: '/app/suppliers' },
      { label: 'Documenti', icon: 'pi-file', route: '/app/documents' },
      { label: 'Clienti', icon: 'pi-users', route: '/app/customers' },
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
  }) {
    const getProducts = vi.fn(() => of(paginated([])));
    const getCustomers = vi.fn(() => of(paginated(options?.customers ?? [])));
    const getDocuments = vi.fn(() => of(paginated(options?.documents ?? [])));
    const list = vi.fn(() => of(paginated(options?.suppliers ?? [])));
    const getSupplierOrders = vi.fn(() => of(paginated(options?.supplierOrders ?? [])));
    const getSalesOrders = vi.fn(() => of(paginated([])));

    const rendered = await render(GlobalSearchComponent, {
      componentInputs: {
        open: true,
        navSections: options?.navSections ?? FULL_NAV,
      },
      providers: [
        provideRouter([]),
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

  it('un documento mostra riferimento e tipo, e apre la rotta dedicata del suo tipo', async () => {
    const { search, navigate } = await setup({ documents: [QUOTE_DOC] });

    await search('pre-2026');

    const option = screen.getByRole('option', { name: /PRE-2026-0007/ });
    expect(option).toHaveTextContent('Preventivo');
    fireEvent.click(option);
    expect(navigate).toHaveBeenCalledWith(['/app/documents/quote/doc-9'], { queryParams: {} });
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
});
