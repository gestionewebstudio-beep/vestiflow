import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { AuthService } from '@core/auth';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { LocationContextService } from '@core/services/location-context.service';
import { APP_CONFIG } from '@core/config/app-config.token';
import { ToastService } from '@core/services/toast.service';
import { DocumentType } from '@core/models/document.model';
import type { DocumentRecord } from '@core/models/document.model';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import type { DocumentCounterView } from '@domain/documents/models/document-counter.model';
import { ProductService } from '@domain/products/services/product.service';

import { TransferFormComponent } from './transfer-form.component';
import { DocumentService } from '@domain/documents/services/document.service';
import { DocumentCountersService } from '@domain/documents/services/document-counters.service';
import { ExternalDocumentTypeService } from '@domain/documents/services/external-document-type.service';

const LOCATIONS = [
  { id: 'loc-1', name: 'Milano' },
  { id: 'loc-2', name: 'Roma' },
];

/** Contatore predefinito del tipo: propone la serie «A» e il numero 42. */
const COUNTER: DocumentCounterView = {
  id: 'cnt-1',
  type: DocumentType.Transfer,
  series: 'A',
  locationId: null,
  locationName: null,
  isDefault: true,
  nextNumber: 42,
  documentCount: 41,
};

function operationalLocationsMock(defaultLocation: { id: string; name: string } | null = null) {
  return {
    locations: () => LOCATIONS,
    writeLocations: () => LOCATIONS,
    actionLocations: () => LOCATIONS,
    transferTargetLocations: () => LOCATIONS,
    defaultLocation: () => defaultLocation,
    suggestedWriteLocation: () => defaultLocation,
    isFixedSingleStore: () => false,
    fixedSingleStoreLocationId: () => null,
    fixedSingleStoreLabel: () => null,
  };
}

describe('TransferFormComponent', () => {
  async function setup(options?: {
    readonly defaultLocation?: { id: string; name: string } | null;
    /** Contatori proposti in testata (numero + serie). */
    readonly counters?: readonly DocumentCounterView[];
    /** Documento restituito dal server al salvataggio (numero assegnato). */
    readonly createdDocument?: Partial<DocumentRecord>;
  }) {
    const counters = options?.counters ?? [];
    const documentService = {
      getDocumentById: vi.fn(),
      createDocument: vi.fn(() =>
        of({ id: 'doc-9', ...options?.createdDocument } as DocumentRecord),
      ),
      updateDocument: vi.fn(),
      saveTransfer: vi.fn(),
      confirmDocument: vi.fn(),
    };
    const toasts = { showInfo: vi.fn(), showError: vi.fn() };

    const rendered = await render(TransferFormComponent, {
      providers: [
        {
          provide: DocumentCountersService,
          useValue: {
            available: () =>
              of({
                counters,
                proposedCounterId: counters.find((entry) => entry.isDefault)?.id ?? null,
              }),
          },
        },
        { provide: ToastService, useValue: toasts },
        // Serve da quando le righe usano il sistema condiviso delle colonne:
        // TableColumnPreferenceService costruisce l'API delle preferenze, che
        // legge la configurazione dell'app.
        {
          provide: APP_CONFIG,
          useValue: {
            production: false,
            appName: 'VestiFlow',
            apiBaseUrl: '',
            features: { barcodeScanner: false, shopify: false },
          },
        },
        // Nessun permesso costi: il selettore articolo non deve mostrare il costo.
        { provide: AuthService, useValue: { currentUser: () => null } },
        provideRouter([]),
        {
          provide: ActivatedRoute,
          // `queryParamMap` nello snapshot serve davvero: la maschera lo legge
          // in `afterNextRender` per il precompilato da «Duplica documento».
          useValue: {
            snapshot: { data: {}, queryParamMap: convertToParamMap({}) },
            paramMap: of(convertToParamMap({})),
          },
        },
        {
          provide: OperationalLocationsService,
          useValue: operationalLocationsMock(options?.defaultLocation ?? null),
        },
        {
          provide: LocationContextService,
          useValue: { activeLocationId: () => null, setActiveLocation: vi.fn() },
        },
        { provide: ProductService, useValue: { searchVariantSummaries: () => of([]) } },
        // Il documento della controparte in testata porta con sé la tendina dei
        // tipi: senza questo doppio la maschera chiederebbe HTTP al render.
        {
          provide: ExternalDocumentTypeService,
          useValue: { list: () => of([]) },
        },
        { provide: DocumentService, useValue: documentService },
      ],
    });

    // Dopo il salvataggio la maschera va al dettaglio: qui non c'è alcuna rotta
    // registrata, e una navigazione fallita lascerebbe una promise rigettata
    // che non c'entra nulla con ciò che il test verifica.
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    return { ...rendered, documentService, toasts, navigate };
  }

  // Regressione: le opzioni della location di destinazione escludono l'origine.
  // targetLocationOptions e' un computed che legge locationId dal FormControl
  // (non signal): deve ri-filtrare quando l'origine cambia, non restare fisso.
  it('ri-filtra le destinazioni escludendo la nuova origine selezionata', async () => {
    const user = userEvent.setup();
    await setup();

    // Cambia origine da Milano (default) a Roma.
    await user.click(screen.getByRole('button', { name: 'Location di origine' }));
    await user.click(screen.getByRole('option', { name: 'Roma' }));

    // La destinazione ora deve poter offrire Milano (non piu' Roma, ora origine).
    await user.click(screen.getByRole('button', { name: 'Location di destinazione' }));
    expect(screen.getByRole('option', { name: 'Milano' })).toBeVisible();
    expect(screen.queryByRole('option', { name: 'Roma' })).toBeNull();
  });

  // Specifica «sede predefinita»: puo' precompilare SOLO l'origine; la
  // destinazione non viene MAI autocompilata.
  it('precompila la sola origine con la sede predefinita; destinazione mai autocompilata', async () => {
    await setup({ defaultLocation: LOCATIONS[0] });

    const origin = screen.getByRole('button', { name: 'Location di origine' });
    expect(origin).toHaveTextContent('Milano (predefinita)');

    const target = screen.getByRole('button', { name: 'Location di destinazione' });
    expect(target).toHaveTextContent('Seleziona destinazione…');
  });

  // Senza predefinita (utente multi-sede): nessun fallback "prima location
  // disponibile", entrambi i campi partono vuoti.
  it('senza sede predefinita non autoseleziona origine ne destinazione', async () => {
    await setup();

    expect(screen.getByRole('button', { name: 'Location di origine' })).toHaveTextContent(
      'Seleziona origine…',
    );
    expect(screen.getByRole('button', { name: 'Location di destinazione' })).toHaveTextContent(
      'Seleziona destinazione…',
    );
  });

  // Il trio della controparte (tipo · numero · data) NON sta su questa maschera
  // (08/2026): un trasferimento fra sedi proprie non ha una controparte, e tre
  // celle sempre vuote in cima alla testata chiedevano di essere compilate senza
  // che ci fosse niente da scrivere. La prova che c'era qui verificava che
  // comparissero: ora verifica che non ci siano.
  it('non chiede il documento della controparte: non c’è una controparte', async () => {
    await setup();

    expect(screen.queryByLabelText('Numero documento')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tipo documento' })).toBeNull();
  });

  // ── Numero: proposta vs imposizione ───────────────────────────────────────
  // Il numero proposto all'apertura non è prenotato: se tornasse al server
  // come scelta, il secondo operatore riceverebbe un conflitto per un numero
  // che gli aveva suggerito la maschera.
  describe('numero documento', () => {
    /** Riempie il minimo indispensabile perché il salvataggio parta. */
    function fillMinimumValidDocument(component: TransferFormComponent): void {
      component.form.controls.locationId.setValue('loc-1');
      component.form.controls.targetLocationId.setValue('loc-2');
      const line = component['lines'].at(0);
      line.controls.variantId.setValue('var-1');
      line.controls.description.setValue('Maglia · M');
    }

    it('la proposta arriva in testata senza sporcare il controllo', async () => {
      const { fixture } = await setup({ counters: [COUNTER] });
      await fixture.whenStable();
      fixture.detectChanges();

      // Il campo mostra il primo libero…
      const numberInputs = screen.getAllByLabelText<HTMLInputElement>('Numero');
      expect(numberInputs[0]!.value).toBe('42');
      // …ma resta una proposta: il controllo non è dirty.
      expect(fixture.componentInstance.form.controls.documentNumber.dirty).toBe(false);
    });

    it('numero non toccato: il salvataggio NON porta il numero', async () => {
      const { fixture } = await setup({ counters: [COUNTER] });
      await fixture.whenStable();
      const component = fixture.componentInstance;

      const body = component['buildSaveTransferBody']('doc-1', component.form.getRawValue());
      expect(body.number).toBeUndefined();
    });

    it('numero digitato: viaggia al server, che è dove il conflitto ha senso', async () => {
      const { fixture } = await setup({ counters: [COUNTER] });
      await fixture.whenStable();
      const component = fixture.componentInstance;

      component['numbering'].onNumberChange(77);

      const body = component['buildSaveTransferBody']('doc-1', component.form.getRawValue());
      expect(body.number).toBe(77);
    });

    it('mostra l’avviso di proposta finché l’operatore non tocca il numero', async () => {
      const user = userEvent.setup();
      const { fixture } = await setup({ counters: [COUNTER] });
      await fixture.whenStable();
      fixture.detectChanges();

      // Due copie: testata desktop e pannello mobile convivono nel DOM.
      expect(screen.getAllByText(/Primo libero/)).toHaveLength(2);

      const numberInput = screen.getAllByLabelText<HTMLInputElement>('Numero')[0]!;
      await user.clear(numberInput);
      await user.type(numberInput, '77');
      fixture.detectChanges();

      // Ora il numero è una scelta: l'avviso sparisce.
      expect(screen.queryAllByText(/Primo libero/)).toHaveLength(0);
    });

    it('numero soffiato da un altro operatore: lo dice con un avviso informativo', async () => {
      const { fixture, toasts } = await setup({
        counters: [COUNTER],
        // Il server ha assegnato il primo libero al momento del commit: il 42
        // nel frattempo era stato preso.
        createdDocument: { number: 46 },
      });
      await fixture.whenStable();
      const component = fixture.componentInstance;

      fillMinimumValidDocument(component);
      component['persist']();

      expect(toasts.showInfo).toHaveBeenCalledWith(
        'Salvato con il n. 46: il 42 è stato preso da un altro operatore.',
      );
    });

    it('numero assegnato uguale alla proposta: nessun avviso', async () => {
      const { fixture, toasts } = await setup({
        counters: [COUNTER],
        createdDocument: { number: 42 },
      });
      await fixture.whenStable();
      const component = fixture.componentInstance;

      fillMinimumValidDocument(component);
      component['persist']();

      expect(toasts.showInfo).not.toHaveBeenCalled();
    });

    // Numero scelto dall'operatore: se è occupato esiste già il dialogo di
    // conflitto. Un toast in più sopra quello confonde invece di informare.
    it('numero imposto: nessun avviso, il conflitto ha già il suo dialogo', async () => {
      const { fixture, toasts } = await setup({
        counters: [COUNTER],
        createdDocument: { number: 46 },
      });
      await fixture.whenStable();
      const component = fixture.componentInstance;

      component['numbering'].onNumberChange(42);
      fillMinimumValidDocument(component);
      component['persist']();

      expect(toasts.showInfo).not.toHaveBeenCalled();
    });
  });
});
