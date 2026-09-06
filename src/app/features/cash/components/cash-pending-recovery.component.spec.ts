import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { render, screen, waitFor } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of, Subject, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';
import type { CashIntentResult } from '@domain/cash/models/cash.model';
import { CashApiService } from '@domain/cash/services/cash-api.service';
import { CashPendingRecoveryComponent } from './cash-pending-recovery.component';

const intentId = '11111111-1111-4111-8111-111111111111';
const locationId = '22222222-2222-4222-8222-222222222222';
const sessionId = '33333333-3333-4333-8333-333333333333';
const recorded = {
  status: 'recorded' as const,
  intentId,
  locationId,
  sessionId,
  documentId: 'documento',
  reference: 'C-TEST-1',
  documentDate: '2026-09-06T12:00:00Z',
  locationName: 'Sede TEST',
  totalMinor: 3656,
};
const user = signal({ id: 'u', tenantId: 't' });

async function mount(
  operation: 'checkout' | 'returns' = 'checkout',
  version = 1,
  malformed = false,
) {
  const key = `vestiflow.cash.pending.v1:t:u:${operation}`;
  const raw = malformed
    ? '{malformato'
    : JSON.stringify({
        version,
        operation,
        payload: { creationIntentId: intentId, locationId, sessionId, lines: 'rotte' },
      });
  sessionStorage.setItem(key, raw);
  const api = {
    intentResult: vi.fn<CashApiService['intentResult']>().mockReturnValue(of(recorded)),
    operation: vi.fn().mockReturnValue(of({ id: recorded.documentId })),
    checkout: vi.fn(),
    createReturn: vi.fn(),
  };
  const view = await render(CashPendingRecoveryComponent, {
    inputs: { operation },
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { currentUser: user } },
      { provide: CashApiService, useValue: api },
    ],
  });
  return { ...view, key, raw, api, actor: userEvent.setup() };
}
const verify = () => screen.getByRole('button', { name: 'Verifica esito sul server' });
const confirm = () => screen.getByRole('button', { name: 'Conferma recupero dell’operazione' });
async function open(actor: ReturnType<typeof userEvent.setup>) {
  const link = screen.getByRole('link', { name: /Apri operazione/ });
  link.addEventListener('click', (event) => event.preventDefault()); // jsdom non apre schede; il browser reale lo verifica.
  await actor.click(link);
}

describe('recupero Cassa di dati locali illeggibili', () => {
  beforeEach(() => {
    sessionStorage.clear();
    user.set({ id: 'u', tenantId: 't' });
  });

  it.each(['checkout', 'returns'] as const)(
    '%s: legge, mostra, apre e conferma; nessun POST, copia conservata',
    async (operation) => {
      const { key, raw, api, actor } = await mount(operation);
      await actor.click(verify());
      expect(api.intentResult).toHaveBeenCalledWith(operation, intentId);
      expect(screen.getByText('C-TEST-1')).toBeVisible();
      expect(screen.getByText(/Sede TEST/)).toHaveTextContent('36,56');
      expect(confirm()).toBeDisabled();
      expect(sessionStorage.getItem(key)).toBe(raw);
      await open(actor);
      await actor.click(confirm());
      expect(api.intentResult).toHaveBeenCalledTimes(2);
      expect(api.operation).toHaveBeenCalledWith(recorded.documentId);
      expect(sessionStorage.getItem(key)).toBeNull();
      expect(JSON.parse(sessionStorage.getItem(`${key}:recovered:${intentId}`)!)).toMatchObject({
        originalRaw: raw,
      });
      expect(api.checkout).not.toHaveBeenCalled();
      expect(api.createReturn).not.toHaveBeenCalled();
      expect(screen.getByText(/Pendenza locale chiusa/)).toBeVisible();
    },
  );

  it('malformato senza identità: preserva gli elementi e richiede verifica amministrativa', async () => {
    const { key, raw, api } = await mount('checkout', 1, true);
    expect(screen.queryByRole('button', { name: 'Verifica esito sul server' })).toBeNull();
    expect(screen.getByText(/Per l’amministratore/)).toBeVisible();
    expect(sessionStorage.getItem(key)).toBe(raw);
    expect(api.intentResult).not.toHaveBeenCalled();
  });

  it('versione incompatibile: può leggere il riferimento, ma non chiude la pendenza', async () => {
    const { key, raw, actor } = await mount('checkout', 99);
    await actor.click(verify());
    expect(screen.getByText(/versione o contesto locale incompatibili/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Conferma recupero dell’operazione' })).toBeNull();
    expect(sessionStorage.getItem(key)).toBe(raw);
  });

  it('intento non trovato e lettura ripetuta non autorizzano cancellazioni o nuovi invii', async () => {
    const { key, raw, actor, api } = await mount();
    api.intentResult.mockReturnValue(of({ status: 'unconfirmed' }));
    await actor.click(verify());
    await actor.click(verify());
    expect(screen.getByText(/questo non dimostra/)).toBeVisible();
    expect(sessionStorage.getItem(key)).toBe(raw);
    expect(api.checkout).not.toHaveBeenCalled();
  });

  it('richiesta in corso: nessuna conferma anticipata e cambio utente scarta la risposta tardiva', async () => {
    const { key, raw, actor, api, fixture } = await mount();
    const response = new Subject<CashIntentResult>();
    api.intentResult.mockReturnValue(response);
    await actor.click(verify());
    expect(verify()).toBeDisabled();
    user.set({ id: 'altro', tenantId: 't' });
    response.next(recorded);
    response.complete();
    fixture.detectChanges();
    await waitFor(() => expect(screen.queryByText('C-TEST-1')).toBeNull());
    expect(sessionStorage.getItem(key)).toBe(raw);
    expect(sessionStorage.length).toBe(1);
  });

  it.each([
    'revoca',
    'non confermato',
    'documento diverso',
    'sede diversa',
    'archivio indisponibile',
    'dettaglio vietato',
  ])('%s dopo verifica: conserva la pendenza', async (cause) => {
    const { key, raw, actor, api } = await mount();
    await actor.click(verify());
    if (cause === 'dettaglio vietato')
      api.operation.mockReturnValue(throwError(() => new Error('403')));
    await open(actor);
    if (cause === 'dettaglio vietato') {
      expect(confirm()).toBeDisabled();
      return;
    }
    if (cause === 'revoca') api.intentResult.mockReturnValue(throwError(() => new Error('403')));
    if (cause === 'non confermato') api.intentResult.mockReturnValue(of({ status: 'unconfirmed' }));
    if (cause === 'documento diverso')
      api.intentResult.mockReturnValue(of({ ...recorded, documentId: 'altro' }));
    if (cause === 'sede diversa')
      api.intentResult.mockReturnValue(of({ ...recorded, locationId: 'altra' }));
    const write =
      cause === 'archivio indisponibile'
        ? vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('QuotaExceeded');
          })
        : null;
    try {
      await actor.click(confirm());
    } finally {
      write?.mockRestore();
    }
    expect(sessionStorage.getItem(key)).toBe(raw);
    expect(sessionStorage.length).toBe(1);
    expect(api.checkout).not.toHaveBeenCalled();
    expect(api.createReturn).not.toHaveBeenCalled();
  });
});
