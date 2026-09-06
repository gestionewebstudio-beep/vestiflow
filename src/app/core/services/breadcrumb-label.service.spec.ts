import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { bindBreadcrumbEntityLabel, BreadcrumbLabelService } from './breadcrumb-label.service';

interface EntitySource {
  readonly id: string | null;
  readonly label: string | null;
}

/** Ospite minimo: chiama il binding nel costruttore, come i form documento. */
@Component({
  selector: 'app-breadcrumb-label-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
class BreadcrumbLabelHostComponent {
  readonly source = signal<EntitySource>({ id: null, label: null });

  constructor() {
    bindBreadcrumbEntityLabel(() => this.source());
  }
}

describe('BreadcrumbLabelService', () => {
  let service: BreadcrumbLabelService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [BreadcrumbLabelService] });
    service = TestBed.inject(BreadcrumbLabelService);
  });

  it('parte senza nessuna etichetta registrata', () => {
    expect(service.labels().size).toBe(0);
  });

  it('set registra l etichetta sotto l id dell entita', () => {
    service.set('id-1', 'CAR-2026-0008');

    expect(service.labels().get('id-1')).toBe('CAR-2026-0008');
  });

  it('set toglie gli spazi ai bordi dell etichetta', () => {
    service.set('id-1', '  CAR-2026-0008 \n');

    expect(service.labels().get('id-1')).toBe('CAR-2026-0008');
  });

  it('set ignora un id vuoto', () => {
    service.set('', 'CAR-2026-0008');

    expect(service.labels().size).toBe(0);
  });

  it('set ignora un etichetta vuota o di soli spazi', () => {
    service.set('id-1', '');
    service.set('id-2', '   ');

    expect(service.labels().size).toBe(0);
  });

  it('set conserva le etichette gia registrate per altri id', () => {
    service.set('id-1', 'CAR-2026-0008');
    service.set('id-2', 'DDT-2026-0011');

    expect(service.labels().get('id-1')).toBe('CAR-2026-0008');
    expect(service.labels().get('id-2')).toBe('DDT-2026-0011');
    expect(service.labels().size).toBe(2);
  });

  it('set con lo stesso valore non emette una mappa nuova', () => {
    service.set('id-1', 'CAR-2026-0008');
    const before = service.labels();

    service.set('id-1', '  CAR-2026-0008  ');

    expect(service.labels()).toBe(before);
  });

  it('set con un valore diverso emette una mappa nuova e lascia intatta la precedente', () => {
    service.set('id-1', 'CAR-2026-0008');
    const before = service.labels();

    service.set('id-1', 'CAR-2026-0009');

    expect(service.labels()).not.toBe(before);
    expect(service.labels().get('id-1')).toBe('CAR-2026-0009');
    expect(before.get('id-1')).toBe('CAR-2026-0008');
  });

  it('clear rimuove l etichetta dell id indicato e lascia le altre', () => {
    service.set('id-1', 'CAR-2026-0008');
    service.set('id-2', 'DDT-2026-0011');

    service.clear('id-1');

    expect(service.labels().has('id-1')).toBe(false);
    expect(service.labels().get('id-2')).toBe('DDT-2026-0011');
  });

  it('clear su un id mai registrato non emette una mappa nuova', () => {
    service.set('id-1', 'CAR-2026-0008');
    const before = service.labels();

    service.clear('id-sconosciuto');

    expect(service.labels()).toBe(before);
  });

  it('clear lascia intatta la mappa emessa in precedenza', () => {
    service.set('id-1', 'CAR-2026-0008');
    const before = service.labels();

    service.clear('id-1');

    expect(service.labels().size).toBe(0);
    expect(before.get('id-1')).toBe('CAR-2026-0008');
  });
});

describe('bindBreadcrumbEntityLabel', () => {
  let service: BreadcrumbLabelService;
  let fixture: ComponentFixture<BreadcrumbLabelHostComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [BreadcrumbLabelService] });
    service = TestBed.inject(BreadcrumbLabelService);
    fixture = TestBed.createComponent(BreadcrumbLabelHostComponent);
    fixture.detectChanges();
  });

  function emit(source: EntitySource): void {
    fixture.componentInstance.source.set(source);
    fixture.detectChanges();
  }

  it('non registra nulla finche l etichetta non e disponibile', () => {
    emit({ id: 'id-1', label: null });

    expect(service.labels().size).toBe(0);
  });

  it('non registra nulla finche l id non e presente nell URL', () => {
    emit({ id: null, label: 'CAR-2026-0008' });

    expect(service.labels().size).toBe(0);
  });

  it('non registra un etichetta di soli spazi', () => {
    emit({ id: 'id-1', label: '   ' });

    expect(service.labels().size).toBe(0);
  });

  it('registra l etichetta quando id ed etichetta sono entrambi disponibili', () => {
    emit({ id: 'id-1', label: 'CAR-2026-0008' });

    expect(service.labels().get('id-1')).toBe('CAR-2026-0008');
  });

  it('aggiorna l etichetta dello stesso id quando il documento cambia numero', () => {
    emit({ id: 'id-1', label: 'CAR-2026-0008' });

    emit({ id: 'id-1', label: 'CAR-2026-0009' });

    expect(service.labels().get('id-1')).toBe('CAR-2026-0009');
    expect(service.labels().size).toBe(1);
  });

  it('al cambio di entita pulisce la precedente e registra la nuova', () => {
    emit({ id: 'id-1', label: 'CAR-2026-0008' });

    emit({ id: 'id-2', label: 'DDT-2026-0011' });

    expect(service.labels().has('id-1')).toBe(false);
    expect(service.labels().get('id-2')).toBe('DDT-2026-0011');
  });

  it('pulisce l etichetta quando l id sparisce dall URL', () => {
    emit({ id: 'id-1', label: 'CAR-2026-0008' });

    emit({ id: null, label: null });

    expect(service.labels().size).toBe(0);
  });

  it('non tocca le etichette registrate da altre pagine', () => {
    service.set('id-altrui', 'ORD-2026-0001');
    emit({ id: 'id-1', label: 'CAR-2026-0008' });

    emit({ id: 'id-2', label: 'DDT-2026-0011' });

    expect(service.labels().get('id-altrui')).toBe('ORD-2026-0001');
  });

  it('alla distruzione del componente pulisce l etichetta registrata', () => {
    emit({ id: 'id-1', label: 'CAR-2026-0008' });

    fixture.destroy();

    expect(service.labels().size).toBe(0);
  });

  it('alla distruzione senza nulla di registrato non tocca le altre etichette', () => {
    service.set('id-altrui', 'ORD-2026-0001');
    const before = service.labels();

    fixture.destroy();

    expect(service.labels()).toBe(before);
  });
});
