import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

import { APP_CONFIG } from '@core/config/app-config.token';
import { beforeEach, describe, expect, it } from 'vitest';

import { UnitOfMeasureOptionService } from './unit-of-measure-option.service';
import { emptyProductFormDraft, toCreateProductDto } from '../models/product-form.mapper';

/**
 * ⭐ **L'unità predefinita del tenant: cosa fa, e cosa NON fa.**
 *
 * Le condizioni le ha poste il proprietario il 26/08/2026, e sono cinque. Qui
 * si provano le tre che vivono nel frontend; le altre due — «zero o una per
 * tenant» e «cancellare la predefinita lascia senza default» — sono vincoli di
 * database, e stanno nell'indice parziale della migration.
 */
describe('unità di misura predefinita', () => {
  let service: UnitOfMeasureOptionService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://localhost:3000/api/v1' } },
        UnitOfMeasureOptionService,
      ],
    });
    service = TestBed.inject(UnitOfMeasureOptionService);
    http = TestBed.inject(HttpTestingController);
  });

  function rispondi(righe: readonly Record<string, unknown>[]): void {
    service.options();
    http.expectOne((r) => r.url.includes('unit-of-measure-options')).flush(righe);
  }

  it('⭐ la predefinita è quella con la spunta', () => {
    rispondi([
      { id: '1', name: 'pz', sortOrder: 0, isSystem: true, isActive: true, isDefault: false },
      { id: '2', name: 'kg', sortOrder: 1, isSystem: false, isActive: true, isDefault: true },
    ]);

    expect(service.defaultCode()).toBe('kg');
  });

  it('⭐ togliere la spunta lascia SENZA predefinita, e non è un guasto', () => {
    // ⚠️ È una condizione posta esplicitamente: chi ha articoli misti non vuole
    // dover cambiare l'unità ogni volta, e non deve confondersi quando crea.
    rispondi([
      { id: '1', name: 'pz', sortOrder: 0, isSystem: true, isActive: true, isDefault: false },
      { id: '2', name: 'kg', sortOrder: 1, isSystem: false, isActive: true, isDefault: false },
    ]);

    expect(service.defaultCode()).toBeNull();
  });

  it('⛔ e non ripiega su `pz` per riempire il vuoto', () => {
    // Il ripiego `pz` esiste, ma vive al SALVATAGGIO ed è un'altra cosa: qui un
    // `pz` restituito significherebbe «l'azienda ha scelto pz», che è falso.
    rispondi([
      { id: '1', name: 'pz', sortOrder: 0, isSystem: true, isActive: true, isDefault: false },
    ]);

    expect(service.defaultCode()).toBeNull();
  });

  it('⭐ la bozza di un articolo NUOVO nasce senza unità, pronta per il seme', () => {
    // ⛔ Nasceva a `pz`. Così la predefinita del tenant non avrebbe avuto niente
    // da seminare, e non si sarebbe distinto «pz scelto» da «pz per inerzia».
    expect(emptyProductFormDraft().general.unitOfMeasure).toBe('');
  });

  it('⭐ ma il ripiego tecnico al salvataggio resta `pz`', () => {
    // Un articolo salvato senza unità non finisce a magazzino con il campo
    // vuoto: la normalizzazione di sempre è intatta.
    const bozza = emptyProductFormDraft();
    const dto = toCreateProductDto(bozza);

    expect(dto.unitOfMeasure).toBe('pz');
  });
});
