import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { ToastService } from '@core/services/toast.service';
import { CompanyProfileService } from '@domain/tenant/services/company-profile.service';
import {
  EMPTY_COMPANY_FIELDS,
  type CompanyFields,
  type CompanyProfile,
} from '@domain/tenant/models/company-profile.model';

import { CompanyPageComponent } from './company-page.component';

/** Il campo per etichetta, già tipizzato: `.value` non si legge su un HTMLElement. */
function campo(label: string): HTMLInputElement {
  return screen.getByLabelText<HTMLInputElement>(label);
}

const ATTIVAZIONE: CompanyFields = {
  ...EMPTY_COMPANY_FIELDS,
  legalName: 'Cliente VestiFlow Srl',
  vatNumber: '12345678901',
  addressLine1: 'Via del Contratto 1',
  city: 'Napoli',
};

function apri(company: CompanyProfile, update = vi.fn(() => of(company))) {
  const toast = { showInfo: vi.fn(), showError: vi.fn() };
  return render(CompanyPageComponent, {
    providers: [
      provideRouter([]),
      {
        provide: CompanyProfileService,
        useValue: { get: () => of(company), update },
      },
      { provide: ToastService, useValue: toast },
    ],
  });
}

describe('CompanyPageComponent', () => {
  it('anagrafica mai compilata: form vuoto, non precompilato di nascosto', async () => {
    await apri({ profile: null, activationDefaults: ATTIVAZIONE });

    // I dati di attivazione sono un'altra anagrafica: entrano solo se il
    // titolare lo chiede, altrimenti un dato ereditato sembrerebbe confermato.
    expect(campo('Ragione sociale').value).toBe('');
    expect(screen.getByRole('button', { name: /Precompila dai dati di attivazione/ })).toBeTruthy();
  });

  it('la precompilazione riempie i campi ma non salva', async () => {
    const update = vi.fn(() => of({ profile: null, activationDefaults: ATTIVAZIONE }));
    await apri({ profile: null, activationDefaults: ATTIVAZIONE }, update);

    await userEvent.click(
      screen.getByRole('button', { name: /Precompila dai dati di attivazione/ }),
    );

    expect(campo('Ragione sociale').value).toBe('Cliente VestiFlow Srl');
    expect(campo('Partita IVA').value).toBe('12345678901');
    expect(update).not.toHaveBeenCalled();
  });

  it('senza dati di attivazione non offre una precompilazione vuota', async () => {
    await apri({ profile: null, activationDefaults: EMPTY_COMPANY_FIELDS });

    expect(screen.queryByRole('button', { name: /Precompila dai dati di attivazione/ })).toBeNull();
  });

  it('anagrafica già salvata: niente proposta di precompilazione', async () => {
    await apri({
      profile: { ...EMPTY_COMPANY_FIELDS, legalName: 'Boutique Demo Srl' },
      activationDefaults: ATTIVAZIONE,
    });

    expect(campo('Ragione sociale').value).toBe('Boutique Demo Srl');
    // Riproporla significherebbe offrire di sovrascrivere quello che c'è.
    expect(screen.queryByRole('button', { name: /Precompila dai dati di attivazione/ })).toBeNull();
  });

  it('anagrafica incompleta: avvisa senza bloccare', async () => {
    await apri({
      profile: { ...EMPTY_COMPANY_FIELDS, legalName: 'Boutique Demo Srl' },
      activationDefaults: ATTIVAZIONE,
    });

    expect(screen.getByRole('alert').textContent).toContain('Partita IVA');
    expect(screen.getByRole('button', { name: /Salva dati azienda/ })).toBeTruthy();
  });

  it('P.IVA malformata: errore sul campo, nessuna chiamata all’API', async () => {
    const update = vi.fn(() => of({ profile: null, activationDefaults: ATTIVAZIONE }));
    await apri({ profile: null, activationDefaults: ATTIVAZIONE }, update);

    await userEvent.type(screen.getByLabelText('Partita IVA'), '123');
    await userEvent.click(screen.getByRole('button', { name: /Salva dati azienda/ }));

    expect(screen.getByText(/Servono 11 cifre/)).toBeTruthy();
    expect(update).not.toHaveBeenCalled();
  });

  it('salva inviando i campi compilati', async () => {
    const salvata: CompanyProfile = {
      profile: { ...EMPTY_COMPANY_FIELDS, legalName: 'Boutique Demo Srl' },
      activationDefaults: ATTIVAZIONE,
    };
    const update = vi.fn(() => of(salvata));
    await apri({ profile: null, activationDefaults: ATTIVAZIONE }, update);

    await userEvent.type(screen.getByLabelText('Ragione sociale'), 'Boutique Demo Srl');
    await userEvent.click(screen.getByRole('button', { name: /Salva dati azienda/ }));

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ legalName: 'Boutique Demo Srl' }),
    );
  });
});
