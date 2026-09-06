import { provideRouter } from '@angular/router';
import { fireEvent, render, screen } from '@testing-library/angular';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';
import type { PaymentMethodCode, PaymentOption } from '@core/models/payment-option.model';
import { TenantChannelProfile } from '@core/models/tenant-channel-profile.model';
import { TenantPermission } from '@core/models/tenant-permission.model';
import type { TenantPermissionKey } from '@core/models/tenant-permission.model';
import type { User } from '@core/models/user.model';
import { UserRole } from '@core/models/user.model';
import { PaymentOptionsService } from '@core/services/payment-options.service';
import { ToastService } from '@core/services/toast.service';

import { PaymentOptionsPageComponent } from './payment-options-page.component';

/**
 * La sezione Impostazioni apre questa pagina, ma le scritture sulle voci
 * pagamento le riserva `settings.company`: senza quel permesso l'API risponde
 * 403, quindi i comandi non devono nemmeno comparire.
 */
const CONTANTI: PaymentOption = {
  id: 'po-1',
  tenantId: 't1',
  kind: 'method',
  name: 'Contanti',
  sortOrder: 1,
  isSystem: true,
  isActive: true,
  // Nessuna Modalità normativa: e' lo stato di partenza di ogni voce
  // finche' il titolare non ne assegna una (`docs/25` §7).
  methodCodeId: null,
  // Non classificata per la Cassa: lo stato di quasi tutti i Tipi.
  tenderKind: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function utente(permissions: readonly TenantPermissionKey[]): User {
  return {
    id: 'u1',
    tenantId: 't1',
    email: 'magazziniere@example.com',
    displayName: 'Magazziniere',
    avatarUrl: null,
    role: UserRole.Manager,
    storeIds: [],
    isActive: true,
    isPlatformAdmin: false,
    tenantChannelProfile: TenantChannelProfile.Shopify,
    manualUnloadEnabled: true,
    tenantName: 'Cliente test',
    hasAllLocationsAccess: true,
    assignedLocationIds: [],
    assignedLocations: [],
    defaultLocationId: null,
    defaultLocation: null,
    permissions: [...permissions],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

async function apri(permissions: readonly TenantPermissionKey[]): Promise<void> {
  await render(PaymentOptionsPageComponent, {
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { currentUser: () => utente(permissions) } },
      {
        provide: PaymentOptionsService,
        useValue: { list: () => of([CONTANTI]), listMethodCodes: () => of([]) },
      },
    ],
  });
}

describe('PaymentOptionsPageComponent — comandi riservati a «Impostazioni azienda»', () => {
  it('con la sola sezione Impostazioni mostra l’elenco senza comandi di scrittura', async () => {
    await apri([TenantPermission.SectionSettings]);

    // ⚠️ `getByText` non basta più: «Contanti» è anche una delle scelte della
    //    tendina di classificazione. Si cerca la VOCE dell'elenco, per ruolo.
    const voci = screen.getAllByRole('listitem');
    expect(voci.some((v) => v.textContent?.includes('Contanti'))).toBe(true);
    expect(screen.queryByRole('button', { name: 'Aggiungi' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Rinomina' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Disattiva' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Elimina' })).toBeNull();
  });

  it('con «Impostazioni azienda» i comandi tornano', async () => {
    await apri([TenantPermission.SectionSettings, TenantPermission.SettingsCompany]);

    expect(screen.getAllByRole('button', { name: 'Aggiungi' }).length).toBe(2);
    expect(screen.getByRole('button', { name: 'Rinomina' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Disattiva' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Elimina' })).toBeTruthy();
  });

  it('al titolare i comandi restano anche senza permessi espliciti', async () => {
    await render(PaymentOptionsPageComponent, {
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { currentUser: () => ({ ...utente([]), role: UserRole.Owner }) },
        },
        {
          provide: PaymentOptionsService,
          useValue: { list: () => of([CONTANTI]), listMethodCodes: () => of([]) },
        },
      ],
    });

    expect(screen.getByRole('button', { name: 'Rinomina' })).toBeTruthy();
  });

  it('l’elenco vuoto non invita ad aggiungere chi non può', async () => {
    await render(PaymentOptionsPageComponent, {
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { currentUser: () => utente([TenantPermission.SectionSettings]) },
        },
        {
          provide: PaymentOptionsService,
          useValue: { list: () => of([]), listMethodCodes: () => of([]) },
        },
      ],
    });

    expect(screen.queryByText('Nessuna voce: aggiungine una qui sopra.')).toBeNull();
    expect(screen.getAllByText('Nessuna voce configurata.').length).toBe(2);
  });
});

/**
 * La tendina della Modalità normativa (C2A, `docs/25` §7).
 *
 * ⛔ Ciò che questi test falsificano: una tendina che compare anche sulle
 *    CONDIZIONI, un cambio che non arriva all'API, una scelta «nessuna» che
 *    invia `undefined` invece di `null` — e soprattutto un catalogo che
 *    fallisce SPARENDO, indistinguibile da un catalogo vuoto.
 */
const MP05: PaymentMethodCode = {
  id: 'mc-5',
  code: 'MP05',
  label: 'Bonifico',
  sortOrder: 5,
  isActive: true,
};

const BONIFICO: PaymentOption = {
  ...CONTANTI,
  id: 'po-2',
  name: 'Bonifico 60 gg',
  methodCodeId: 'mc-5',
};

const CONDIZIONE: PaymentOption = {
  ...CONTANTI,
  id: 'po-3',
  kind: 'terms',
  name: '60 gg f.m.',
  methodCodeId: null,
};

describe('PaymentOptionsPageComponent — modalità normativa', () => {
  function serviceMock(overrides: Record<string, unknown> = {}) {
    return {
      list: () => of([CONTANTI, BONIFICO, CONDIZIONE]),
      listMethodCodes: () => of([MP05]),
      update: vi.fn().mockReturnValue(of(BONIFICO)),
      ...overrides,
    };
  }

  async function apriConCatalogo(mock: Record<string, unknown>): Promise<void> {
    await render(PaymentOptionsPageComponent, {
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            currentUser: () =>
              utente([TenantPermission.SectionSettings, TenantPermission.SettingsCompany]),
          },
        },
        { provide: PaymentOptionsService, useValue: mock },
      ],
    });
  }

  it('mostra la tendina sui Tipi di pagamento e NON sulle condizioni', async () => {
    await apriConCatalogo(serviceMock());

    // Due voci `method`, nessuna sulla condizione.
    expect(screen.getAllByLabelText(/^Modalità normativa di/)).toHaveLength(2);
    expect(screen.queryByLabelText('Modalità normativa di 60 gg f.m.')).toBeNull();
  });

  it('presenta selezionata la modalità già collegata', async () => {
    await apriConCatalogo(serviceMock());

    const tendina = screen.getByLabelText<HTMLSelectElement>(
      'Modalità normativa di Bonifico 60 gg',
    );
    expect(tendina.value).toBe('mc-5');
  });

  it('associare una modalità la manda all_API', async () => {
    const mock = serviceMock();
    await apriConCatalogo(mock);

    const tendina = screen.getByLabelText('Modalità normativa di Contanti');
    fireEvent.change(tendina, { target: { value: 'mc-5' } });

    expect(mock.update).toHaveBeenCalledWith('po-1', { methodCodeId: 'mc-5' });
  });

  it('scegliere «nessuna» invia null, non undefined', async () => {
    const mock = serviceMock();
    await apriConCatalogo(mock);

    const tendina = screen.getByLabelText<HTMLSelectElement>(
      'Modalità normativa di Bonifico 60 gg',
    );
    fireEvent.change(tendina, { target: { value: '' } });

    expect(mock.update).toHaveBeenCalledWith('po-2', { methodCodeId: null });
  });

  it('a chi non può scrivere la tendina resta visibile ma disabilitata', async () => {
    await render(PaymentOptionsPageComponent, {
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { currentUser: () => utente([TenantPermission.SectionSettings]) },
        },
        { provide: PaymentOptionsService, useValue: serviceMock() },
      ],
    });

    const tendina = screen.getByLabelText<HTMLSelectElement>(
      'Modalità normativa di Bonifico 60 gg',
    );
    expect(tendina.value).toBe('mc-5');
    expect(tendina.disabled).toBe(true);
  });

  /**
   * ⭐ I DUE LIVELLI devono leggersi come due cose diverse.
   *
   * Le righe del tenant sono TIPI pagamento — i preset aziendali — e la
   * MODALITÀ è il codice normativo del catalogo globale a cui puntano.
   * Chiamarli entrambi «modalità» rimetterebbe insieme ciò che C2A separa.
   */
  it('distingue «Tipi pagamento» dalla «Modalità normativa»', async () => {
    await apriConCatalogo(serviceMock());

    expect(screen.getByText('Tipi pagamento')).toBeTruthy();
    expect(screen.getByText('Condizioni di pagamento')).toBeTruthy();
    expect(screen.queryByText('Modalità di pagamento')).toBeNull();
    expect(screen.getAllByLabelText(/^Modalità normativa di/).length).toBeGreaterThan(0);
  });

  it('se il catalogo FALLISCE la pagina lo dice, non sparisce in silenzio', async () => {
    await apriConCatalogo(
      serviceMock({ listMethodCodes: () => throwError(() => new Error('rete')) }),
    );

    // Lo stato d'errore della pagina, non una tendina mancante senza spiegazione.
    expect(screen.queryByLabelText(/^Modalità normativa di/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Riprova' })).toBeTruthy();
  });
});

/**
 * La classificazione OPERATIVA per la Cassa (tranche C2B, `docs/25` §7).
 *
 * ⛔ Non è la Modalità normativa del blocco qui sopra: quella è il codice
 * FatturaPA di un catalogo globale, questa dice se il Tipo si incassa al banco.
 */
describe('PaymentOptionsPageComponent — classificazione Cassa', () => {
  const CARTA: PaymentOption = {
    ...CONTANTI,
    id: 'po-4',
    name: 'Carta',
    tenderKind: 'electronic',
  };

  function mockClassificazione(overrides: Record<string, unknown> = {}) {
    return {
      list: () => of([CONTANTI, CARTA, CONDIZIONE]),
      listMethodCodes: () => of([MP05]),
      update: vi.fn().mockReturnValue(of(CARTA)),
      ...overrides,
    };
  }

  const toast = { showError: vi.fn(), showSuccess: vi.fn(), showInfo: vi.fn() };

  async function apri(mock: Record<string, unknown>): Promise<void> {
    toast.showError.mockClear();
    await render(PaymentOptionsPageComponent, {
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            currentUser: () =>
              utente([TenantPermission.SectionSettings, TenantPermission.SettingsCompany]),
          },
        },
        { provide: PaymentOptionsService, useValue: mock },
        { provide: ToastService, useValue: toast },
      ],
    });
  }

  it('compare sui Tipi e NON sulle condizioni', async () => {
    await apri(mockClassificazione());

    expect(screen.getAllByLabelText(/^Classificazione Cassa di/)).toHaveLength(2);
    expect(screen.queryByLabelText('Classificazione Cassa di 60 gg f.m.')).toBeNull();
  });

  it('offre le quattro scelte, «non utilizzabile» compresa', async () => {
    await apri(mockClassificazione());

    const tendina = screen.getByLabelText<HTMLSelectElement>('Classificazione Cassa di Contanti');
    const etichette = Array.from(tendina.options).map((o) => o.textContent?.trim());
    expect(etichette).toEqual([
      'Non utilizzabile in Cassa',
      'Contanti',
      'Elettronico',
      'Buono/ticket',
    ]);
  });

  it('presenta selezionata la classificazione già salvata', async () => {
    await apri(mockClassificazione());

    const tendina = screen.getByLabelText<HTMLSelectElement>('Classificazione Cassa di Carta');
    expect(tendina.value).toBe('electronic');
  });

  it('classificare manda il valore all_API', async () => {
    const mock = mockClassificazione();
    await apri(mock);

    const tendina = screen.getByLabelText('Classificazione Cassa di Contanti');
    fireEvent.change(tendina, { target: { value: 'cash' } });

    expect(mock.update).toHaveBeenCalledWith('po-1', { tenderKind: 'cash' });
  });

  it('«non utilizzabile» invia null, non undefined', async () => {
    const mock = mockClassificazione();
    await apri(mock);

    const tendina = screen.getByLabelText('Classificazione Cassa di Carta');
    fireEvent.change(tendina, { target: { value: '' } });

    expect(mock.update).toHaveBeenCalledWith('po-4', { tenderKind: null });
  });

  /**
   * ⭐ La condizione del mandato: rinominare NON tocca la classificazione. Il
   * payload della rinomina non la contiene, quindi l’API la lascia com’è —
   * assente significa «non toccare» (§7).
   */
  it('rinominare NON manda la classificazione', async () => {
    const mock = mockClassificazione();
    await apri(mock);

    fireEvent.click(screen.getAllByRole('button', { name: 'Rinomina' })[0]!);
    const campo = screen.getByLabelText<HTMLInputElement>('Rinomina Contanti');
    fireEvent.input(campo, { target: { value: 'Contanti cassa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salva' }));

    expect(mock.update).toHaveBeenCalledWith('po-1', { name: 'Contanti cassa' });
  });

  /**
   * ⭐ La differenza dalla Modalità normativa: quelle scelte arrivano dalla rete e
   * una tendina vuota è un caso possibile; queste sono costanti del modello. Con
   * il catalogo in errore la pagina mostra il proprio stato d’errore — mai una
   * tendina che sembra funzionare e non offre nulla.
   */
  it('un errore di SALVATAGGIO è visibile, non silenzioso', async () => {
    const mock = mockClassificazione({
      update: vi.fn().mockReturnValue(throwError(() => new Error('rete'))),
    });
    await apri(mock);

    const tendina = screen.getByLabelText('Classificazione Cassa di Contanti');
    fireEvent.change(tendina, { target: { value: 'cash' } });

    expect(mock.update).toHaveBeenCalled();
    // ⛔ La prova è che l’errore ESCE: senza questa asserzione il fallimento
    //    sarebbe indistinguibile da un salvataggio riuscito.
    expect(toast.showError).toHaveBeenCalled();
  });
});
