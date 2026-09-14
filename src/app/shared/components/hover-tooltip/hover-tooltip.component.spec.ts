import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { HoverTooltipComponent } from './hover-tooltip.component';

const TESTO = 'Che cosa si aggiorna da sé, in quale direzione, e che cosa lo ferma.';

/** Il contenitore che porta le classi di stato (`.hover-tooltip`). */
function contenitore(): HTMLElement {
  return document.querySelector<HTMLElement>('.hover-tooltip')!;
}

/**
 * ⭐ Il trigger INTEGRATO «?» (proprietario, 14/09/2026): un pulsante, con la bolla
 *    come descrizione accessibile — mouse, Tab e tocco lo raggiungono. Le icone
 *    proiettate con `tabindex="-1" aria-hidden` non le raggiungeva nessuno dei due.
 */
describe('HoverTooltipComponent — il pulsante «?» integrato', () => {
  it('è un pulsante col nome dato, descritto dalla bolla (aria-describedby → role tooltip)', async () => {
    await render(HoverTooltipComponent, {
      inputs: { text: TESTO, icona: true, etichetta: 'Che cosa sono gli aggiornamenti' },
    });
    const pulsante = screen.getByRole('button', { name: 'Che cosa sono gli aggiornamenti' });
    expect(pulsante).toHaveAccessibleDescription(TESTO);
    const bolla = document.getElementById(pulsante.getAttribute('aria-describedby')!)!;
    expect(bolla).toHaveAttribute('role', 'tooltip');
    expect(bolla).toHaveTextContent(TESTO);
  });

  it('senza «icona» non aggiunge nessun pulsante: chi proietta il trigger resta com’era', async () => {
    await render(HoverTooltipComponent, { inputs: { text: TESTO } });
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('tooltip', { hidden: true })).toHaveTextContent(TESTO);
  });

  it('Esc chiude la bolla finché il fuoco resta; uscendo col Tab si riarma', async () => {
    const utente = userEvent.setup();
    await render(HoverTooltipComponent, {
      inputs: { text: TESTO, icona: true, etichetta: 'Spiegazione' },
    });
    await utente.tab();
    expect(screen.getByRole('button', { name: 'Spiegazione' })).toHaveFocus();
    expect(contenitore()).not.toHaveClass('hover-tooltip--chiusa');
    await utente.keyboard('{Escape}');
    expect(contenitore()).toHaveClass('hover-tooltip--chiusa');
    await utente.tab();
    expect(contenitore()).not.toHaveClass('hover-tooltip--chiusa');
  });

  it('un secondo tocco sul pulsante che ha già il fuoco chiude; il terzo riapre', async () => {
    const utente = userEvent.setup();
    await render(HoverTooltipComponent, {
      inputs: { text: TESTO, icona: true, etichetta: 'Spiegazione' },
    });
    const pulsante = screen.getByRole('button', { name: 'Spiegazione' });
    // Il primo tocco porta il fuoco: la bolla si apre (focus-within), niente da chiudere.
    await utente.click(pulsante);
    expect(pulsante).toHaveFocus();
    expect(contenitore()).not.toHaveClass('hover-tooltip--chiusa');
    await utente.click(pulsante);
    expect(contenitore()).toHaveClass('hover-tooltip--chiusa');
    await utente.click(pulsante);
    expect(contenitore()).not.toHaveClass('hover-tooltip--chiusa');
  });
});

/**
 * ⛔ Contenimento: a 390px una bolla da 352 ancorata a un trigger a metà schermo usciva
 *    di 180px (misurato il 14/09/2026). Né a destra né a sinistra: si ancora al margine
 *    della finestra e si stringe allo spazio che c'è.
 */
describe('HoverTooltipComponent — dove si apre la bolla', () => {
  async function conTriggerA(left: number, width: number, innerWidth: number) {
    const utente = userEvent.setup();
    await render(HoverTooltipComponent, {
      inputs: { text: TESTO, icona: true, etichetta: 'Spiegazione' },
    });
    // L'host del componente è il genitore del contenitore (nel test è la radice della fixture).
    const host = contenitore().parentElement!;
    host.getBoundingClientRect = () =>
      ({ left, right: left + width, width, top: 300, bottom: 320, height: 20 }) as DOMRect;
    Object.defineProperty(window, 'innerWidth', { value: innerWidth, configurable: true });
    await utente.tab();
    return contenitore();
  }

  it('sulla scrivania, trigger a sinistra: si apre a destra, senza scostamenti', async () => {
    const c = await conTriggerA(100, 16, 1280);
    expect(c).not.toHaveClass('hover-tooltip--end');
    expect(c).not.toHaveClass('hover-tooltip--scostata');
  });

  it('trigger vicino al bordo destro: si ribalta verso sinistra', async () => {
    const c = await conTriggerA(1200, 16, 1280);
    expect(c).toHaveClass('hover-tooltip--end');
    expect(c).not.toHaveClass('hover-tooltip--scostata');
  });

  it('sul telefono, trigger a metà: si ancora al margine della finestra e si stringe', async () => {
    const c = await conTriggerA(180, 16, 390);
    expect(c).not.toHaveClass('hover-tooltip--end');
    expect(c).toHaveClass('hover-tooltip--scostata');
    // Il margine dal bordo (8px) meno la posizione del trigger; la larghezza è lo spazio.
    expect(c.style.getPropertyValue('--hover-tooltip-scostamento')).toBe('-172px');
    expect(c.style.getPropertyValue('--hover-tooltip-larghezza')).toBe('374px');
  });
});
