import { Router, ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { APP_CONFIG } from '@core/config/app-config.token';
import { AuthService } from '@core/auth';
import { SupplierOrderStatus } from '@core/models/supplier-order.model';
import type { SupplierOrder } from '@core/models/supplier-order.model';
import { UserRole } from '@core/models/user.model';
import { DEFAULT_CURRENCY } from '@core/utils/money.util';
import { SupplierOrderService } from '@domain/supplier-orders/services/supplier-order.service';
import type { ListAction } from '@shared/models/list-selection.model';

import { SupplierOrderListComponent } from './supplier-order-list.component';

const ZERO = { amountMinor: 0, currencyCode: DEFAULT_CURRENCY };

const ORDINE: SupplierOrder = {
  id: 'ord-1',
  tenantId: 'ten-1',
  createdAt: '2026-08-20T08:00:00.000Z',
  updatedAt: '2026-08-20T08:00:00.000Z',
  reference: 'OF-2026-0042',
  supplierId: 'sup-1',
  supplierName: 'Fornitore di prova',
  status: SupplierOrderStatus.Confirmed,
  currency: DEFAULT_CURRENCY,
  costEntryMode: 'vat_excluded',
  orderDate: '2026-08-20',
  lines: [],
  subtotal: ZERO,
  tax: ZERO,
  totalAmount: ZERO,
};

async function renderList(ordini: readonly SupplierOrder[] = []) {
  return render(SupplierOrderListComponent, {
    providers: [
      provideRouter([]),
      // ⚠️ Serve da quando l'elenco ha il selettore Colonne (30/08/2026): le
      //    preferenze passano da un servizio che legge la configurazione.
      {
        provide: APP_CONFIG,
        useValue: {
          production: false,
          appName: 'VestiFlow',
          apiBaseUrl: '',
          features: { barcodeScanner: false, shopify: false },
        },
      },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { queryParamMap: convertToParamMap({}) },
          queryParamMap: of(convertToParamMap({})),
        },
      },
      {
        provide: AuthService,
        useValue: { currentUser: () => ({ role: UserRole.Owner, permissions: [] }) },
      },
      {
        provide: SupplierOrderService,
        useValue: {
          getSupplierOrders: () =>
            of({
              data: ordini,
              meta: {
                page: 1,
                pageSize: 20,
                total: ordini.length,
                totalPages: ordini.length > 0 ? 1 : 0,
              },
            }),
          exportExcel: vi.fn(),
        },
      },
    ],
  });
}

function azione(
  view: { fixture: { componentInstance: unknown } },
  id: string,
): ListAction | undefined {
  const component = view.fixture.componentInstance as {
    selectionActions: () => readonly ListAction[];
  };
  return component.selectionActions().find((candidata) => candidata.id === id);
}

/**
 * ⛔ **La riga si renderizza.** È la stessa guardia dell'elenco documenti, e sta
 * qui perché il difetto che la motiva è di categoria, non di pagina: il motore
 * riceve le callback come valori, e una passata per nome arriva senza `this`.
 * Un elenco i cui test rendono zero righe non se ne accorge (`14` §H14).
 */
describe('SupplierOrderListComponent — una riga vera si renderizza', () => {
  it('la riga porta il proprio nome accessibile', async () => {
    await renderList([ORDINE]);

    expect(screen.getByRole('row', { name: /Apri ordine OF-2026-0042/i })).not.toBeNull();
  });
});

/**
 * ⭐ Il **Dettaglio** (`14` §6, §E6): qui la destinazione esiste da sempre —
 * `orders/:id`, titolo «Dettaglio ordine fornitore», protetta dai soli permessi
 * di vista — e mancava soltanto il comando che ci porta.
 */
describe('SupplierOrderListComponent — l’azione Dettaglio', () => {
  it('la barra la dichiara, e pretende UN ordine', async () => {
    const view = await renderList();

    expect(azione(view, 'detail')?.label).toBe('Dettaglio');
    expect(azione(view, 'detail')?.requires).toBe('one');
  });

  it('apre la rotta di dettaglio dell’ordine scelto', async () => {
    const view = await renderList([ORDINE]);
    const navigazione = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    azione(view, 'detail')?.run?.({ scope: 'selection', ids: ['ord-1'] });

    expect(navigazione).toHaveBeenCalledWith(['/app/orders', 'ord-1']);
  });

  it('col bersaglio «filtered» non naviga da nessuna parte', async () => {
    const view = await renderList([ORDINE]);
    const navigazione = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    azione(view, 'detail')?.run?.({ scope: 'filtered' });

    expect(navigazione).not.toHaveBeenCalled();
  });
});

/**
 * L'ordinamento (`14` §H15): stessa grammatica dell'elenco documenti, altra
 * whitelist — qui «Fornitore» si ordina, perché la controparte è un campo solo.
 */
describe('SupplierOrderListComponent — l’ordinamento', () => {
  function pagina(view: { fixture: { componentInstance: unknown } }) {
    return view.fixture.componentInstance as {
      onSortChange: (chiavi: readonly { columnId: string; direction: string }[]) => void;
      tableColumns: () => readonly { readonly id: string; readonly sortable?: boolean }[];
    };
  }

  it('⛔ cambiare ordine riporta alla prima pagina', async () => {
    const view = await renderList([ORDINE]);
    const navigazione = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    pagina(view).onSortChange([{ columnId: 'supplier', direction: 'asc' }]);

    expect(navigazione).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: { sort: 'supplier:asc', page: null } }),
    );
  });

  it('⭐ «Stato» è ordinabile: l’enum del database porta il ciclo di vita', async () => {
    const view = await renderList();
    // ⚠️ `tableColumns` è un signal dal 30/08/2026: le colonne vengono dalle
    //    preferenze, non più da un array cablato nel componente.
    const stato = pagina(view)
      .tableColumns()
      .find((colonna) => colonna.id === 'status');

    // L'unica colonna che l'API non sa ordinare, qui, non esiste:
    // `sortable` non dichiarato significa ordinabile.
    expect(stato?.sortable).toBeUndefined();
  });

  /**
   * ⛔ **La tendina «Periodo» non offre due volte la stessa parola** — 24/08/2026.
   *
   * `select-menu` disegna una voce vuota etichettata col SEGNAPOSTO, e qui il
   * segnaposto era «Ultimi 30 giorni» — che e' gia' una delle scelte vere. Due
   * righe con le stesse parole, ma **effetti opposti**: una imposta il preset,
   * l'altra AZZERA il filtro.
   *
   * ⭐ **L'azione di azzeramento non e' stata rinominata: esisteva gia'.**
   * `periodOptions` comincia con `{ All, 'Tutti' }`, che e' il lessico dei
   * filtri VestiFlow (47 segnaposti «Tutti», 18 «Tutte»). La riga di troppo era
   * quella vuota, non la sua etichetta.
   *
   * ⚠️ Il gemello stretto e' il filtro periodo dei **Movimenti di magazzino**:
   * stesse voci, stessa `ariaLabel`, e li' `includeEmptyOption` e' spento e il
   * segnaposto e' «Periodo». Questo elenco era l'unico dei sei a divergere.
   */
  describe('il filtro Periodo non ripete una voce', () => {
    function vociDelPannello(): string[] {
      return screen
        .getAllByRole('option')
        .map((voce) => voce.getAttribute('aria-label') ?? voce.textContent ?? '')
        .map((nome) => nome.replace(/\s+/g, ' ').trim());
    }

    it('⛔ «Ultimi 30 giorni» compare UNA volta sola', async () => {
      const user = userEvent.setup();
      await renderList([ORDINE]);

      await user.click(screen.getByLabelText('Filtra per periodo'));

      expect(vociDelPannello().filter((nome) => nome === 'Ultimi 30 giorni')).toHaveLength(1);
    });

    it('⭐ e ad azzerare il filtro ci pensa «Tutti», che ha un nome suo', async () => {
      const user = userEvent.setup();
      await renderList([ORDINE]);

      await user.click(screen.getByLabelText('Filtra per periodo'));

      // L'uguaglianza, non un `toContain`: una riga in piu' si vede anche se
      // portasse un'etichetta che oggi non immaginiamo.
      expect(vociDelPannello()).toEqual([
        'Tutti',
        'Ultimi 7 giorni',
        'Ultimi 30 giorni',
        'Mese corrente',
        'Mese scorso',
        'Anno corrente',
        'Anno scorso',
      ]);
    });
  });
});
