import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import type { CashCloseResult, CashSessionDetail } from '@domain/cash/models/cash.model';
import { CashApiService } from '@domain/cash/services/cash-api.service';

import { CashClosingComponent } from './cash-closing.component';

/**
 * ⛔ **La prova che la chiusura è CIECA.**
 *
 * Prima della conferma la schermata non deve contenere nessun atteso: né il
 * numero, né l'etichetta. Un conteggio fatto sapendo il risultato non è un
 * conteggio, e questa è l'unica prova che lo tiene fermo a schermo.
 */

const SESSIONE: CashSessionDetail = {
  id: 's1',
  status: 'open',
  locationId: 'loc1',
  locationName: 'Negozio A',
  openedAt: '2026-09-04T08:00:00.000Z',
  openedByName: 'Anna',
  closedAt: null,
  closedByName: null,
  openingFloatMinor: 5_000,
  fiscalDeviceId: null,
  fiscalDeviceLabel: null,
  notes: null,
  // ⛔ È `null` perché la sessione è aperta: gli attesi non esistono ancora.
  frozen: null,
  breakdown: null,
  breakdownMatchesFrozen: null,
  movements: [],
  documents: [],
  deviceChanges: [],
};

const ESITO: CashCloseResult = {
  session: { id: 's1' } as CashCloseResult['session'],
  openingFloatMinor: 5_000,
  salesCashMinor: 10_000,
  returnsCashMinor: 0,
  salesElectronicMinor: 0,
  returnsElectronicMinor: 0,
  depositsMinor: 0,
  withdrawalsMinor: 0,
  expectedCashMinor: 15_000,
  expectedElectronicMinor: 0,
  countedCashMinor: 14_500,
  declaredElectronicMinor: null,
  cashDifferenceMinor: -500,
  electronicDifferenceMinor: null,
};

async function montaChiusura(close = vi.fn(() => of(ESITO))) {
  const api = {
    session: vi.fn(() => of(SESSIONE)),
    close,
  };
  const vista = await render(CashClosingComponent, {
    providers: [
      provideRouter([{ path: '**', component: CashClosingComponent }]),
      { provide: CashApiService, useValue: api },
      // ⚠️ Senza il parametro di rotta la schermata non carica niente: la
      //    prova girerebbe su una pagina vuota e passerebbe per nulla.
      {
        provide: ActivatedRoute,
        useValue: { paramMap: of(convertToParamMap({ id: 's1' })) },
      },
    ],
  });
  return { ...vista, api };
}

describe('CashClosingComponent', () => {
  it('PRIMA della conferma non mostra nessun atteso', async () => {
    await montaChiusura();

    expect(screen.getByText('Conta il cassetto')).toBeVisible();
    // ⛔ Nessuna etichetta di atteso, e nessun numero atteso.
    expect(screen.queryByText('Contante atteso')).toBeNull();
    expect(screen.queryByText('150,00 €')).toBeNull();
    expect(screen.queryByText('Differenza')).toBeNull();
  });

  it('dopo la conferma mostra i valori del SERVER, non i propri', async () => {
    const { api } = await montaChiusura();
    const utente = userEvent.setup();

    await utente.type(screen.getByLabelText('Contante contato nel cassetto'), '145');
    await utente.click(screen.getByRole('button', { name: 'Chiudi la cassa' }));

    expect(api.close).toHaveBeenCalledTimes(1);
    // ⭐ SOLO ORA gli attesi compaiono.
    expect(screen.getByText('Cassa chiusa')).toBeVisible();
    expect(screen.getByText('Contante atteso')).toBeVisible();
    expect(screen.getByText('150,00 €')).toBeVisible();
    expect(screen.getByText('-5,00 €')).toBeVisible();
  });

  it("l'elettronico è FACOLTATIVO: senza spunta si manda `null`", async () => {
    const close = vi.fn(() => of(ESITO));
    await montaChiusura(close);
    const utente = userEvent.setup();

    await utente.type(screen.getByLabelText('Contante contato nel cassetto'), '145');
    await utente.click(screen.getByRole('button', { name: 'Chiudi la cassa' }));

    expect(close).toHaveBeenCalledWith(
      'loc1',
      's1',
      expect.objectContaining({ declaredElectronicMinor: null }),
    );
    // ⭐ E l'esito lo dice a parole, invece di mostrare uno zero.
    expect(screen.getByText('non riconciliato')).toBeVisible();
  });

  it('senza contante contato il pulsante non si preme', async () => {
    await montaChiusura();

    expect(screen.getByRole('button', { name: 'Chiudi la cassa' })).toBeDisabled();
  });

  it('non promette nessuna fiscalizzazione', async () => {
    const { container } = await montaChiusura();

    const testo = container.textContent ?? '';
    expect(testo).not.toMatch(/scontrino emesso/i);
    expect(testo).not.toMatch(/Agenzia/i);
    expect(testo).not.toMatch(/trasmess/i);
  });
});
