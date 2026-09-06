import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';
import { TenantPermission } from '@core/models/tenant-permission.model';
import type { TenantPermissionKey } from '@core/models/tenant-permission.model';
import { UserRole } from '@core/models/user.model';

import { DocumentCounterpartyRefComponent } from './document-counterparty-ref.component';
import type { ExternalDocumentType } from '../../models/external-document-type.model';
import { ExternalDocumentTypeService } from '../../services/external-document-type.service';

/** Operatore non titolare: conta solo l'elenco permessi, mai il ruolo. */
function clerkWith(permissions: readonly TenantPermissionKey[]) {
  return { role: UserRole.Clerk, permissions: [...permissions] };
}

function tipo(over: Partial<ExternalDocumentType> = {}): ExternalDocumentType {
  return {
    id: 'ddt',
    name: 'DDT',
    shortLabel: 'DDT',
    causalTemplate: 'DDT {numero} del {data}',
    isSystem: true,
    isActive: true,
    sortOrder: 1,
    ...over,
  };
}

async function setup(options: {
  types?: readonly ExternalDocumentType[];
  listFails?: boolean;
  typeId?: string;
  snapshotLabel?: string;
  /**
   * Permessi dell'operatore. Assente = chi configura i documenti: è la
   * condizione della maggior parte delle prove, che guardano la tendina e non
   * i permessi, e senza la quale la voce di gestione non comparirebbe mai.
   */
  permissions?: readonly TenantPermissionKey[];
}) {
  const service = {
    list: vi.fn(() =>
      options.listFails
        ? throwError(() => new Error('rete assente'))
        : of(options.types ?? [tipo()]),
    ),
  };
  const typeIdChange = vi.fn();
  const view = await render(DocumentCounterpartyRefComponent, {
    inputs: {
      idPrefix: 'test',
      typeId: options.typeId ?? '',
      docNumber: '',
      docDate: '',
      snapshotLabel: options.snapshotLabel,
    },
    on: { typeIdChange },
    providers: [
      { provide: ExternalDocumentTypeService, useValue: service },
      {
        provide: AuthService,
        useValue: {
          currentUser: () =>
            clerkWith(options.permissions ?? [TenantPermission.DocumentsConfigure]),
        },
      },
    ],
  });
  return { view, service, typeIdChange };
}

describe('DocumentCounterpartyRefComponent', () => {
  it('mostra le tre voci: tipo, numero e data del documento della controparte', async () => {
    await setup({});

    expect(screen.getByLabelText('Numero documento')).toBeTruthy();
    expect(screen.getByText('Tipo documento')).toBeTruthy();
    expect(screen.getByText('Data documento')).toBeTruthy();
  });

  /**
   * La forma della fascia sta nel componente e non nelle maschere: e' cio' che
   * impedisce che tornino a essere sette impaginazioni diverse.
   */
  it('da desktop disegna da se’ la fascia secondaria della testata', async () => {
    const { view } = await setup({});

    const band = view.container.querySelector('.doc-form__header-row--secondary');
    expect(band).toBeTruthy();
    expect(band?.classList.contains('doc-form__grid--header-compact')).toBe(true);
    expect(band?.querySelectorAll('.doc-form__field').length).toBe(3);
  });

  it('da mobile disegna la sezione del pannello, con il titolo del contesto', async () => {
    const service = { list: vi.fn(() => of([tipo()])) };
    const view = await render(DocumentCounterpartyRefComponent, {
      inputs: {
        idPrefix: 'test',
        typeId: '',
        docNumber: '',
        docDate: '',
        layout: 'stack' as const,
        sectionTitle: 'Documento del fornitore',
      },
      providers: [
        { provide: ExternalDocumentTypeService, useValue: service },
        {
          provide: AuthService,
          useValue: {
            currentUser: () => clerkWith([TenantPermission.DocumentsConfigure]),
          },
        },
      ],
    });

    expect(screen.getByText('Documento del fornitore')).toBeTruthy();
    expect(view.container.querySelector('.doc-form__header-row--secondary')).toBeNull();
    expect(view.container.querySelectorAll('.doc-panel__field').length).toBe(3);
  });

  it('propone i tipi attivi e la voce di gestione in fondo', async () => {
    const { view } = await setup({
      types: [tipo(), tipo({ id: 'fatt', name: 'Fattura', shortLabel: 'Fatt.' })],
    });

    const options = view.fixture.componentInstance['options']();
    expect(options.map((option) => option.label)).toEqual([
      '—',
      'DDT',
      'Fatt.',
      'Gestisci tipi documento…',
    ]);
  });

  /**
   * La voce crea, riordina ed elimina i tipi del tenant: l'API la nega a chi non
   * configura i documenti, e un comando che risponde 403 al primo clic è peggio
   * di un comando assente.
   *
   * Il controllo inverso qui sopra non è un doppione: una prova che verifica
   * un'assenza passa anche quando quella voce non c'è per nessuno, e allora non
   * sta più verificando la guardia.
   */
  it('senza documents.configure la voce di gestione non si propone', async () => {
    const { view } = await setup({ types: [tipo()], permissions: [] });

    expect(view.fixture.componentInstance['options']().map((option) => option.label)).toEqual([
      '—',
      'DDT',
    ]);
  });

  it('non propone i tipi disattivati', async () => {
    const spento = tipo({
      id: 'vecchio',
      name: 'Nota consegna',
      shortLabel: 'Nota',
      isActive: false,
    });
    const { view } = await setup({ types: [tipo(), spento] });

    expect(view.fixture.componentInstance['options']().map((o) => o.value)).not.toContain(
      'vecchio',
    );
  });

  it('un tipo disattivato resta leggibile sul documento che lo porta gia’', async () => {
    const spento = tipo({
      id: 'vecchio',
      name: 'Nota consegna',
      shortLabel: 'Nota',
      isActive: false,
    });
    const { view } = await setup({ types: [tipo(), spento], typeId: 'vecchio' });

    expect(
      view.fixture.componentInstance['options']().find((o) => o.value === 'vecchio')?.label,
    ).toBe('Nota');
  });

  /**
   * La regressione che questo componente esiste per impedire: un tipo eliminato
   * NON arriva piu' dalla lista. Senza l'opzione ricostruita dallo snapshot la
   * tendina apparirebbe vuota, e il salvataggio successivo cancellerebbe dal
   * documento la dicitura «DDT 145 del 08/05/2026» — in silenzio.
   */
  it('ricostruisce dallo snapshot l’opzione di un tipo eliminato', async () => {
    const { view } = await setup({
      types: [tipo()],
      typeId: 'eliminato-1',
      snapshotLabel: 'Bolla',
    });

    const selected = view.fixture.componentInstance['options']().find(
      (option) => option.value === 'eliminato-1',
    );
    expect(selected?.label).toBe('Bolla');
  });

  it('senza snapshot dice almeno che un tipo c’e’, invece di lasciare il campo muto', async () => {
    const { view } = await setup({ types: [tipo()], typeId: 'eliminato-1' });

    expect(
      view.fixture.componentInstance['options']().find((o) => o.value === 'eliminato-1')?.label,
    ).toBe('Tipo eliminato');
  });

  it('se la lista non arriva resta la selezione del documento, non una tendina vuota', async () => {
    const { view } = await setup({
      listFails: true,
      typeId: 'eliminato-1',
      snapshotLabel: 'Bolla',
    });

    const values = view.fixture.componentInstance['options']().map((o) => o.value);
    expect(values).toContain('eliminato-1');
  });

  it('il numero digitato esce come evento', async () => {
    const docNumberChange = vi.fn();
    const service = { list: vi.fn(() => of([tipo()])) };
    await render(DocumentCounterpartyRefComponent, {
      inputs: { idPrefix: 'test', typeId: '', docNumber: '', docDate: '' },
      on: { docNumberChange },
      providers: [
        { provide: ExternalDocumentTypeService, useValue: service },
        {
          provide: AuthService,
          useValue: {
            currentUser: () => clerkWith([TenantPermission.DocumentsConfigure]),
          },
        },
      ],
    });

    await userEvent.type(screen.getByLabelText('Numero documento'), '145');

    expect(docNumberChange).toHaveBeenCalled();
    expect(docNumberChange.mock.calls.at(-1)?.[0]).toBe('145');
  });

  it('in sola lettura la voce «Gestisci tipi documento…» non si propone', async () => {
    const service = { list: vi.fn(() => of([tipo()])) };
    const view = await render(DocumentCounterpartyRefComponent, {
      inputs: { idPrefix: 'test', typeId: '', docNumber: '', docDate: '', disabled: true },
      providers: [
        { provide: ExternalDocumentTypeService, useValue: service },
        {
          provide: AuthService,
          useValue: {
            currentUser: () => clerkWith([TenantPermission.DocumentsConfigure]),
          },
        },
      ],
    });

    expect(view.fixture.componentInstance['options']().map((o) => o.label)).not.toContain(
      'Gestisci tipi documento…',
    );
  });
});
