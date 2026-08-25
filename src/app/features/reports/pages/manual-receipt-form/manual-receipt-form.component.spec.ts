import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { VatCodeService } from '@core/services/vat-code.service';
import { ViewportService } from '@core/services/viewport.service';

import type { ManualReceipt, SaveManualReceiptBody } from '../../models/manual-receipt.model';
import { ManualReceiptService } from '../../services/manual-receipt.service';
import { ManualReceiptFormComponent } from './manual-receipt-form.component';

/**
 * La maschera del Corrispettivo manuale (`docs/10` §12).
 *
 * ⚠️ **Il test che decide se la funzione è fatta bene** è il giro dell'importo
 * ivato: 70,00 salvati e riaperti in modalità Ivati devono tornare 70,00 — non
 * 69,99. Qui si prova dal lato maschera, dove il difetto vero abita: è la vista
 * che, ricostruendo il netto da ciò che mostra, perde il centesimo.
 */

const IVA_22 = {
  id: 'vat-22',
  code: '22',
  natureId: 'nat-1',
  nature: { id: 'nat-1', key: 'standard', label: 'Imponibile', officialCode: null },
  ratePercent: 22,
  nonDeductiblePercent: 0,
  description: 'Aliquota ordinaria',
  notes: null,
  usageScope: 'both',
  calculationMode: 'standard',
  vatAffectsSupplierTotal: true,
  isDefault: true,
  isActive: true,
  isSystem: true,
  sortOrder: 1,
};

/** Un secondo codice, NON predefinito: serve a provare che si sceglie il primo. */
const IVA_10 = { ...IVA_22, id: 'vat-10', code: '10', ratePercent: 10, isDefault: false };

/** 70,00 ivati al 22%: il netto canonico porta la coda, ed è tutto il punto. */
const NETTO_CANONICO_70 = 5737.7049;

function receipt(overrides: Partial<ManualReceipt> = {}): ManualReceipt {
  return {
    id: 'mr-1',
    number: 12,
    documentDate: '2026-08-17',
    locationId: 'loc-1',
    locationName: 'Negozio Centro',
    pricesIncludeVat: true,
    notes: null,
    currency: 'EUR',
    subtotalMinor: 5738,
    taxMinor: 1262,
    totalMinor: 7000,
    createdByName: 'Owner Test',
    lines: [
      {
        id: 'line-1',
        lineNumber: 1,
        description: 'Vendite cassa esterna',
        enteredAmountMinor: 7000,
        netAmountMinor: NETTO_CANONICO_70,
        vatCodeId: 'vat-22',
        netMinor: 5738,
        vatMinor: 1262,
        grossMinor: 7000,
      },
    ],
    ...overrides,
  };
}

interface SetupOptions {
  readonly id?: string;
  readonly loaded?: ManualReceipt;
  /**
   * Vista compatta: sotto `lg` la tabella diventa card e l'intestazione di
   * colonna sparisce, quindi il selettore netto/ivato indossa l'altra veste.
   */
  readonly compatta?: boolean;
}

async function setup(options: SetupOptions = {}) {
  const create = vi.fn((_body: SaveManualReceiptBody) => of(receipt()));
  const update = vi.fn((_id: string, _body: SaveManualReceiptBody) => of(receipt()));
  const remove = vi.fn(() => of(void 0));

  await render(ManualReceiptFormComponent, {
    providers: [
      provideRouter([{ path: '**', children: [] }]),
      {
        provide: ViewportService,
        useValue: { compact: () => options.compatta === true },
      },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { paramMap: convertToParamMap(options.id ? { id: options.id } : {}) },
        },
      },
      {
        provide: ManualReceiptService,
        useValue: {
          listLocations: () => of([{ id: 'loc-1', name: 'Negozio Centro' }]),
          getById: () => of(options.loaded ?? receipt()),
          create,
          update,
          remove,
        },
      },
      { provide: VatCodeService, useValue: { list: () => of([IVA_10, IVA_22]) } },
    ],
  });

  return { create, update, remove };
}

/**
 * ⚠️ **Il campo vive in DUE viste**: la cella della tabella e la card sotto lg.
 * Convivono nel DOM ed è voluto — a nasconderne una è il CSS, che in jsdom non
 * si applica. Si prende la prima: è lo stesso controllo, e il `FormControl`
 * dietro è uno solo.
 */
function importoRiga(indice = 1): HTMLInputElement {
  return screen.getAllByLabelText<HTMLInputElement>(`Importo riga ${indice}`)[0]!;
}

function esisteImportoRiga(indice = 1): boolean {
  return screen.queryAllByLabelText(`Importo riga ${indice}`).length > 0;
}

/**
 * Il campo è spento?
 *
 * ⚠️ **Non si guarda `input.disabled`**: quella proprietà riflette l'ATTRIBUTO
 * dell'elemento, non lo stato effettivo — un input dentro un `<fieldset
 * disabled>` la riporta `false` anche mentre è inservibile, nel browser come in
 * jsdom. Lo stato vero lo dà il fieldset, e qui se ne guardano tutti gli
 * antenati: la maschera ne ha due annidati — il blocco alla riapertura e il
 * cancello sulla Sede.
 */
function campoSpento(el: HTMLElement): boolean {
  for (let nodo = el.parentElement; nodo; nodo = nodo.parentElement) {
    if (nodo instanceof HTMLFieldSetElement && nodo.disabled) {
      return true;
    }
  }
  return el instanceof HTMLInputElement && el.disabled;
}

/**
 * Un corrispettivo salvato si apre PROTETTO, come ogni documento del
 * gestionale: per toccarlo si passa dal banner e dalla conferma.
 */
async function sbloccaModifica(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: /sblocca modifica/i }));
  await user.click(screen.getByRole('button', { name: 'Sblocca' }));
}

async function scegliSede(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Sede' }));
  await user.click(screen.getByRole('option', { name: 'Negozio Centro' }));
}

/**
 * ⭐ Dal 25/08/2026 il selettore vive nell'INTESTAZIONE DELLA COLONNA, come su
 * ogni altro documento. La veste in testata resta per la sola vista compatta,
 * dove la tabella diventa card e l'intestazione non esiste più.
 */
async function cambiaModalita(
  user: ReturnType<typeof userEvent.setup>,
  voce: 'Ivati' | 'Netti',
): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Modalità importi della registrazione' }));
  await user.click(
    screen.getByRole('menuitemradio', {
      name: voce === 'Ivati' ? 'Usa importi ivati' : 'Usa importi netti',
    }),
  );
}

describe('ManualReceiptFormComponent — il giro dell’importo ivato', () => {
  it('riaprendo una registrazione ivata il campo mostra 70,00, non 69,99', async () => {
    await setup({ id: 'mr-1' });

    // ⚠️ Il campo si ridisegna dal netto CANONICO (5737,7049), non dal netto
    // arrotondato: da 5738 tornerebbe 70,00 solo per caso, e su altri importi
    // no. Con un `Int` in colonna qui si leggerebbe 69,99.
    expect(importoRiga().value).toBe('70,00');
  });

  it('passando a Netti mostra il netto, e il totale non cambia', async () => {
    const user = userEvent.setup();
    await setup({ id: 'mr-1' });
    await sbloccaModifica(user);

    await cambiaModalita(user, 'Netti');

    expect(importoRiga().value).toBe('57,38');
    // I valori si CONVERTONO, non si reinterpretano: la registrazione continua
    // a valere 70,00. Reinterpretare porterebbe il totale a 85,40.
    expect(screen.getAllByText('70,00 €').length).toBeGreaterThan(0);
  });

  it('tornando a Ivati il campo torna 70,00: si può passare avanti e indietro', async () => {
    const user = userEvent.setup();
    await setup({ id: 'mr-1' });
    await sbloccaModifica(user);

    await cambiaModalita(user, 'Netti');
    await cambiaModalita(user, 'Ivati');

    // È la proprietà che il netto canonico esiste per garantire: la vista non
    // ricostruisce mai il valore vero da ciò che mostra.
    expect(importoRiga().value).toBe('70,00');
  });

  it('ridigitando l’importo in modalità netta la registrazione vale il netto digitato', async () => {
    const user = userEvent.setup();
    const { update } = await setup({ id: 'mr-1' });
    await sbloccaModifica(user);

    await cambiaModalita(user, 'Netti');
    await user.clear(importoRiga());
    await user.type(importoRiga(), '100,00');
    await user.click(screen.getByRole('button', { name: 'Salva corrispettivo' }));

    expect(update).toHaveBeenCalledWith(
      'mr-1',
      expect.objectContaining({
        pricesIncludeVat: false,
        lines: [expect.objectContaining({ amountMinor: 10000, vatCodeId: 'vat-22' })],
      }),
    );
  });
});

/**
 * ⚠️ **Salvato si RESTA, e la registrazione è protetta.**
 *
 * Prima si tornava all'elenco: si perdeva di vista quello che si era appena
 * scritto, e col numero assegnato in quel momento. Il meccanismo non è nuovo —
 * è `DocumentEditLockService` con `app-edit-lock-banner`, lo stesso di Arrivo
 * merce, Ordine fornitore, DDT e Ordine cliente.
 */
describe('ManualReceiptFormComponent — blocco alla riapertura e dopo il salvataggio', () => {
  it('una registrazione esistente si apre protetta', async () => {
    await setup({ id: 'mr-1' });

    expect(screen.getByRole('button', { name: /sblocca modifica/i })).toBeTruthy();
    // Protetta vuol dire che non si salva: il pulsante non c'è finché non si
    // sblocca, e i campi sono spenti dal `fieldset`.
    expect(screen.queryByRole('button', { name: 'Salva corrispettivo' })).toBeNull();
    expect(campoSpento(importoRiga())).toBe(true);
  });

  it('sbloccando si può scrivere di nuovo', async () => {
    const user = userEvent.setup();
    await setup({ id: 'mr-1' });

    await sbloccaModifica(user);

    expect(screen.queryByRole('button', { name: /sblocca modifica/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Salva corrispettivo' })).toBeTruthy();
    expect(campoSpento(importoRiga())).toBe(false);
  });

  it('salvato NON si torna all’elenco: si resta, e torna protetto', async () => {
    const user = userEvent.setup();
    await setup({ id: 'mr-1' });
    await sbloccaModifica(user);

    await user.click(screen.getByRole('button', { name: 'Salva corrispettivo' }));

    // Lo sblocco valeva per la modifica che si è appena conclusa, non per tutta
    // la sessione: chi vuole rimetterci mano lo sblocca di nuovo.
    expect(screen.getByRole('button', { name: /sblocca modifica/i })).toBeTruthy();
    expect(screen.getByText(/n\. 12/)).toBeTruthy();
  });
});

/**
 * Il cancello della testata: finché la Sede è vuota il resto è spento, come
 * Arrivo merce e Ordine fornitore. La ragione qui è la **prevedibilità** — la
 * riga non dipende dalla sede — ed è una decisione, non una conseguenza.
 */
describe('ManualReceiptFormComponent — il cancello sulla Sede', () => {
  it('senza sede le righe non ci sono, e lo stato vuoto dice cosa manca', async () => {
    await setup();

    expect(screen.getByText('Scegli la sede')).toBeTruthy();
    // ⚠️ NON sbiadite: una tabella a metà tinta occupa mezzo schermo per non
    // poter essere usata (`regole-stile-ui` §7).
    expect(esisteImportoRiga()).toBe(false);
  });

  it('scelta la sede, le righe compaiono', async () => {
    const user = userEvent.setup();
    await setup();

    await scegliSede(user);

    expect(screen.queryByText('Scegli la sede')).toBeNull();
    expect(esisteImportoRiga()).toBe(true);
  });
});

describe('ManualReceiptFormComponent — cosa parte e cosa no', () => {
  it('la riga nuova propone il Codice IVA predefinito dell’azienda', async () => {
    const user = userEvent.setup();
    const { create } = await setup();
    await scegliSede(user);

    await user.type(importoRiga(), '70,00');
    await user.click(screen.getByRole('button', { name: 'Salva corrispettivo' }));

    // `isDefault` è su IVA 22, non su IVA 10: si propone quello, non il primo
    // dell'elenco.
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ lines: [expect.objectContaining({ vatCodeId: 'vat-22' })] }),
    );
  });

  it('la descrizione è FACOLTATIVA: una riga con importo e IVA si salva', async () => {
    const user = userEvent.setup();
    const { create } = await setup();
    await scegliSede(user);

    await user.type(importoRiga(), '70,00');
    await user.click(screen.getByRole('button', { name: 'Salva corrispettivo' }));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: [expect.objectContaining({ description: '', amountMinor: 7000 })],
      }),
    );
  });

  it('la riga vuota non entra nel payload', async () => {
    const user = userEvent.setup();
    const { update } = await setup({ id: 'mr-1' });
    await sbloccaModifica(user);

    // La riga pronta all'inserimento: si aggiunge e si lascia com'è.
    await user.click(screen.getByRole('button', { name: /aggiungi riga/i }));
    await user.click(screen.getByRole('button', { name: 'Salva corrispettivo' }));

    const body = update.mock.calls[0]![1];
    expect(body.lines).toHaveLength(1);
  });

  it('l’importo parte nella modalità della testata, derivato dal canonico', async () => {
    const user = userEvent.setup();
    const { update } = await setup({ id: 'mr-1' });
    await sbloccaModifica(user);

    await user.click(screen.getByRole('button', { name: 'Salva corrispettivo' }));

    // Non si rimanda `enteredAmountMinor` letto dal record: si ricompone dal
    // canonico, così una riapertura senza modifiche non altera la riga.
    expect(update).toHaveBeenCalledWith(
      'mr-1',
      expect.objectContaining({
        pricesIncludeVat: true,
        lines: [expect.objectContaining({ amountMinor: 7000 })],
      }),
    );
  });

  it('la maschera non offre niente che tocchi il magazzino', async () => {
    await setup({ id: 'mr-1' });

    // ⛔ È la definizione, non una semplificazione: una registrazione che non
    // conosce gli articoli non può muovere quantità.
    expect(screen.queryByLabelText(/quantit/i)).toBeNull();
    expect(screen.queryByText(/^SKU$/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /aggiungi prodotto/i })).toBeNull();
    expect(screen.queryByText(/giacenza/i)).toBeNull();
  });
});

describe('ManualReceiptFormComponent — numero ed eliminazione', () => {
  it('in creazione il numero non si inventa: si assegna al salvataggio', async () => {
    const user = userEvent.setup();
    await setup();
    await scegliSede(user);

    expect(screen.getByText(/assegnato al salvataggio/i)).toBeTruthy();
  });

  it('l’eliminazione dice che il buco resta, prima di chiedere conferma', async () => {
    const user = userEvent.setup();
    const { remove } = await setup({ id: 'mr-1' });

    await user.click(screen.getByRole('button', { name: 'Elimina' }));

    expect(screen.getByText(/resta un buco nella numerazione/i)).toBeTruthy();
    expect(remove).not.toHaveBeenCalled();
  });
});

/**
 * Il rifiuto del salvataggio si VEDE (17/08/2026).
 *
 * ⚠️ **Il difetto era un pulsante che sembrava rotto.** `submitError` esisteva,
 * era `protected` e veniva calcolato correttamente — e nessuno lo leggeva:
 * l'unico banner della maschera era agganciato agli errori di CARICAMENTO.
 * Ogni rifiuto finiva in un signal che non arrivava a schermo.
 *
 * La prova attraversa il varco della Sede apposta: senza quello il salvataggio
 * si ferma prima, sul campo obbligatorio, e non arriverebbe mai al controllo
 * sulle righe — cioè al punto in cui il difetto viveva.
 */
describe('ManualReceiptFormComponent — il rifiuto del salvataggio si vede', () => {
  it('lettere nell’importo: la riga non vale, e la maschera lo dice', async () => {
    const user = userEvent.setup();
    await setup();

    // 1. Il varco: senza Sede le righe restano spente e non si arriva al punto.
    await scegliSede(user);

    // 2. Un importo che non è un importo. Il campo lo ACCETTA di proposito:
    //    `type="text" inputmode="decimal"` è la scelta giusta, perché con i
    //    separatori decimali italiani `type="number"` non va.
    const importo = screen.getAllByLabelText(/Importo riga 1/i)[0] as HTMLInputElement;
    await user.clear(importo);
    await user.type(importo, 'abc');

    // 3. Il rifiuto.
    await user.click(screen.getByRole('button', { name: 'Salva corrispettivo' }));

    // 4. ⚠️ E si vede. Prima qui non compariva niente: il messaggio esisteva,
    //    scritto in un signal che il template non leggeva.
    //
    //    `findAll` e non `find`: in jsdom convivono la vista a tabella e quella
    //    a card — a nasconderne una è il CSS, che qui non gira. Basta che il
    //    rifiuto sia leggibile, non che lo sia una volta sola.
    expect((await screen.findAllByText(/Aggiungi almeno una riga/i)).length).toBeGreaterThan(0);
  });
});

describe('ManualReceiptFormComponent — la modalità importi', () => {
  /**
   * ⭐ **Un corrispettivo NUOVO parte NETTO.**
   *
   * ⛔ Partiva ivato, col commento «è il verso in cui arrivano i valori di una
   * chiusura di cassa». Sembrava una scelta deliberata e non lo era: il
   * proprietario ha chiarito il 25/08/2026 che «non era stato affrontato ancora
   * il documento».
   *
   * ⚠️ La lezione vale oltre questo caso: un default provvisorio scritto in
   * forma affermativa si legge, sei mesi dopo, come una ragione ponderata.
   */
  it('⭐ un corrispettivo nuovo parte NETTO', async () => {
    // ⚠️ La sede prima: a testata incompleta le righe non si mostrano affatto
    // (regole-stile-ui §7), quindi senza non c'è nemmeno l'intestazione.
    const user = userEvent.setup();
    await setup();
    await scegliSede(user);

    // ⭐ `getAllByText`: l'etichetta compare due volte — nell'intestazione di
    // colonna e nel controllo della card — perché le due viste convivono nel
    // DOM e a sceglierne una è il CSS. Che dicano la stessa parola è giusto.
    expect(screen.getAllByText('Importo netto').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Importo ivato')).toHaveLength(0);
  });

  it('⭐ il selettore vive nell’intestazione della colonna, come sugli altri documenti', async () => {
    const user = userEvent.setup();
    await setup();
    await scegliSede(user);

    expect(
      screen.getByRole('button', { name: 'Modalità importi della registrazione' }),
    ).toBeTruthy();
    // ⛔ In vista estesa la veste di testata NON c'è: sarebbero due comandi
    // identici visibili insieme (`regole-stile-ui` §9).
    expect(screen.queryByRole('button', { name: /importi ivati o netti/i })).toBeNull();
  });

  it('⭐ e su schermo compatto indossa l’altra veste, nel pannello di testata', async () => {
    // ⚠️ Sotto `lg` la tabella diventa card e l'intestazione di colonna non
    // esiste più: senza la seconda veste, sul telefono la modalità non si
    // potrebbe cambiare. È la coppia che l'Arrivo merce ha già.
    await setup({ compatta: true });

    expect(screen.getByRole('button', { name: /importi ivati o netti/i })).toBeTruthy();
  });
});
