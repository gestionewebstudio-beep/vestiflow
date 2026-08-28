import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { fireEvent, render, screen } from '@testing-library/angular';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';
import { DocumentStatus, DocumentType } from '@core/models/document.model';
import type { DocumentRecord } from '@core/models/document.model';
import { UserRole } from '@core/models/user.model';
import { DEFAULT_CURRENCY, formatMoney } from '@core/utils/money.util';
import { PaymentOptionsService } from '@core/services/payment-options.service';
import { CustomerService } from '@domain/customers/services/customer.service';
import type { DocumentListProfile } from '@domain/documents/models/document-list-query.model';
import { DocumentService } from '@domain/documents/services/document.service';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import { SupplierService } from '@domain/suppliers/services/supplier.service';
import type { ListAction } from '@shared/models/list-selection.model';
import { TableViewPreferenceApiService } from '@shared/table-columns/table-view-preference-api.service';

import { DocumentListComponent, SECONDARY_CREATE_ENTRIES } from './document-list.component';
import { ExternalDocumentTypeService } from '@domain/documents/services/external-document-type.service';

/**
 * Test di CARATTERIZZAZIONE.
 *
 * `document-list` è UN componente che serve NOVE tipi di elenco documento:
 * titolo, sottotitolo, placeholder di ricerca ed empty state sono derivati dal
 * profilo che arriva dai dati di rotta. Una regressione qui non rompe niente —
 * mostra l'etichetta di un altro tipo documento, e non se ne accorge nessuno
 * finché non lo segnala un cliente.
 *
 * Un test per profilo: TestBed non si lascia riconfigurare due volte nello
 * stesso `it`.
 */

/** Risposta paginata nella forma reale dell'API: vuota se non si passa nulla. */
const paginato = (data: readonly DocumentRecord[] = []) => ({
  data,
  meta: { page: 1, pageSize: 20, total: data.length, totalPages: data.length > 0 ? 1 : 0 },
});

const PROFILI_VENDITA = ['quote', 'proforma', 'sales-ddt', 'invoice'] as const;

const PROFILI: readonly DocumentListProfile[] = [
  'generic',
  'goods-receipt',
  ...PROFILI_VENDITA,
  'manual-unload',
  'purchase-invoice',
  'store-sale',
];

interface ProfileLabels {
  listProfile: () => string;
  pageTitle: () => string;
  pageSubtitle: () => string;
  searchPlaceholder: () => string;
  emptyStateTitle: () => string;
  emptyStateDescription: () => string;
  emptyStateIcon: () => string;
}

/** Utente della sessione: `null` = nessun permesso (default dei test di etichetta). */
interface UtenteDiProva {
  readonly role: string;
  readonly permissions: readonly string[];
  /**
   * Interruttore aziendale della Vendita manuale.
   *
   * ⚠️ Nei test nasce ACCESO, al contrario della produzione: questi provano i
   * comandi e i permessi, non l’interruttore. Chi prova l’interruttore lo
   * dichiara, in un verso o nell’altro.
   */
  readonly manualUnloadEnabled?: boolean;
}

async function renderList(
  profile: DocumentListProfile,
  user: UtenteDiProva | null = null,
  /** Filtro «Tipo» già attivo, come se si arrivasse da un link filtrato. */
  typeFilter?: string,
  /** Righe che l'API restituisce: servono ai test che hanno bisogno di dati veri. */
  documents: readonly DocumentRecord[] = [],
  /** Ordinamento già nell'URL, come se si arrivasse da un link condiviso. */
  sort?: string,
) {
  const data = { documentListProfile: profile };
  const queryParams = {
    ...(typeFilter ? { type: typeFilter } : {}),
    ...(sort ? { sort } : {}),
  };
  return render(DocumentListComponent, {
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          data: of(data),
          snapshot: { data, queryParamMap: convertToParamMap(queryParams) },
          queryParamMap: of(convertToParamMap(queryParams)),
        },
      },
      {
        provide: AuthService,
        useValue: {
          currentUser: () => (user ? { manualUnloadEnabled: true, ...user } : null),
        },
      },
      {
        provide: DocumentService,
        useValue: {
          getDocuments: () => of(paginato(documents)),
          getOperators: () => of([]),
          deleteDocument: vi.fn(),
          exportPdf: vi.fn(),
        },
      },
      { provide: ExternalDocumentTypeService, useValue: { list: () => of([]) } },
      { provide: CustomerService, useValue: { getCustomers: () => of(paginato()) } },
      { provide: SupplierService, useValue: { getSuppliers: () => of([]) } },
      { provide: PaymentOptionsService, useValue: { list: () => of([]) } },
      { provide: OperationalLocationsService, useValue: { locations: () => [] } },
      {
        provide: TableViewPreferenceApiService,
        useValue: { load: () => of(null), save: () => of(undefined) },
      },
    ],
  });
}

async function setup(profile: DocumentListProfile): Promise<ProfileLabels> {
  const view = await renderList(profile);

  return view.fixture.componentInstance as unknown as ProfileLabels;
}

describe('DocumentListComponent — caratterizzazione dei profili', () => {
  for (const profile of PROFILI) {
    describe(`profilo «${profile}»`, () => {
      it('arriva al componente dai dati di rotta', async () => {
        const component = await setup(profile);

        expect(component.listProfile()).toBe(profile);
      });

      it('non lascia etichette vuote', async () => {
        const component = await setup(profile);

        expect(component.pageTitle()).toBeTruthy();
        expect(component.pageSubtitle()).toBeTruthy();
        expect(component.searchPlaceholder()).toBeTruthy();
        expect(component.emptyStateTitle()).toBeTruthy();
        expect(component.emptyStateDescription()).toBeTruthy();
        expect(component.emptyStateIcon()).toBeTruthy();
      });
    });
  }

  it('il profilo generico è il fallback del registro documenti', async () => {
    const component = await setup('generic');

    expect(component.pageTitle()).toBe('Registro documenti');
    expect(component.emptyStateTitle()).toBe('Nessun documento');
    expect(component.emptyStateIcon()).toBe('pi-file');
  });

  it('l’arrivo merce ha etichette proprie, non quelle del registro', async () => {
    const component = await setup('goods-receipt');

    expect(component.pageTitle()).toBe('Arrivi merce');
    expect(component.emptyStateTitle()).toBe('Nessun arrivo merce');
    expect(component.searchPlaceholder()).toContain('fornitore');
  });

  for (const profile of PROFILI_VENDITA) {
    it(`«${profile}» non ricade sulle etichette generiche`, async () => {
      const component = await setup(profile);

      expect(component.pageTitle()).not.toBe('Registro documenti');
      expect(component.pageTitle()).not.toBe('Arrivi merce');
    });
  }
});

/**
 * I comandi di creazione del registro generico valevano «gestisce almeno UNA
 * famiglia»: chi poteva fare solo preventivi vedeva comunque il carico e tutti
 * e nove i tipi del menu, che l'API adesso rifiuta con un 403.
 */
describe('DocumentListComponent — comandi di creazione e matrice permessi', () => {
  const SOLO_PREVENTIVI: UtenteDiProva = {
    role: UserRole.Clerk,
    permissions: ['section.documents', 'doc.quote.manage'],
  };

  /** Voci offerte dal menu «Altro documento», per etichetta. */
  function tipiOfferti(view: { fixture: { componentInstance: unknown } }): readonly string[] {
    const component = view.fixture.componentInstance as {
      secondaryCreateOptions: () => readonly { readonly label: string }[];
    };
    return component.secondaryCreateOptions().map((option) => option.label);
  }

  it('non offre «Nuovo arrivo merce» a chi non gestisce i carichi', async () => {
    await renderList('generic', SOLO_PREVENTIVI);

    expect(screen.queryByRole('button', { name: /Nuovo arrivo merce/i })).toBeNull();
  });

  it('nel menu «Altro documento» lascia solo i tipi gestibili', async () => {
    const view = await renderList('generic', SOLO_PREVENTIVI);

    expect(tipiOfferti(view)).toEqual(['Preventivo']);
  });

  it('senza famiglie gestibili la testata non offre alcuna creazione', async () => {
    await renderList('generic', {
      role: UserRole.Clerk,
      permissions: ['section.documents', 'doc.goods_receipt.view'],
    });

    expect(screen.queryByRole('button', { name: /Nuovo arrivo merce/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Crea altro tipo di documento/i })).toBeNull();
  });

  it('al titolare resta tutto il menu', async () => {
    const view = await renderList('generic', { role: UserRole.Owner, permissions: [] });

    // Il confronto è con l'elenco dichiarato, non con un numero: `toHaveLength(9)`
    // andava aggiornato a mano a ogni voce nuova, e diceva «sono nove» invece di
    // «non ne manca nessuna» — che è la regola vera per chi ha tutti i permessi.
    expect(tipiOfferti(view)).toEqual(SECONDARY_CREATE_ENTRIES.map((entry) => entry.label));
    expect(screen.queryByRole('button', { name: /Crea altro tipo di documento/i })).not.toBeNull();
  });
});

/**
 * Il filtro «Tipo» guarda, il menu «Nuovo» crea — e non si toccano.
 *
 * Il difetto che questi test chiudono (trovato guardando la schermata, non dai
 * test): il registro Fatture usava il filtro **anche** come selettore implicito
 * del documento da creare. Con il filtro su Nota di credito il pulsante
 * diventava «Nuova nota di credito» e ci mandava; con Accompagnatoria, l'altra.
 * L'operatore non aveva modo di creare una Fattura mentre guardava le note di
 * credito, e nell'empty state si leggeva «Nessuna fattura» sopra un pulsante
 * «Nuova nota di credito».
 *
 * Veniva dal modulo a due tipi (`17de1f68`), dove la scorciatoia sembrava una
 * comodità. Col terzo tipo è diventata visibile — ma era sbagliata già prima.
 */
describe('DocumentListComponent — il filtro non decide cosa si crea', () => {
  const titolare = { role: UserRole.Owner, permissions: [] };

  /** Le voci del menu «Nuovo» dell'elenco condiviso. */
  function vociDelMenuNuovo(view: { fixture: { componentInstance: unknown } }): readonly string[] {
    const component = view.fixture.componentInstance as {
      createVariantOptions: () => readonly { readonly label: string; readonly value: string }[];
    };
    return component.createVariantOptions().map((option) => option.label);
  }

  function rotteDelMenuNuovo(view: { fixture: { componentInstance: unknown } }): readonly string[] {
    const component = view.fixture.componentInstance as {
      createVariantOptions: () => readonly { readonly value: string }[];
    };
    return component.createVariantOptions().map((option) => option.value);
  }

  const TRE_TIPI = ['Nuova fattura', 'Nuova fattura accompagnatoria', 'Nuova nota di credito'];

  for (const filtro of ['', 'invoice', 'invoice_accompanying', 'credit_note']) {
    it(`con filtro «${filtro || 'Tutti'}» il menu Nuovo offre sempre i tre tipi`, async () => {
      const view = await renderList('invoice', titolare, filtro || undefined);

      expect(vociDelMenuNuovo(view)).toEqual(TRE_TIPI);
    });
  }

  it('dal filtro Nota di credito posso creare una Fattura', async () => {
    const view = await renderList('invoice', titolare, 'credit_note');
    const component = view.fixture.componentInstance as unknown as {
      onCreateVariant: (type: string) => void;
    };
    const router = TestBed.inject(Router);
    const naviga = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    component.onCreateVariant(DocumentType.Invoice);

    expect(naviga).toHaveBeenCalledWith('/app/documents/fattura/new');
  });

  it('dal filtro Fattura accompagnatoria posso creare una Nota di credito', async () => {
    const view = await renderList('invoice', titolare, 'invoice_accompanying');
    const component = view.fixture.componentInstance as unknown as {
      onCreateVariant: (type: string) => void;
    };
    const router = TestBed.inject(Router);
    const naviga = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    component.onCreateVariant(DocumentType.CreditNote);

    expect(naviga).toHaveBeenCalledWith('/app/documents/nota-di-credito/new');
  });

  // Un solo render per `it`: TestBed non si lascia riconfigurare due volte
  // (nota in testa al file). Che le ETICHETTE non cambino col filtro lo prova
  // il ciclo qui sopra su tutti e quattro; qui si fissa che sotto il filtro più
  // «lontano» dalla Fattura le rotte restino comunque quelle dei tre tipi.
  it('sotto il filtro Nota di credito le rotte del menu sono comunque i tre tipi', async () => {
    const view = await renderList('invoice', titolare, 'credit_note');

    expect(rotteDelMenuNuovo(view)).toEqual([
      DocumentType.Invoice,
      DocumentType.InvoiceAccompanying,
      DocumentType.CreditNote,
    ]);
  });

  it('lo stato vuoto non propone un tipo al posto dell operatore', async () => {
    const view = await renderList('invoice', titolare, 'credit_note');
    const component = view.fixture.componentInstance as unknown as {
      emptyStateCtaLabel: () => string | undefined;
      emptyStateTitle: () => string;
      emptyStateDescription: () => string;
    };

    // Nessuna CTA a bottone singolo: al suo posto il menu a tre voci.
    expect(component.emptyStateCtaLabel()).toBeUndefined();
    // E i testi non nominano un solo tipo della famiglia.
    expect(component.emptyStateTitle()).not.toMatch(/fattura/i);
    expect(component.emptyStateDescription()).toContain('note di credito');
  });

  it('gli elenchi a tipo singolo restano col bottone diretto', async () => {
    const view = await renderList('quote', titolare);

    expect(vociDelMenuNuovo(view)).toEqual([]);
    expect(
      (
        view.fixture.componentInstance as unknown as { salesCreateLabel: () => string | undefined }
      ).salesCreateLabel(),
    ).toBe('Nuovo preventivo');
  });
});

/**
 * Un documento vero da mettere in tabella. È un **preventivo** perché il tipo
 * servirà anche ai test che verranno: il Preventivo ha una pagina di Dettaglio
 * dedicata (`14` §E4).
 */
const DOCUMENTO_DI_PROVA: DocumentRecord = {
  id: 'doc-quote-1',
  tenantId: 'ten-1',
  createdAt: '2026-08-20T08:00:00.000Z',
  updatedAt: '2026-08-20T08:00:00.000Z',
  type: DocumentType.Quote,
  status: DocumentStatus.Confirmed,
  series: '',
  number: 7,
  year: 2026,
  documentDate: '2026-08-20',
  currency: DEFAULT_CURRENCY,
  subtotal: { amountMinor: 0, currencyCode: DEFAULT_CURRENCY },
  tax: { amountMinor: 0, currencyCode: DEFAULT_CURRENCY },
  total: { amountMinor: 0, currencyCode: DEFAULT_CURRENCY },
  pricesIncludeVat: false,
  createdByName: 'Operatore',
  customerName: 'Cliente di prova',
};

/**
 * ⛔ **La riga si renderizza.** Sembra una prova inutile, ed è invece quella che
 * mancava: dal 20/08 (`5aa4a0ea`, l'assorbimento nel motore tabella)
 * l'etichetta di riga era passata al motore **per nome** — un metodo di classe,
 * quindi senza `this` — e la prima riga cliccabile che si renderizzava lanciava
 * «Cannot read properties of undefined». L'elenco documenti, tutti e otto i
 * profili, andava giù appena aveva un documento da mostrare.
 *
 * ⚠️ **Nessuno dei quaranta test di questo file se n'era accorto**, e la causa è
 * strutturale: rendevano tutti ZERO righe, dove la callback non viene mai
 * invocata. Lint verde, build verde, l'intera suite verde, elenco giù.
 */
describe('DocumentListComponent — una riga vera si renderizza', () => {
  it('⛔ la riga porta il proprio nome accessibile: la callback arriva legata', async () => {
    await renderList('generic', { role: UserRole.Owner, permissions: [] }, undefined, [
      DOCUMENTO_DI_PROVA,
    ]);

    expect(screen.getByRole('row', { name: /Apri documento/i })).not.toBeNull();
  });
});

/**
 * ⭐ **Il Dettaglio era una funzione senza porta** (`14` §E4).
 *
 * Da quando il clic di riga apre la Modifica, nessun punto dell'interfaccia
 * portava piu' alla vista di consultazione: `documentDetailPath` aveva zero
 * chiamanti, e ci si arrivava solo per URL o per un documento annullato. La
 * rotta c'era, la funzione era decisa, mancava il comando.
 *
 * ⛔ La guardia che conta e' la SECONDA: l'indirizzo del Dettaglio si ricava dal
 * **tipo** del documento, non dal profilo di elenco da cui lo si e' aperto. E'
 * quello che `14` §13.3 vieta — lo stesso documento con due aperture diverse a
 * seconda di dove lo si e' trovato — e in questa pagina il precedente esiste
 * gia': il vecchio `openDocumentDetail` di Etichette/Allegati compone
 * l'indirizzo dal profilo, e sul registro generico manda un preventivo al
 * dettaglio generico.
 */
describe('DocumentListComponent — l’azione Dettaglio', () => {
  const titolare = { role: UserRole.Owner, permissions: [] };

  function azioni(view: { fixture: { componentInstance: unknown } }): readonly ListAction[] {
    const component = view.fixture.componentInstance as {
      selectionActions: () => readonly ListAction[];
    };
    return component.selectionActions();
  }

  function dettaglio(view: { fixture: { componentInstance: unknown } }): ListAction {
    const azione = azioni(view).find((candidata) => candidata.id === 'detail');
    if (!azione) {
      throw new Error('la barra non dichiara l’azione Dettaglio');
    }
    return azione;
  }

  it('la barra dichiara il Dettaglio, e pretende UN documento', async () => {
    const view = await renderList('generic', titolare);

    expect(dettaglio(view).label).toBe('Dettaglio');
    // `'one'`: a zero e a due o piu' il contratto comune la spegne da se', con la
    // ragione giusta. Qui si fissa la pretesa, non le frasi.
    expect(dettaglio(view).requires).toBe('one');
  });

  it('⛔ l’indirizzo viene dal TIPO, non dal profilo di elenco', async () => {
    const view = await renderList('generic', titolare, undefined, [DOCUMENTO_DI_PROVA]);
    const navigazione = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    dettaglio(view).run?.({ scope: 'selection', ids: [DOCUMENTO_DI_PROVA.id] });

    expect(navigazione).toHaveBeenCalledWith('/app/documents/quote/doc-quote-1');
  });

  it('col bersaglio «filtered» non naviga da nessuna parte', async () => {
    const view = await renderList('generic', titolare, undefined, [DOCUMENTO_DI_PROVA]);
    const navigazione = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    dettaglio(view).run?.({ scope: 'filtered' });

    expect(navigazione).not.toHaveBeenCalled();
  });
});

/**
 * ⭐ **L'ordinamento dell'elenco documenti** (`14` §H15).
 *
 * L'elenco è paginato lato server: ordinare le righe caricate darebbe la prima
 * pagina rimescolata e la chiamerebbe «la più recente». Le chiavi viaggiano
 * quindi nell'URL e da lì nella query — nella grammatica del motore, che è
 * l'unica.
 */
describe('DocumentListComponent — l’ordinamento', () => {
  const titolare = { role: UserRole.Owner, permissions: [] };

  function pagina(view: { fixture: { componentInstance: unknown } }) {
    return view.fixture.componentInstance as {
      onSortChange: (chiavi: readonly { columnId: string; direction: string }[]) => void;
      apiQuery: () => { sort?: readonly { columnId: string }[] };
    };
  }

  it('⛔ cambiare ordine riporta alla PRIMA pagina', async () => {
    const view = await renderList('generic', titolare, undefined, [DOCUMENTO_DI_PROVA]);
    const navigazione = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    pagina(view).onSortChange([{ columnId: 'documentDate', direction: 'desc' }]);

    expect(navigazione).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        queryParams: { sort: 'documentDate:desc', page: null },
      }),
    );
  });

  it('⭐ più chiavi restano nell’ordine di priorità, nella grammatica del motore', async () => {
    const view = await renderList('generic', titolare);
    const navigazione = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    pagina(view).onSortChange([
      { columnId: 'total', direction: 'asc' },
      { columnId: 'documentDate', direction: 'desc' },
    ]);

    expect(navigazione).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        queryParams: { sort: 'total:asc,documentDate:desc', page: null },
      }),
    );
  });

  it('⚠️ una colonna che il server non ordina, arrivata dall’URL, non gli viene chiesta', async () => {
    // `counterparty` non è nella whitelist — non è un campo del database —:
    // l'API risponderebbe 400, e un link vecchio aprirebbe una pagina di
    // errore invece di un elenco.
    const view = await renderList(
      'generic',
      titolare,
      undefined,
      [],
      'counterparty:asc,total:desc',
    );

    expect(pagina(view).apiQuery().sort).toEqual([{ columnId: 'total', direction: 'desc' }]);
  });

  it('⭐ gli enum si premono: il loro ordine è quello dichiarato nello schema', async () => {
    await renderList('generic', titolare, undefined, [DOCUMENTO_DI_PROVA]);

    expect(screen.getByRole('button', { name: /Data/ })).not.toBeNull();
    expect(screen.getByRole('button', { name: /Tipo/ })).not.toBeNull();
    expect(screen.getByRole('button', { name: /Stato/ })).not.toBeNull();
  });

  it('⛔ la Controparte no: non è un campo, e la soluzione non è un CASE SQL', async () => {
    await renderList('generic', titolare, undefined, [DOCUMENTO_DI_PROVA]);

    expect(screen.queryByRole('button', { name: /^Controparte/ })).toBeNull();
  });
});

/**
 * ⭐ **I riepiloghi non impaginano** (`14` §H14-bis): si aprono sugli ultimi 30
 * giorni e chiedono tutto il risultato del filtro. È ciò che rende onesto
 * ordinare nel client — l'insieme caricato È il risultato, non una pagina.
 */
describe('DocumentListComponent — niente pagine, ultimi 30 giorni', () => {
  const titolare = { role: UserRole.Owner, permissions: [] };

  function apiQuery(view: { fixture: { componentInstance: unknown } }) {
    return (
      view.fixture.componentInstance as {
        apiQuery: () => { all?: boolean; dateFrom?: string; dateTo?: string };
      }
    ).apiQuery();
  }

  it('⛔ chiede TUTTO il risultato del filtro, non una pagina', async () => {
    const view = await renderList('generic', titolare);

    expect(apiQuery(view).all).toBe(true);
  });

  it('⭐ si apre sugli ultimi 30 giorni anche se l’URL non porta date', async () => {
    const view = await renderList('generic', titolare);
    const { dateFrom, dateTo } = apiQuery(view);

    expect(dateFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dateTo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Trenta giorni inclusivi: oggi più i ventinove precedenti.
    const giorni =
      (Date.parse(`${dateTo}T00:00:00Z`) - Date.parse(`${dateFrom}T00:00:00Z`)) / 86_400_000;
    expect(giorni).toBe(29);
  });

  it('le date scelte nell’URL vincono sul predefinito', async () => {
    const view = await render(DocumentListComponent, {
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            data: of({ documentListProfile: 'generic' }),
            snapshot: {
              data: { documentListProfile: 'generic' },
              queryParamMap: convertToParamMap({ dateFrom: '2026-01-01', dateTo: '2026-01-31' }),
            },
            queryParamMap: of(convertToParamMap({ dateFrom: '2026-01-01', dateTo: '2026-01-31' })),
          },
        },
        { provide: AuthService, useValue: { currentUser: () => titolare } },
        {
          provide: DocumentService,
          useValue: {
            getDocuments: () => of(paginato()),
            getOperators: () => of([]),
            deleteDocument: vi.fn(),
            exportPdf: vi.fn(),
          },
        },
        { provide: ExternalDocumentTypeService, useValue: { list: () => of([]) } },
        { provide: CustomerService, useValue: { getCustomers: () => of(paginato()) } },
        { provide: SupplierService, useValue: { getSuppliers: () => of([]) } },
        { provide: PaymentOptionsService, useValue: { list: () => of([]) } },
        { provide: OperationalLocationsService, useValue: { locations: () => [] } },
        {
          provide: TableViewPreferenceApiService,
          useValue: { load: () => of(null), save: () => of(undefined) },
        },
      ],
    });

    expect(apiQuery(view).dateFrom).toBe('2026-01-01');
    expect(apiQuery(view).dateTo).toBe('2026-01-31');
  });
});

/**
 * ⛔ **Il verso economico nel totale della selezione** (`15c` §6.1, §12.2-12.3).
 *
 * Qui la somma era `sum + doc.total.amountMinor`, senza verso. Due registri
 * mescolano tipi di direzione opposta — Fatture con la **Nota di credito**,
 * Vendite al banco col **Reso** — quindi una Fattura da 100 e una Nota di
 * credito da 30 davano 130 nella barra della selezione.
 */
describe('DocumentListComponent — totale della selezione col verso economico', () => {
  const TITOLARE = { role: UserRole.Owner, permissions: [] };

  const docEuro = (
    id: string,
    type: DocumentType,
    totaleMinor: number,
  ): DocumentRecord => ({
    ...DOCUMENTO_DI_PROVA,
    id,
    type,
    total: { amountMinor: totaleMinor, currencyCode: DEFAULT_CURRENCY },
  });

  /**
   * Seleziona tutte le righe e restituisce il totale letto dalla barra.
   *
   * ⚠️ **Per NOME accessibile, non per indice.** Le caselle rese sono quattro
   * per due righe, e l’ordine non è quello che sembra: l’indice 1 è
   * «Seleziona tutti i documenti», non la prima riga. Un ciclo sugli indici
   * 1-2 selezionava tutto e poi DESELEZIONAVA la prima — il totale contava
   * una riga sola, e la prova falliva per un difetto suo.
   *
   * ⚠️ E legge il SECONDO `.list-actions__selection-value`: il primo è il
   * conteggio dei selezionati, il totale viene dopo.
   */
  async function totaleDiTutte(righe: readonly DocumentRecord[]): Promise<string> {
    const view = await renderList('generic', TITOLARE, undefined, righe);
    const tutte = await screen.findByRole(`checkbox`, { name: `Seleziona tutti i documenti` });

    fireEvent.click(tutte);
    view.detectChanges();

    const valori = view.container.querySelectorAll('.list-actions__selection-value');
    expect(valori.length, `la barra non mostra conteggio e totale`).toBe(2);
    expect(valori[0]?.textContent?.trim(), `non sono selezionate tutte le righe`).toBe(
      String(righe.length),
    );
    return valori[1]?.textContent?.trim() ?? '';
  }

  it('⭐ Fattura 100 + Nota di credito 30 = 70', async () => {
    const totale = await totaleDiTutte([
      docEuro('f-1', DocumentType.Invoice, 10000),
      docEuro('nc-1', DocumentType.CreditNote, 3000),
    ]);

    expect(totale).toBe(formatMoney({ amountMinor: 7000, currencyCode: DEFAULT_CURRENCY }));
  });

  it('⭐ Vendita al banco 100 + Reso al banco 30 = 70', async () => {
    const totale = await totaleDiTutte([
      docEuro('v-1', DocumentType.StoreSale, 10000),
      docEuro('r-1', DocumentType.StoreReturn, 3000),
    ]);

    expect(totale).toBe(formatMoney({ amountMinor: 7000, currencyCode: DEFAULT_CURRENCY }));
  });

  /**
   * ⚠️ Un elenco a verso unico non cambia: se cambiasse, il segno starebbe
   * entrando dove non serve.
   */
  it('⭐ un elenco a verso unico somma come prima', async () => {
    const totale = await totaleDiTutte([
      docEuro('a', DocumentType.GoodsReceipt, 10000),
      docEuro('b', DocumentType.GoodsReceipt, 3000),
    ]);

    expect(totale).toBe(formatMoney({ amountMinor: 13000, currencyCode: DEFAULT_CURRENCY }));
  });
});
