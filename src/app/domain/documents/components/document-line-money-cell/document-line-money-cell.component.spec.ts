import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DocumentLineMoneyCellComponent } from './document-line-money-cell.component';

/**
 * L'adattatore aggiunge **solo** il giro del fuoco. Questi test coprono quello e
 * verificano che il denaro arrivi dalla primitiva senza essere riscritto: se un
 * giorno qualcuno ci mettesse un secondo parser, la prova sul canonico che
 * sopravvive lo direbbe.
 */
async function apri(
  inputs: Partial<{
    lineIndex: number;
    value: number;
    inputId: string;
    ariaLabel: string;
    readOnly: boolean;
    disabled: boolean;
    invalid: boolean;
    min: number | null;
    selectOnFocus: boolean;
    inColumnCycle: boolean;
  }> = {},
) {
  const spie = {
    valueChange: vi.fn(),
    focused: vi.fn(),
    blurred: vi.fn(),
    lineAdvance: vi.fn(),
    lineRetreat: vi.fn(),
    lineRowAdvance: vi.fn(),
    lineRowRetreat: vi.fn(),
  };
  const view = await render(DocumentLineMoneyCellComponent, {
    inputs: { lineIndex: 0, value: 0, ariaLabel: 'Costo', ...inputs },
    on: spie,
  });
  return { view, ...spie };
}

const campo = (): HTMLInputElement =>
  screen.getByRole<HTMLInputElement>('textbox', { name: 'Costo' });

describe('DocumentLineMoneyCellComponent', () => {
  describe('il denaro arriva dalla primitiva, non è riscritto qui', () => {
    it('mostra l’importo a due decimali', async () => {
      await apri({ value: 8600 });

      expect(campo().value).toBe('86,00');
    });

    it('zero è 0,00', async () => {
      await apri({ value: 0 });

      expect(campo().value).toBe('0,00');
    });

    /** ⭐ La prova che non esiste un secondo parser in questo adattatore. */
    it('il canonico con la coda sopravvive a un giro che non cambia niente', async () => {
      const { valueChange } = await apri({ value: 84.4262 });

      expect(campo().value).toBe('0,84');
      campo().focus();
      await userEvent.tab();

      expect(valueChange).not.toHaveBeenCalled();
    });

    /**
     * ⚠️ Il fuoco lo sposta il CONSUMER, non il Tab.
     *
     * L'adattatore trattiene il Tab (`preventDefault`) ed emette `lineAdvance`:
     * è lo store del giro del fuoco a dare il fuoco al campo dopo, e **quel**
     * gesto causa lo sfocamento qui. In un test isolato nessuno lo sposta,
     * quindi si sfoca a mano — è la stessa sequenza, senza il pezzo che nel
     * documento vero mette il consumer.
     */
    it('una modifica vera esce in unità minori quando il campo si sfoca', async () => {
      const { valueChange } = await apri({ value: 0 });
      const input = campo();

      input.focus();
      await userEvent.clear(input);
      await userEvent.type(input, '86');
      input.blur();

      expect(valueChange).toHaveBeenCalledWith(8600);
    });

    it('col Tab il valore digitato NON si perde: esce allo sfocamento che segue', async () => {
      const { valueChange, lineAdvance } = await apri({ value: 0, lineIndex: 5 });
      const input = campo();

      input.focus();
      await userEvent.clear(input);
      await userEvent.type(input, '12,50');
      await userEvent.tab();

      // Il Tab chiede di avanzare…
      expect(lineAdvance).toHaveBeenCalledWith(5);
      // …e quando il consumer sposta davvero il fuoco, il valore esce.
      input.blur();
      expect(valueChange).toHaveBeenCalledWith(1250);
    });

    it('resta un campo di testo con inputmode decimal', async () => {
      await apri({ value: 0 });

      expect(campo().getAttribute('type')).toBe('text');
      expect(campo().getAttribute('inputmode')).toBe('decimal');
    });

    it('porta l’id che riceve: il giro del fuoco lo raggiunge', async () => {
      await apri({ value: 0, inputId: 'gr-cost-3' });

      expect(campo().id).toBe('gr-cost-3');
    });

    it('in sola lettura non accetta battute', async () => {
      const { valueChange } = await apri({ value: 8600, readOnly: true });

      expect(campo().readOnly).toBe(true);
      await userEvent.type(campo(), '9');
      expect(valueChange).not.toHaveBeenCalled();
    });
  });

  describe('il giro del fuoco — l’unica cosa che l’adattatore aggiunge', () => {
    it('↓ esce come cambio riga, col proprio indice', async () => {
      const { lineRowAdvance } = await apri({ lineIndex: 4 });

      campo().focus();
      await userEvent.keyboard('{ArrowDown}');

      expect(lineRowAdvance).toHaveBeenCalledWith(4);
    });

    it('↑ esce come risalita, col proprio indice', async () => {
      const { lineRowRetreat } = await apri({ lineIndex: 4 });

      campo().focus();
      await userEvent.keyboard('{ArrowUp}');

      expect(lineRowRetreat).toHaveBeenCalledWith(4);
    });

    it('Tab avanza al campo dopo', async () => {
      const { lineAdvance } = await apri({ lineIndex: 2 });

      campo().focus();
      await userEvent.tab();

      expect(lineAdvance).toHaveBeenCalledWith(2);
    });

    it('Shift+Tab torna al campo prima', async () => {
      const { lineRetreat } = await apri({ lineIndex: 2 });

      campo().focus();
      await userEvent.tab({ shift: true });

      expect(lineRetreat).toHaveBeenCalledWith(2);
    });

    /** §4.5: Invio registra e RESTA. Non naviga e non salva. */
    it('Invio non avanza', async () => {
      const { lineAdvance } = await apri({ lineIndex: 1 });

      campo().focus();
      await userEvent.keyboard('{Enter}');

      expect(lineAdvance).not.toHaveBeenCalled();
    });

    /**
     * ⚠️ Le frecce ←/→ escono al primo colpo: in un campo numerico il cursore
     * non si legge, e percorrere le cifre con la freccia non porta da nessuna
     * parte.
     */
    it('→ al bordo avanza al primo colpo', async () => {
      const { lineAdvance } = await apri({ lineIndex: 3, value: 8600 });

      campo().focus();
      await userEvent.keyboard('{ArrowRight}');

      expect(lineAdvance).toHaveBeenCalledWith(3);
    });

    it('← al bordo torna indietro al primo colpo', async () => {
      const { lineRetreat } = await apri({ lineIndex: 3, value: 8600 });

      campo().focus();
      await userEvent.keyboard('{ArrowLeft}');

      expect(lineRetreat).toHaveBeenCalledWith(3);
    });

    /** Su card le colonne non esistono: il Tab resta al browser. */
    it('fuori dal giro delle colonne non intercetta nulla', async () => {
      const { lineAdvance, lineRowAdvance } = await apri({
        lineIndex: 0,
        inColumnCycle: false,
      });

      campo().focus();
      await userEvent.tab();
      await userEvent.keyboard('{ArrowDown}');

      expect(lineAdvance).not.toHaveBeenCalled();
      expect(lineRowAdvance).not.toHaveBeenCalled();
    });
  });
});
