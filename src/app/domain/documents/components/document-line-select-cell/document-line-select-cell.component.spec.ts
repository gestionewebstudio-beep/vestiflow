import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DocumentLineSelectCellComponent } from './document-line-select-cell.component';

const IVA = [
  { value: 'id-4', label: '4', detail: '4% · Imponibile 4%' },
  { value: 'id-10', label: '10', detail: '10% · Imponibile 10%' },
  { value: 'id-22', label: '22', detail: '22% · Imponibile 22%' },
  { value: 'id-22r', label: '22r', detail: '22% · Imp. 22% acquisti rev. charge art. 17' },
];

const UM = [
  { value: 'pz', label: 'pz' },
  { value: 'conf', label: 'conf' },
];

async function apri(
  inputs: Partial<{
    options: readonly { value: string; label: string; detail?: string }[];
    value: string;
    freeText: boolean;
    manageLabel: string;
  }> = {},
) {
  const valueChange = vi.fn();
  const lineAdvance = vi.fn();
  const lineRetreat = vi.fn();
  const lineRowAdvance = vi.fn();
  const manageRequested = vi.fn();
  await render(DocumentLineSelectCellComponent, {
    inputs: {
      lineIndex: 2,
      inputId: 'cella',
      ariaLabel: 'Codice IVA riga',
      options: IVA,
      value: 'id-22',
      ...inputs,
    },
    on: { valueChange, lineAdvance, lineRetreat, lineRowAdvance, manageRequested },
  });
  return {
    valueChange,
    lineAdvance,
    lineRetreat,
    lineRowAdvance,
    manageRequested,
    campo: screen.getByRole<HTMLInputElement>('textbox'),
  };
}

describe('DocumentLineSelectCellComponent', () => {
  it('mostra il CODICE della voce scelta, non il suo identificativo', async () => {
    const { campo } = await apri();

    expect(campo.value).toBe('22');
  });

  // È il motivo per cui questa cella esiste: il giro del fuoco raggiunge i campi
  // per identificativo, e su un `app-select-menu` quell'id non stava sul DOM.
  it('l’identificativo ricevuto finisce sull’input, dove il fuoco lo cerca', async () => {
    const { campo } = await apri();

    expect(campo.id).toBe('cella');
    expect(globalThis.document.getElementById('cella')).toBe(campo);
  });

  // §4.3 — il filtro dà precedenza al codice. È il caso a un carattere, quello
  // più usato: si digita una cifra e si guarda cosa compare in cima.
  it('digitando filtra col codice davanti alla descrizione', async () => {
    const user = userEvent.setup();
    const { campo } = await apri();

    campo.focus();
    await user.keyboard('{Control>}a{/Control}1');

    // «10» comincia con 1; «22r» lo contiene solo nell'«art. 17» della
    // descrizione, e finisce dopo invece che davanti.
    const voci = screen.getAllByRole('option').map((o) => o.textContent?.trim() ?? '');
    expect(voci[0]).toMatch(/^10/);
    expect(voci[1]).toMatch(/^22r/);
  });

  // §4.5 — Invio registra e resta: qui «registrare» è prendere la voce
  // evidenziata, che è la risoluzione di quello che si è digitato.
  it('Invio prende la voce evidenziata e NON avanza', async () => {
    const user = userEvent.setup();
    const { valueChange, lineAdvance, campo } = await apri();

    campo.focus();
    await user.keyboard('{Control>}a{/Control}4{Enter}');

    expect(valueChange).toHaveBeenCalledWith('id-4');
    expect(lineAdvance).not.toHaveBeenCalled();
  });

  it('Tab risolve quello che si è digitato e POI avanza', async () => {
    const user = userEvent.setup();
    const { valueChange, lineAdvance, campo } = await apri();

    campo.focus();
    await user.keyboard('{Control>}a{/Control}10{Tab}');

    expect(valueChange).toHaveBeenCalledWith('id-10');
    expect(lineAdvance).toHaveBeenCalledWith(2);
  });

  // §4.3 — insieme chiuso: un codice inventato non ha aliquota né natura, non è
  // calcolabile. Non entra, e la cella torna a mostrare quello di prima.
  it('senza testo libero un valore inventato non entra', async () => {
    const user = userEvent.setup();
    const { valueChange, campo } = await apri();

    campo.focus();
    await user.keyboard('{Control>}a{/Control}zzz{Tab}');

    expect(valueChange).not.toHaveBeenCalled();
    expect(campo.value).toBe('22');
  });

  it('col testo libero quello che si scrive resta', async () => {
    const user = userEvent.setup();
    const { valueChange, campo } = await apri({
      options: UM,
      value: 'pz',
      freeText: true,
    });

    campo.focus();
    await user.keyboard('{Control>}a{/Control}mazzo{Tab}');

    expect(valueChange).toHaveBeenCalledWith('mazzo');
  });

  // §4.3 — sulle celle a selezione la freccia porta al campo accanto al primo
  // colpo: percorrere il testo di un valore che si sceglie non porta da nessuna
  // parte. È il tipo di regola che, non scritta, chi implementa inventa.
  //
  // Lo stato provato è quello vero dell'ingresso col Tab (§4.1): il valore è
  // tutto evidenziato. Con la regola dei due tempi la freccia collasserebbe la
  // selezione e resterebbe nel campo.
  it('→ esce al primo colpo, col valore ancora evidenziato', async () => {
    const user = userEvent.setup();
    const { lineAdvance, campo } = await apri();

    campo.focus();
    await user.keyboard('{Control>}a{/Control}{ArrowRight}');

    expect(lineAdvance).toHaveBeenCalledWith(2);
  });

  it('← esce al primo colpo, col valore ancora evidenziato', async () => {
    const user = userEvent.setup();
    const { lineRetreat, campo } = await apri();

    campo.focus();
    await user.keyboard('{Control>}a{/Control}{ArrowLeft}');

    expect(lineRetreat).toHaveBeenCalledWith(2);
  });

  it('↓ a elenco chiuso muove la RIGA, a elenco aperto muove l’elenco', async () => {
    const user = userEvent.setup();
    const { lineRowAdvance, valueChange, campo } = await apri();

    campo.focus();
    await user.keyboard('{ArrowDown}');
    expect(lineRowAdvance).toHaveBeenCalledWith(2);

    await user.keyboard('{Control>}a{/Control}2{ArrowDown}{Enter}');
    // «2» filtra 22 e 22r; ↓ scende alla seconda.
    expect(valueChange).toHaveBeenCalledWith('id-22r');
  });

  // La voce-comando non ha valore-sentinella: è un output. Se passasse dalla
  // porta dei valori, un chiamante distratto scriverebbe la stringa finta nel
  // form control — che è come funziona il pattern esistente in Arrivo merce.
  it('«Altro…» emette un comando, non un valore', async () => {
    const user = userEvent.setup();
    const { manageRequested, valueChange, campo } = await apri({
      options: UM,
      value: 'pz',
      freeText: true,
      manageLabel: '» Altro…',
    });

    campo.focus();
    await user.keyboard('{Control>}a{/Control}zzz');
    expect(screen.queryAllByRole('option')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: '» Altro…' }));

    expect(manageRequested).toHaveBeenCalled();
    expect(valueChange).not.toHaveBeenCalled();
  });

  // Su card le colonne non ci sono: trattenere il Tab senza avere dove mandarlo
  // chiuderebbe dentro chi naviga da tastiera. Invio invece si tiene comunque,
  // o dentro un <form> manderebbe il documento in salvataggio.
  it('fuori dal giro delle colonne il Tab resta al browser, Invio no', async () => {
    const user = userEvent.setup();
    const valueChange = vi.fn();
    const lineAdvance = vi.fn();
    await render(DocumentLineSelectCellComponent, {
      inputs: {
        lineIndex: 2,
        ariaLabel: 'Codice IVA riga',
        options: IVA,
        value: 'id-22',
        inColumnCycle: false,
      },
      on: { valueChange, lineAdvance },
    });
    const campo = screen.getByRole<HTMLInputElement>('textbox');

    campo.focus();
    await user.keyboard('{Control>}a{/Control}4{Tab}');
    expect(lineAdvance).not.toHaveBeenCalled();

    campo.focus();
    await user.keyboard('{Control>}a{/Control}10{Enter}');
    expect(valueChange).toHaveBeenCalledWith('id-10');
  });

  it('da tastiera «Altro…» è l’ultima fermata dell’elenco', async () => {
    const user = userEvent.setup();
    const { manageRequested, campo } = await apri({
      options: UM,
      value: 'pz',
      freeText: true,
      manageLabel: '» Altro…',
    });

    campo.focus();
    await user.keyboard('{Control>}a{/Control}conf{ArrowDown}{Enter}');

    expect(manageRequested).toHaveBeenCalled();
  });
});

/**
 * ⚠️ Le tre aggiunte del 18/08/2026 che portano la cella fuori dalle righe —
 * nella scheda articolo e nella scheda fornitore. Sono qui perché **tutte e
 * tre sono nate da un difetto visto a schermo**, non da un requisito: la voce
 * vuota che ripeteva il segnaposto, il campo che mostrava quell'etichetta come
 * se fosse un valore, e la cella senza bordo accanto a campi che il bordo ce
 * l'hanno.
 */
describe('la cella fuori da una riga', () => {
  it('la voce vuota sta in cima e dice cosa significa il vuoto', async () => {
    const user = userEvent.setup();
    await render(DocumentLineSelectCellComponent, {
      inputs: {
        inputId: 'vat',
        ariaLabel: 'Codice IVA',
        options: IVA,
        value: 'id-22',
        includeEmptyOption: true,
        emptyOptionLabel: 'Predefinito aziendale',
        inColumnCycle: false,
      },
    });

    await user.click(screen.getByRole('button', { name: /apri|elenco/i }));

    const voci = screen.getAllByRole('option').map((el) => el.textContent?.trim() ?? '');
    // In cima, e con parole sue: ripetere il segnaposto («22%») metteva
    // all'inizio una voce indistinguibile dall'aliquota vera due righe sotto.
    expect(voci[0]).toContain('Predefinito aziendale');
  });

  it('a valore vuoto il campo resta VUOTO, così si vede il segnaposto', async () => {
    await render(DocumentLineSelectCellComponent, {
      inputs: {
        inputId: 'vat',
        ariaLabel: 'Codice IVA',
        options: IVA,
        value: '',
        placeholder: '22%',
        includeEmptyOption: true,
        emptyOptionLabel: 'Predefinito aziendale',
        inColumnCycle: false,
      },
    });

    const campo = screen.getByLabelText<HTMLInputElement>('Codice IVA');
    // Scrivendoci l'etichetta della voce vuota, il campo mostrava un testo nero
    // che sembrava una scelta fatta — mentre nessuna scelta è stata fatta.
    expect(campo.value).toBe('');
    expect(campo.placeholder).toBe('22%');
  });

  it('con `boxed` la cella si veste da campo', async () => {
    await render(DocumentLineSelectCellComponent, {
      inputs: {
        inputId: 'vat',
        ariaLabel: 'Codice IVA',
        options: IVA,
        value: 'id-22',
        boxed: true,
        inColumnCycle: false,
      },
    });

    expect(document.querySelector('.doc-select-cell--boxed')).not.toBeNull();
  });

  it('senza lineIndex la cella funziona lo stesso: fuori da una riga non c e', async () => {
    const user = userEvent.setup();
    const valueChange = vi.fn();
    await render(DocumentLineSelectCellComponent, {
      inputs: {
        inputId: 'vat',
        ariaLabel: 'Codice IVA',
        options: IVA,
        value: '',
        inColumnCycle: false,
      },
      on: { valueChange },
    });

    const campo = screen.getByLabelText<HTMLInputElement>('Codice IVA');
    campo.focus();
    await user.keyboard('1{Enter}');

    // Digitando «1» la prima voce è quella che COMINCIA per 1, non una che lo
    // contiene da qualche parte: è il filtro per prefisso del codice.
    expect(valueChange).toHaveBeenCalledWith('id-10');
  });
});
