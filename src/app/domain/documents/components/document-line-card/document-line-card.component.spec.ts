import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FormGroup } from '@angular/forms';

import { DocumentLineCardBodyComponent } from './document-line-card-body.component';
import { DocumentLineCardStripComponent } from './document-line-card-strip.component';
import { DocumentLineCardComponent } from './document-line-card.component';
import type { DocumentLineCardMeta } from './document-line-card.model';

async function apri(
  inputs: Partial<{
    lineIndex: number;
    open: boolean;
    complete: boolean;
    readOnly: boolean;
    canRemove: boolean;
    title: string;
    variantLabel: string;
    meta: readonly DocumentLineCardMeta[];
    alert: string;
  }> = {},
) {
  const toggled = vi.fn();
  const removeRequested = vi.fn();
  const removed = vi.fn();
  await render(DocumentLineCardComponent, {
    inputs: { lineIndex: 2, title: 'Maglietta cotone', ...inputs },
    on: { toggled, removeRequested, removed },
  });
  return { toggled, removeRequested, removed };
}

describe('DocumentLineCardComponent', () => {
  it('una riga senza nome si legge lo stesso', async () => {
    await apri({ title: '   ' });

    expect(screen.getByText('Riga senza prodotto')).toBeVisible();
  });

  it('la riga si annuncia col suo numero, 1-based', async () => {
    await apri();

    expect(screen.getByRole('article')).toHaveAttribute('aria-label', 'Riga 3');
  });

  // L'avviso di riga informa, non blocca (regole-gestionale): è `status`, non
  // `alert` — non interrompe quello che si sta scrivendo.
  it('l’avviso di riga compare come stato, e solo se c’è', async () => {
    await apri({ alert: 'Disponibilità insufficiente' });

    expect(screen.getByRole('status')).toHaveTextContent('Disponibilità insufficiente');
  });

  it('senza avviso non resta un contenitore vuoto', async () => {
    await apri();

    expect(screen.queryByRole('status')).toBeNull();
  });

  // Il corpo esiste solo da aperta: le card chiuse di un documento da trenta
  // righe non devono rendere trenta griglie di campi.
  it('a card chiusa il corpo e le sue azioni non esistono', async () => {
    await apri({ open: false });

    expect(screen.queryByRole('button', { name: /^elimina$/i })).toBeNull();
  });

  it('a card aperta il corpo compare', async () => {
    await apri({ open: true });

    expect(screen.getByRole('button', { name: /^elimina$/i })).toBeVisible();
  });

  /**
   * ⛔ **Guardia**: «Duplica» è stata RIMOSSA dal piede della card
   * (23/08/2026). Il test fallisce se rientra.
   */
  it('«Duplica» non esiste più nel piede', async () => {
    await apri({ open: true });

    expect(screen.queryByRole('button', { name: /duplica/i })).toBeNull();
  });

  // Due modi di eliminare, ed è voluto: dalla testata passa dalla conferma
  // della maschera, dal piede del corpo aperto no — lì la riga è già sotto gli
  // occhi. Sono due esiti diversi perché il gesto è diverso.
  it('elimina dalla testata e elimina dal piede sono due esiti distinti', async () => {
    const user = userEvent.setup();
    const { removeRequested, removed } = await apri({ open: true });

    await user.click(screen.getByRole('button', { name: 'Elimina riga' }));
    expect(removeRequested).toHaveBeenCalled();
    expect(removed).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /^elimina$/i }));
    expect(removed).toHaveBeenCalled();
  });

  it('su documento bloccato non si elimina', async () => {
    await apri({ open: true, readOnly: true });

    expect(screen.getByRole('button', { name: 'Elimina riga' })).toBeDisabled();
  });

  it('la meta in coda si stacca dalle altre', async () => {
    await apri({
      meta: [
        { text: 'Cod. 00012' },
        { text: 'SKU ABC' },
        { text: 'Disp. 2', trailing: true, tone: 'warning' },
      ],
    });

    const coda = screen.getByText('Disp. 2');
    expect(coda).toHaveClass('doc-line-card__meta-item--trailing');
    expect(coda).toHaveClass('doc-line-card__meta-item--warning');
  });
});

/**
 * ⛔ **Il corpo della card non deve introdurre un box** — guardia del 24/08/2026.
 *
 * ## Che cosa protegge
 *
 * Il guscio dispone i campi con CSS Grid su due colonne
 * (`.doc-line-card__grid`, `1fr 1fr`). Gruppi e campi devono essere **grid item
 * di quella griglia**. Se l'host del componente che li proietta partecipa al
 * layout, diventa lui l'unico grid item: il corpo si impila in una colonna
 * sola, e i `grid-column: 1 / -1` dei figli diventano **inerti** — si
 * riferiscono a una griglia di cui i loro host non fanno più parte.
 *
 * ⚠️ **È successo.** Il corpo era proiettato con `<ng-container cardBody>`, che
 * non crea elemento; sostituirlo con `<app-document-line-card-body>` ha
 * introdotto quel box, e nessuno ha dichiarato `display: contents`. La resa
 * dell'Ordine cliente — il riferimento — è cambiata a schermo mentre 813 prove
 * restavano verdi: la geometria di CSS Grid non rompe né la build né le prove
 * di comportamento.
 *
 * ⚠️ **Una prova sulla STRUTTURA del DOM non lo vedrebbe.** `display: contents`
 * non toglie l'host dall'albero: lo toglie dal **layout**. Padre e figli restano
 * dove sono, e `querySelector` non nota alcuna differenza. L'unica cosa
 * osservabile è la proprietà calcolata — per questo la guardia guarda quella.
 */
describe('DocumentLineCardBodyComponent — non partecipa al layout', () => {
  it('⛔ il suo host calcola display:contents', async () => {
    const view = await render(DocumentLineCardBodyComponent, {
      inputs: {
        group: new FormGroup({}),
        lineIndex: 0,
        isColumnVisible: () => false,
      },
    });

    const host = view.fixture.nativeElement as HTMLElement;

    // Se un giorno tornasse `block` — o se lo `styleUrl` venisse sganciato —
    // il corpo tornerebbe a essere UN grid item e la card a una colonna.
    expect(globalThis.getComputedStyle(host).display).toBe('contents');
  });

  it('⭐ e lo stesso vale per la striscia, che proietta nell’altra griglia', async () => {
    const view = await render(DocumentLineCardStripComponent, {
      inputs: {
        group: new FormGroup({}),
        lineIndex: 0,
        isColumnVisible: () => false,
      },
    });

    const host = view.fixture.nativeElement as HTMLElement;

    // La striscia lo dichiarava già, col commento che spiega la ragione: qui
    // la si tiene ferma, perché è lo stesso contratto e non due soluzioni.
    expect(globalThis.getComputedStyle(host).display).toBe('contents');
  });
});
