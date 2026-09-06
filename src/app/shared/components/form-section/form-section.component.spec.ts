import { render, screen } from '@testing-library/angular';
import { describe, expect, it } from 'vitest';

import { FormSectionComponent } from './form-section.component';

describe('FormSectionComponent', () => {
  it('il titolo è il nome del gruppo: uno screen reader lo annuncia sul fieldset', async () => {
    await render(FormSectionComponent, { inputs: { title: 'Dati generali' } });

    expect(screen.getByRole('group', { name: 'Dati generali' })).toBeVisible();
  });

  it('proietta il contenuto dentro il pannello', async () => {
    await render(
      '<app-form-section title="Contatti"><input aria-label="Email" /></app-form-section>',
      {
        imports: [FormSectionComponent],
      },
    );

    expect(screen.getByLabelText('Email')).toBeVisible();
  });

  it('⛔ non porta disabled: raggruppa i campi, non li blocca', async () => {
    const { container } = await render(
      '<app-form-section title="Indirizzo"><input aria-label="Città" /></app-form-section>',
      { imports: [FormSectionComponent] },
    );

    expect(container.querySelector('fieldset')?.hasAttribute('disabled')).toBe(false);
    expect(screen.getByLabelText('Città')).toBeEnabled();
  });
});
