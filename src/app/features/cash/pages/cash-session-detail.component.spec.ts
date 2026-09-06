import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';
import { TenantPermission } from '@core/models/tenant-permission.model';
import type { CashSessionDetail } from '@domain/cash/models/cash.model';
import { CashApiService } from '@domain/cash/services/cash-api.service';

import { CashSessionDetailComponent } from './cash-session-detail.component';

/**
 * ⛔ **La prova che l'interfaccia non offre ciò che l'API rifiuterebbe.**
 *
 * Un'azione mostrata a chi non ha il permesso non è un difetto estetico: è un
 * errore che l'operatore scopre solo dopo averla premuta, e a quel punto non sa
 * se ha sbagliato lui o il programma.
 */

const APERTA: CashSessionDetail = {
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
  frozen: null,
  breakdown: {
    openingFloatMinor: 5_000,
    salesCashMinor: 10_000,
    returnsCashMinor: 0,
    salesElectronicMinor: 0,
    returnsElectronicMinor: 0,
    depositsMinor: 0,
    withdrawalsMinor: 0,
    expectedCashMinor: 15_000,
    expectedElectronicMinor: 0,
  },
  breakdownMatchesFrozen: null,
  movements: [],
  documents: [],
  deviceChanges: [],
};

const CHIUSA: CashSessionDetail = {
  ...APERTA,
  status: 'closed',
  closedAt: '2026-09-04T20:00:00.000Z',
  closedByName: 'Anna',
  frozen: {
    expectedCashMinor: 15_000,
    expectedElectronicMinor: 0,
    countedCashMinor: 14_500,
    declaredElectronicMinor: null,
    cashDifferenceMinor: -500,
    electronicDifferenceMinor: null,
  },
  breakdownMatchesFrozen: false,
};

async function montaSessione(opzioni?: {
  sessione?: CashSessionDetail;
  permessi?: readonly string[];
}) {
  const api = {
    session: vi.fn(() => of(opzioni?.sessione ?? APERTA)),
    addMovement: vi.fn(() => of({})),
  };
  const vista = await render(CashSessionDetailComponent, {
    providers: [
      provideRouter([]),
      { provide: CashApiService, useValue: api },
      { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: 's1' })) } },
      {
        provide: AuthService,
        useValue: {
          currentUser: () => ({
            permissions: opzioni?.permessi ?? [],
            role: 'clerk',
            hasAllLocationsAccess: false,
            assignedLocationIds: ['loc1'],
          }),
        },
      },
    ],
  });
  return { ...vista, api };
}

describe('CashSessionDetailComponent', () => {
  it('senza `retail.cash_drawer` il cassetto non si muove', async () => {
    await montaSessione();

    expect(screen.getByText('Cassetto')).toBeVisible();
    // ⛔ Nessun modulo per versare o prelevare.
    expect(screen.queryByRole('button', { name: 'Registra' })).toBeNull();
  });

  it('con `retail.cash_drawer` il modulo compare', async () => {
    await montaSessione({ permessi: [TenantPermission.RetailCashDrawer] });

    expect(screen.getByRole('button', { name: 'Registra' })).toBeVisible();
  });

  it('senza `retail.cash_session` non si offre di chiudere', async () => {
    await montaSessione();

    expect(screen.queryByText('Chiudi la cassa')).toBeNull();
  });

  it('con `retail.cash_session` la chiusura si raggiunge', async () => {
    await montaSessione({ permessi: [TenantPermission.RetailCashSession] });

    expect(screen.getByText('Chiudi la cassa')).toBeVisible();
  });

  it('a sessione APERTA dice che gli attesi non esistono ancora', async () => {
    const { container } = await montaSessione();

    expect(container.textContent).toMatch(/gli attesi non esistono ancora/);
    expect(screen.queryByText('Contante contato')).toBeNull();
  });

  it('a sessione CHIUSA mostra i congelati, e dichiara se non tornano più', async () => {
    const { container } = await montaSessione({ sessione: CHIUSA });

    expect(screen.getByText('Contante atteso')).toBeVisible();
    expect(screen.getByText('-5,00 €')).toBeVisible();
    // ⭐ La ricostruzione non coincide: si dice, invece di mostrare due numeri
    //    diversi senza spiegazione.
    expect(container.textContent).toMatch(/non coincidono più/);
  });
});
