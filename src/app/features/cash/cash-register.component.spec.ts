import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';
import type { PaymentOption } from '@core/models/payment-option.model';
import { PaymentOptionsService } from '@core/services/payment-options.service';
import type { CashSessionState } from '@domain/cash/models/cash.model';
import { CashApiService } from '@domain/cash/services/cash-api.service';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import { StoreSalesService } from '@domain/store-sales/services/store-sales.service';

import { CashRegisterComponent } from './cash-register.component';

/**
 * ⛔ **Ciò che queste prove falsificano**:
 *
 * ```text
 *   senza sessione si vende            NO: si dice cosa manca e si offre il gesto
 *   la vendita dice «scontrino emesso» NO: «registrata», e la fiscalizzazione manca
 *   il totale mostrato e` quello locale dopo la conferma e` quello del SERVER
 *   un errore lascia il carrello a meta` no: si dice, e le righe restano
 * ```
 */

const SEDE = { id: 'loc1', name: 'Negozio A' };

const APERTA: CashSessionState = {
  session: {
    id: 's1',
    tenantId: 't1',
    locationId: 'loc1',
    status: 'open',
    openedAt: '2026-09-04T08:00:00.000Z',
    openedById: 'u1',
    openedByName: 'Anna',
    openingFloatMinor: 5_000,
    closedAt: null,
    closedByName: null,
    fiscalDeviceId: null,
    notes: null,
    countedCashMinor: null,
    declaredElectronicMinor: null,
    expectedCashMinor: null,
    expectedElectronicMinor: null,
  },
  depositsMinor: 0,
  withdrawalsMinor: 0,
};

const CHIUSA: CashSessionState = { session: null, depositsMinor: 0, withdrawalsMinor: 0 };

const CONTANTI = {
  id: 'c1',
  name: 'Contanti',
  kind: 'method',
  isActive: true,
  sortOrder: 1,
  tenderKind: 'cash',
} as PaymentOption;

const ARTICOLO = {
  variantId: 'v1',
  sku: 'SKU-1',
  barcode: '800',
  productName: 'Maglia cotone',
  optionSummary: 'M · Rosso',
  sellingPriceMinor: 10_000,
  currency: 'EUR',
  vatRatePercent: 22,
  vatCodeId: 'iva22',
  vatCodeLabel: 'IVA 22%',
  onHand: 5,
  committed: 0,
  available: 5,
};

async function montaCassa(opzioni?: {
  stato?: CashSessionState;
  checkout?: ReturnType<typeof vi.fn>;
}) {
  const api = {
    current: vi.fn(() => of(opzioni?.stato ?? APERTA)),
    open: vi.fn(() => of(APERTA.session)),
    checkout:
      opzioni?.checkout ??
      vi.fn(() =>
        of({ documentId: 'd1', reference: 'CS/2026/1', totalMinor: 10_000, changeMinor: 500 }),
      ),
  };
  const catalogo = { lookupItems: vi.fn(() => of([ARTICOLO])) };
  const vista = await render(CashRegisterComponent, {
    providers: [
      provideRouter([]),
      { provide: CashApiService, useValue: api },
      { provide: StoreSalesService, useValue: catalogo },
      {
        provide: OperationalLocationsService,
        useValue: { locations: () => [SEDE], defaultLocation: () => SEDE },
      },
      { provide: PaymentOptionsService, useValue: { list: () => of([CONTANTI]) } },
      {
        provide: AuthService,
        useValue: { currentUser: () => ({ id: 'u1', tenantId: 't1', displayName: 'Anna' }) },
      },
    ],
  });
  return { ...vista, api, catalogo };
}

describe('CashRegisterComponent', () => {
  beforeEach(() => sessionStorage.clear());
  it('senza sessione aperta dice cosa manca e offre il gesto', async () => {
    await montaCassa({ stato: CHIUSA });

    expect(screen.getByText('Nessuna sessione aperta')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Apri la cassa' })).toBeVisible();
    // ⛔ E non offre di vendere.
    expect(screen.queryByRole('button', { name: 'Concludi vendita' })).toBeNull();
  });

  it('con sessione aperta mostra insieme ricerca, carrello e incasso', async () => {
    await montaCassa();

    expect(screen.getByText('Articoli')).toBeVisible();
    expect(screen.getByText('Carrello')).toBeVisible();
    expect(screen.getByText('Incasso')).toBeVisible();
  });

  it('un articolo cercato entra nel carrello e alimenta il totale', async () => {
    await montaCassa();
    const utente = userEvent.setup();

    await utente.type(screen.getByLabelText(/Cerca per codice/), 'maglia');
    await utente.click(screen.getByRole('button', { name: 'Cerca' }));
    await utente.click(screen.getByRole('button', { name: /^Maglia cotone/ }));

    // ⚠️ «Totale» compare due volte — intestazione di colonna e riepilogo
    //    dell'incasso: si conta, non si cerca l'unico.
    expect(screen.getAllByText('Totale').length).toBeGreaterThan(1);
    expect(screen.getAllByText('100,00 €').length).toBeGreaterThan(0);
  });

  it('la vendita conclusa dice REGISTRATA, e che la fiscalizzazione non c_e`', async () => {
    const { container } = await montaCassa();
    const utente = userEvent.setup();

    await utente.type(screen.getByLabelText(/Cerca per codice/), 'maglia');
    await utente.click(screen.getByRole('button', { name: 'Cerca' }));
    await utente.click(screen.getByRole('button', { name: /^Maglia cotone/ }));
    await utente.click(screen.getByRole('button', { name: 'Contanti' }));
    await utente.click(screen.getByRole('button', { name: 'Concludi vendita' }));

    expect(screen.getByText('Vendita registrata')).toBeVisible();
    expect(screen.getByText('CS/2026/1')).toBeVisible();
    // ⭐ Il RESTO è quello del server: 5,00, non quello calcolato a schermo.
    expect(screen.getByText('5,00 €')).toBeVisible();
    // ⛔ Nessuna parola che faccia credere avvenuta la fiscalizzazione.
    const testo = container.textContent ?? '';
    expect(testo).toMatch(/Fiscalizzazione non ancora disponibile/);
    expect(testo).not.toMatch(/scontrino emesso/i);
    expect(testo).not.toMatch(/Agenzia/i);
  });

  it('un errore alla conclusione si dice, e non svuota il carrello', async () => {
    const checkout = vi.fn(() =>
      throwError(() => ({ error: { message: 'Sessione di cassa già chiusa.' } })),
    );
    await montaCassa({ checkout });
    const utente = userEvent.setup();

    await utente.type(screen.getByLabelText(/Cerca per codice/), 'maglia');
    await utente.click(screen.getByRole('button', { name: 'Cerca' }));
    await utente.click(screen.getByRole('button', { name: /^Maglia cotone/ }));
    await utente.click(screen.getByRole('button', { name: 'Contanti' }));
    await utente.click(screen.getByRole('button', { name: 'Concludi vendita' }));

    expect(screen.getByText('Sessione di cassa già chiusa.')).toBeVisible();
    // ⭐ Il carrello resta: si riprova, non si ricomincia.
    expect(screen.getByText('Maglia cotone')).toBeVisible();
  });

  it('risposta persa: conserva contenuto e intento nonostante modifiche al carrello', async () => {
    const checkout = vi
      .fn<CashApiService['checkout']>()
      .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })))
      .mockReturnValue(
        of({ documentId: 'd1', reference: 'CS/2026/1', totalMinor: 10_000, changeMinor: 0 }),
      );
    const { fixture } = await montaCassa({ checkout });
    const utente = userEvent.setup();
    await preparaVendita(utente);
    await utente.click(screen.getByRole('button', { name: 'Concludi vendita' }));
    const originale = structuredClone(checkout.mock.calls[0]![0]);
    expect(sessionStorage.length).toBe(1);
    expect(screen.getByText('Esito da verificare')).toBeVisible();
    // L'operatore può continuare a preparare il carrello; questo non cambia il comando conservato.
    await utente.type(screen.getByLabelText(/Cerca per codice/), 'maglia');
    await utente.click(screen.getByRole('button', { name: 'Cerca' }));
    await utente.click(screen.getByRole('button', { name: /^Maglia cotone/ }));
    expect(screen.getByRole('button', { name: 'Concludi vendita' })).toBeDisabled();
    await utente.click(screen.getByRole('button', { name: "Recupera l'esito" }));
    expect(checkout.mock.calls[1]![0]).toEqual(originale);
    expect(screen.getByText('Vendita registrata')).toBeVisible();
    expect(sessionStorage.length).toBe(0);
    await utente.click(screen.getByRole('button', { name: 'Riprendi carrello modificato' }));
    fixture.detectChanges();
    expect(screen.getAllByText('200,00 €').length).toBeGreaterThan(0);
    expect(checkout).toHaveBeenCalledTimes(2);
  });

  it('navigazione e sessione chiusa: recupera il comando conservato senza ricostruire il carrello', async () => {
    const checkout = vi
      .fn<CashApiService['checkout']>()
      .mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    const vista = await montaCassa({ checkout });
    const utente = userEvent.setup();
    await preparaVendita(utente);
    await utente.click(screen.getByRole('button', { name: 'Concludi vendita' }));
    const originale = structuredClone(checkout.mock.calls[0]![0]);
    vista.fixture.destroy();
    vista.container.remove();
    TestBed.resetTestingModule();
    const seconda = await montaCassa({ stato: CHIUSA });
    await utente.click(screen.getByRole('button', { name: "Recupera l'esito" }));
    expect(seconda.api.checkout.mock.calls[0]![0]).toEqual(originale);
    expect(screen.getByText('Vendita registrata')).toBeVisible();
    expect(sessionStorage.length).toBe(0);
  });

  it('un rifiuto certo al primo invio consente la correzione e un nuovo intento', async () => {
    const checkout = vi
      .fn<CashApiService['checkout']>()
      .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 422 })))
      .mockReturnValue(
        of({ documentId: 'd1', reference: 'CS/2026/1', totalMinor: 10_000, changeMinor: 0 }),
      );
    await montaCassa({ checkout });
    const utente = userEvent.setup();
    await preparaVendita(utente);
    await utente.click(screen.getByRole('button', { name: 'Concludi vendita' }));
    expect(sessionStorage.length).toBe(0);
    await utente.click(screen.getByRole('button', { name: 'Concludi vendita' }));
    expect(checkout.mock.calls[1]![0].creationIntentId).not.toBe(
      checkout.mock.calls[0]![0].creationIntentId,
    );
  });
});

async function preparaVendita(utente: ReturnType<typeof userEvent.setup>) {
  await utente.type(screen.getByLabelText(/Cerca per codice/), 'maglia');
  await utente.click(screen.getByRole('button', { name: 'Cerca' }));
  await utente.click(screen.getByRole('button', { name: /^Maglia cotone/ }));
  await utente.click(screen.getByRole('button', { name: 'Contanti' }));
}
