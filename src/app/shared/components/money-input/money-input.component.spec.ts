import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MoneyInputComponent } from './money-input.component';

/**
 * Il campo di denaro comune. I test coprono le due cose per cui esiste:
 *
 * - **si legge come un importo** — due decimali sempre, zero compreso;
 * - **non distrugge il canonico** — la coda di uno scorporo sopravvive a un
 *   giro di focus/blur che non cambia niente.
 */
async function apri(
  inputs: Partial<{
    value: number;
    inputId: string;
    ariaLabel: string;
    placeholder: string;
    readOnly: boolean;
    disabled: boolean;
    invalid: boolean;
    min: number | null;
    selectOnFocus: boolean;
    inputClass: string;
  }> = {},
) {
  const valueChange = vi.fn();
  const focused = vi.fn();
  const blurred = vi.fn();
  const view = await render(MoneyInputComponent, {
    inputs: { value: 0, ariaLabel: 'Prezzo', ...inputs },
    on: { valueChange, focused, blurred },
  });
  return { view, valueChange, focused, blurred };
}

const campo = (): HTMLInputElement =>
  screen.getByRole<HTMLInputElement>('textbox', { name: 'Prezzo' });

/** Scrive un testo nuovo al posto di quello che c'è, poi esce dal campo. */
async function riscrivi(testo: string): Promise<void> {
  const input = campo();
  input.focus();
  await userEvent.clear(input);
  await userEvent.type(input, testo);
  await userEvent.tab();
}

describe('MoneyInputComponent', () => {
  describe('come si legge un importo', () => {
    it('zero è 0,00: uno zero è un valore, non un campo vuoto', async () => {
      await apri({ value: 0 });

      expect(campo().value).toBe('0,00');
    });

    it('86 € si legge 86,00', async () => {
      await apri({ value: 8600 });

      expect(campo().value).toBe('86,00');
    });

    it('86,50 € si legge 86,50', async () => {
      await apri({ value: 8650 });

      expect(campo().value).toBe('86,50');
    });

    /**
     * ⛔ Niente separatore delle migliaia DENTRO il campo: `1.234,56` in un
     * input si rilegge male mentre lo si modifica. Nelle celle di sola lettura
     * e nelle stampe il raggruppamento resta — lo mette `formatMoney`.
     */
    it('nel campo le migliaia NON portano il separatore', async () => {
      await apri({ value: 123456 });

      expect(campo().value).toBe('1234,56');
    });

    /** ⭐ A schermo due decimali, sempre — anche quando sotto c'è la coda. */
    it('un canonico con la coda si mostra arrotondato al centesimo', async () => {
      await apri({ value: 84.4262 });

      expect(campo().value).toBe('0,84');
    });

    it('il negativo si mostra come tale', async () => {
      await apri({ value: -2500 });

      expect(campo().value).toBe('-25,00');
    });
  });

  describe('quello che si digita', () => {
    it('86 digitato diventa 86,00 allo sfocamento', async () => {
      const { valueChange } = await apri({ value: 0 });

      await riscrivi('86');

      expect(valueChange).toHaveBeenCalledWith(8600);
    });

    it('la virgola è il separatore decimale italiano', async () => {
      const { valueChange } = await apri({ value: 0 });

      await riscrivi('86,5');

      expect(valueChange).toHaveBeenCalledWith(8650);
    });

    it('anche il punto è accettato: si digita come viene', async () => {
      const { valueChange } = await apri({ value: 0 });

      await riscrivi('86.5');

      expect(valueChange).toHaveBeenCalledWith(8650);
    });

    it('durante la digitazione il campo non riformatta sotto le dita', async () => {
      await apri({ value: 0 });
      const input = campo();

      input.focus();
      await userEvent.clear(input);
      await userEvent.type(input, '86,');

      expect(input.value).toBe('86,');
    });

    it('un testo che non è un numero lascia il valore com’era', async () => {
      const { valueChange } = await apri({ value: 8600 });

      await riscrivi('abc');

      expect(valueChange).not.toHaveBeenCalled();
      expect(campo().value).toBe('86,00');
    });

    /**
     * Svuotare un campo di denaro non significa «azzera»: significa «non ho
     * scritto niente». Azzerare è digitare zero.
     */
    it('svuotare il campo non azzera il valore', async () => {
      const { valueChange } = await apri({ value: 8600 });
      const input = campo();

      input.focus();
      await userEvent.clear(input);
      await userEvent.tab();

      expect(valueChange).not.toHaveBeenCalled();
      expect(campo().value).toBe('86,00');
    });

    it('digitare zero invece azzera davvero', async () => {
      const { valueChange } = await apri({ value: 8600 });

      await riscrivi('0');

      expect(valueChange).toHaveBeenCalledWith(0);
    });
  });

  /**
   * ⭐ **La regola per cui questo componente esiste.**
   *
   * 1,03 € ivati al 22% valgono 84,4262 centesimi netti, e a schermo sono
   * `0,84`. Se uscire dal campo riscrivesse il canonico col valore mostrato, la
   * coda morirebbe al primo Tab — e 1,03 non tornerebbe più 1,03.
   */
  describe('il canonico sopravvive al giro di editing', () => {
    it('entrare e uscire senza scrivere non emette nulla', async () => {
      const { valueChange } = await apri({ value: 84.4262 });

      campo().focus();
      await userEvent.tab();

      expect(valueChange).not.toHaveBeenCalled();
    });

    it('riscrivere lo STESSO importo mostrato non riscrive il canonico', async () => {
      const { valueChange } = await apri({ value: 84.4262 });

      // L'operatore ridigita quello che già vede: per lui non è una modifica.
      await riscrivi('0,84');

      expect(valueChange).not.toHaveBeenCalled();
    });

    it('una modifica vera invece emette il nuovo valore', async () => {
      const { valueChange } = await apri({ value: 84.4262 });

      await riscrivi('0,85');

      expect(valueChange).toHaveBeenCalledWith(85);
    });

    it('dopo uno sfocamento senza modifiche il campo rimostra il canonico', async () => {
      await apri({ value: 2049.1803 });

      await riscrivi('20,49');

      expect(campo().value).toBe('20,49');
    });
  });

  describe('lo stato del campo', () => {
    it('in sola lettura non accetta battute', async () => {
      const { valueChange } = await apri({ value: 8600, readOnly: true });

      expect(campo().readOnly).toBe(true);
      await userEvent.type(campo(), '9');
      expect(valueChange).not.toHaveBeenCalled();
    });

    it('disabilitato non si raggiunge', async () => {
      await apri({ value: 8600, disabled: true });

      expect(campo().disabled).toBe(true);
    });

    it('non valido per decisione del chiamante lo dichiara a chi ascolta', async () => {
      await apri({ value: 8600, invalid: true });

      expect(campo().getAttribute('aria-invalid')).toBe('true');
    });

    it('valido non porta l’attributo: assente, non "false"', async () => {
      await apri({ value: 8600 });

      expect(campo().getAttribute('aria-invalid')).toBeNull();
    });
  });

  /**
   * ⛔ La soglia SEGNALA, non taglia. Sostituisce il `min` nativo che si perde
   * passando a `type="text"` e ne conserva il solo effetto onesto: dire che il
   * valore è fuori soglia. Cambiare in silenzio ciò che l'operatore ha scritto
   * sarebbe una regola economica, e quelle stanno nel consumer.
   */
  describe('la soglia minima', () => {
    it('sotto soglia il campo si dichiara non valido', async () => {
      await apri({ value: -100, min: 0 });

      expect(campo().getAttribute('aria-invalid')).toBe('true');
    });

    it('in soglia resta valido', async () => {
      await apri({ value: 0, min: 0 });

      expect(campo().getAttribute('aria-invalid')).toBeNull();
    });

    it('NON fa clamp: un valore fuori soglia esce com’è stato digitato', async () => {
      const { valueChange } = await apri({ value: 100, min: 0 });

      await riscrivi('-5');

      expect(valueChange).toHaveBeenCalledWith(-500);
    });
  });

  describe('fuoco e tastiera', () => {
    it('con select-on-focus il contenuto è pronto da sovrascrivere', async () => {
      await apri({ value: 8600, selectOnFocus: true });
      const input = campo();

      input.focus();

      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe(input.value.length);
    });

    it('senza select-on-focus non seleziona nulla', async () => {
      await apri({ value: 8600 });
      const input = campo();

      input.focus();

      expect(input.selectionStart).toBe(input.selectionEnd);
    });

    it('fuoco e sfocamento escono verso il chiamante', async () => {
      const { focused, blurred } = await apri({ value: 0 });

      campo().focus();
      expect(focused).toHaveBeenCalledTimes(1);

      campo().blur();
      expect(blurred).toHaveBeenCalledTimes(1);
    });
  });

  describe('il contratto dei campi monetari', () => {
    /**
     * ⭐ `inputmode="decimal"` è la discriminante con cui la regola globale del
     * 17/08/2026 toglie le frecce ai campi di denaro e la guardia spegne la
     * rotella. Dichiararlo qui significa ereditare quella protezione.
     */
    it('dichiara inputmode decimal, e resta un campo di testo', async () => {
      await apri({ value: 0 });

      expect(campo().getAttribute('inputmode')).toBe('decimal');
      expect(campo().getAttribute('type')).toBe('text');
    });

    it('porta l’id che riceve', async () => {
      await apri({ value: 0, inputId: 'gr-cost-2' });

      expect(campo().id).toBe('gr-cost-2');
    });

    /**
     * ⛔ `[attr.id]`, non `[id]`: con il secondo un valore assente finisce
     * nell'attributo come **stringa** `'null'`, e due campi senza id
     * avrebbero lo stesso identificativo. È lo stesso difetto che la rete di
     * test ha trovato in `document-line-product-cell`.
     */
    it('senza id l’attributo è ASSENTE, non la stringa «null»', async () => {
      await apri({ value: 0 });

      expect(campo().getAttribute('id')).toBeNull();
    });

    it('la veste la decide chi lo ospita', async () => {
      await apri({ value: 0, inputClass: 'doc-form__input--num' });

      expect(campo().className).toContain('doc-form__input--num');
    });
  });
});
