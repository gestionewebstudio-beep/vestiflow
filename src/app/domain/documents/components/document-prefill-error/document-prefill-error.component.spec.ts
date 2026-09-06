import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { DocumentPrefillErrorStore } from '../../state/document-prefill-error.store';

import { DocumentPrefillErrorComponent } from './document-prefill-error.component';

/**
 * ⭐ **Il contratto dell'avviso di precompilazione fallita.**
 *
 * Otto righe byte-identiche in sei maschere. Queste prove inchiodano il testo di
 * congedo e — soprattutto — che l'avviso **non c'è** quando non serve: un banner
 * d'errore sempre presente sarebbe peggio di nessun banner.
 */
describe('DocumentPrefillErrorComponent', () => {
  async function monta(store: DocumentPrefillErrorStore) {
    return render(DocumentPrefillErrorComponent, { inputs: { store } });
  }

  it('⛔ senza errore non c’è niente a schermo', async () => {
    // ⚠️ E' la meta' che si dimentica: il componente si monta sempre, in cima a
    // ogni maschera, e per quasi tutta la sua vita non deve rendere nulla.
    const { container } = await monta(new DocumentPrefillErrorStore());

    expect(container.textContent?.trim()).toBe('');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('⭐ col precompilato fallito compare l’avviso', async () => {
    const store = new DocumentPrefillErrorStore();
    store.fail('duplicate');

    await monta(store);

    // Il testo lo decide lo store: qui si prova che ARRIVA, non quale sia.
    expect(screen.getByRole('alert').textContent).toContain(store.message());
  });

  it('⭐ e si congeda con «Ho capito», che è la stessa parola in tutte le maschere', async () => {
    const store = new DocumentPrefillErrorStore();
    store.fail('duplicate');
    const { fixture } = await monta(store);

    await userEvent.click(screen.getByRole('button', { name: 'Ho capito' }));
    fixture.detectChanges();

    expect(store.message()).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
