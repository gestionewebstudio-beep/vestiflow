import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of, timer } from 'rxjs';
import { map } from 'rxjs/operators';
import { describe, expect, it, vi } from 'vitest';

import { PaymentOptionsService } from '@core/services/payment-options.service';
import type { CashOperationsPage } from '@domain/cash/models/cash.model';
import { CashApiService } from '@domain/cash/services/cash-api.service';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';

import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';

import { CASH_OPERATIONS_COLUMN_DEFS } from '../models/cash-register-columns.config';
import { CashOperationsComponent } from './cash-operations.component';

/**
 * ⚠️ **Il servizio vero delle preferenze colonne tira dietro `AuthService` e
 * `AUTH_GATEWAY`**, che con questo registro non c'entrano niente. Qui basta un
 * doppio che renda le colonne predefinite e non salvi nulla — la risoluzione
 * vera ha le sue prove, in `shared/`.
 */
const COLONNE_FINTE = {
  provide: TableColumnPreferenceService,
  useValue: {
    registerView: () => undefined,
    visibleColumns: () => signal(CASH_OPERATIONS_COLUMN_DEFS.map((c) => ({ ...c, pinned: false }))),
    columnWidth: (_v: unknown, _c: unknown, ripiego: number) => ripiego,
    setColumnWidths: () => undefined,
  },
};

/**
 * ⛔ **Ciò che queste prove falsificano**:
 *
 * ```text
 *   il riepilogo lo somma il browser     NO: arriva dal server, col filtro
 *   gli annullati spariscono             si vedono, e lo stato lo dice
 *   il reso si cerca per identificativo  si cerca per numero, articolo, cliente
 * ```
 */

const PAGINA: CashOperationsPage = {
  page: 1,
  pageSize: 100,
  total: 2,
  summary: {
    grossSalesMinor: 30_000,
    returnsMinor: 10_000,
    netSalesMinor: 20_000,
    cashMinor: 12_000,
    electronicMinor: 8_000,
    saleCount: 2,
    returnCount: 1,
    operationCount: 3,
    averageMinor: 6_666,
  },
  items: [
    {
      id: 'd1',
      kind: 'sale',
      reference: 'CS/2026/1',
      documentDate: '2026-09-04T00:00:00.000Z',
      createdAt: '2026-09-04T10:00:00.000Z',
      status: 'confirmed',
      locationId: 'loc1',
      locationName: 'Negozio A',
      operatorId: 'u1',
      operatorName: 'Anna',
      sessionId: 's1',
      customerName: null,
      totalMinor: 20_000,
      payments: [
        {
          paymentOptionId: 'c1',
          optionName: 'Contanti',
          tenderKind: 'cash',
          amountMinor: 20_000,
          tenderedMinor: 20_000,
          refundedFromPaymentId: null,
        },
      ],
      mixed: false,
      changeMinor: 0,
      sourceDocumentId: null,
      sourceReference: null,
      anomalies: [],
    },
    {
      id: 'd2',
      kind: 'sale',
      reference: 'CS/2026/2',
      documentDate: '2026-09-04T00:00:00.000Z',
      createdAt: '2026-09-04T11:00:00.000Z',
      status: 'cancelled',
      locationId: 'loc1',
      locationName: 'Negozio A',
      operatorId: 'u1',
      operatorName: 'Anna',
      sessionId: 's1',
      customerName: null,
      totalMinor: 5_000,
      payments: [],
      mixed: false,
      changeMinor: 0,
      sourceDocumentId: null,
      sourceReference: null,
      anomalies: ['annullato'],
    },
  ],
};

/** La stessa pagina con una riga sola: serve a distinguere i due esiti. */
const SOLO_UNA: CashOperationsPage = {
  ...PAGINA,
  total: 1,
  items: [PAGINA.items[0]!],
};

async function montaOperazioni(operations = vi.fn(() => of(PAGINA))) {
  const api = { operations, searchReceipts: vi.fn(() => of([])) };
  const vista = await render(CashOperationsComponent, {
    providers: [
      provideRouter([]),
      { provide: CashApiService, useValue: api },
      { provide: OperationalLocationsService, useValue: { locations: () => [] } },
      { provide: PaymentOptionsService, useValue: { list: () => of([]) } },
      COLONNE_FINTE,
    ],
  });
  return { ...vista, api };
}

describe('CashOperationsComponent', () => {
  it('il riepilogo è quello del SERVER, non una somma delle righe', async () => {
    await montaOperazioni();

    // ⭐ 300,00 lorde e 200,00 nette: le due righe a schermo sommerebbero
    //    altro, perché una è annullata e i resi non sono nell'elenco.
    expect(screen.getByText('3 operazioni')).toBeVisible();
    expect(screen.getByText('300,00 €')).toBeVisible();
    // ⚠️ 200,00 compare due volte — netto e riga: si conta.
    expect(screen.getAllByText('200,00 €').length).toBeGreaterThan(0);
    expect(screen.getByText('Vendite nette')).toBeVisible();
  });

  it('un_operazione ANNULLATA si vede, con il suo stato', async () => {
    await montaOperazioni();

    // ⚠️ **Due volte nel DOM, e non e` un difetto**: il motore rende la riga di
    //    tabella E la card, e sotto `lg` ne nasconde una. La card porta
    //    `aria-hidden`, quindi ai lettori di schermo il dato resta uno solo.
    expect(screen.getAllByText('CS/2026/2').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Annullato').length).toBeGreaterThan(0);
  });

  it('dice che gli annullati non entrano nei totali', async () => {
    const { container } = await montaOperazioni();

    expect(container.textContent).toMatch(/non entrano nei totali/);
  });

  it('non promette nessuna fiscalizzazione avvenuta', async () => {
    const { container } = await montaOperazioni();

    const testo = container.textContent ?? '';
    expect(testo).toMatch(/Fiscalizzazione non ancora disponibile|fiscalizzazione non è ancora/i);
    expect(testo).not.toMatch(/scontrino emesso/i);
    expect(testo).not.toMatch(/trasmess/i);
  });

  /*
    ⛔ **Questa prova nasce da una REGRESSIONE, non da un requisito nuovo.**

    Migrando il registro al telaio comune ho tolto la testata scritta a mano —
    e con lei i tre collegamenti fra Vendita, Operazioni e Sessioni. Nessuna
    prova di componente se ne e` accorta: compilava, il lint passava, e le due
    schermate si aprivano benissimo. L_ha trovata `e2e/cassa.spec.ts` («le tre
    aree si raggiungono l_una dall_altra»), che pero` gira solo su richiesta.

    ⭐ La navigazione ora vive in `app-nav-tabs`, nella casella `[tabs]` del
    telaio. Questa prova la tiene ferma dove costa meno accorgersene.
  */
  it('le tre aree della Cassa restano raggiungibili', async () => {
    await montaOperazioni();

    for (const area of ['Vendita', 'Operazioni', 'Sessioni']) {
      expect(screen.getByRole('link', { name: area })).toBeVisible();
    }
  });

  /*
    ⛔ **LA RISPOSTA LENTA DI UN FILTRO VECCHIO NON DEVE VINCERE.**

    `carica()` apriva una sottoscrizione nuova a ogni cambio di filtro senza
    chiudere la precedente: con due richieste in volo a vincere era **l_ultima
    che tornava**, non l_ultima chiesta. Un filtro largo seguito da uno
    stretto lasciava a schermo il risultato largo.

    ⚠️ **Non falliva: mostrava di piu`.** E` la stessa famiglia del filtro
    perso — un difetto che si vede solo se lo si va a cercare.
  */
  it('⛔ la risposta LENTA di un filtro precedente non sovrascrive quello corrente', async () => {
    // La prima chiamata (nessun filtro) e` LENTA; la seconda (filtrata) veloce.
    let chiamata = 0;
    const operations = vi.fn(() => {
      chiamata += 1;
      const primo = chiamata === 1;
      return timer(primo ? 200 : 0).pipe(map(() => (primo ? PAGINA : SOLO_UNA)));
    });

    const { fixture } = await montaOperazioni(operations);

    // Si cambia filtro subito: parte la seconda richiesta.
    fixture.componentInstance['soloAnomalie'].set(true);
    fixture.detectChanges();

    // Si aspetta oltre il ritardo della PRIMA, che arriverebbe dopo.
    await new Promise((r) => setTimeout(r, 400));
    fixture.detectChanges();

    // ⛔ Se la prima vincesse, a schermo ci sarebbero due righe.
    expect(screen.queryByText('CS/2026/2')).toBeNull();
    expect(screen.getAllByText('CS/2026/1').length).toBeGreaterThan(0);
  });

  it('il richiamo scontrino non chiede nessun identificativo', async () => {
    await montaOperazioni();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Richiama scontrino' }));

    // ⛔ Il campo parla di numero, articolo e cliente: mai di UUID o id.
    expect(screen.getByText('Numero, articolo o cliente')).toBeInTheDocument();
  });
});
