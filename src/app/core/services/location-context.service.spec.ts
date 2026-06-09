import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { LocationContextService } from './location-context.service';

const STORAGE_KEY = 'vestiflow-active-location';

describe('LocationContextService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('parte senza location attiva (null = tutte)', () => {
    const service = TestBed.inject(LocationContextService);
    expect(service.activeLocationId()).toBeNull();
  });

  it('imposta la location attiva e la persiste', () => {
    const service = TestBed.inject(LocationContextService);
    service.setActiveLocation('loc-1');
    expect(service.activeLocationId()).toBe('loc-1');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('loc-1');
  });

  it('null azzera la selezione e rimuove la persistenza', () => {
    const service = TestBed.inject(LocationContextService);
    service.setActiveLocation('loc-1');
    service.setActiveLocation(null);
    expect(service.activeLocationId()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('rilegge la preferenza persistita alla creazione', () => {
    localStorage.setItem(STORAGE_KEY, 'loc-2');
    const service = TestBed.inject(LocationContextService);
    expect(service.activeLocationId()).toBe('loc-2');
  });
});
