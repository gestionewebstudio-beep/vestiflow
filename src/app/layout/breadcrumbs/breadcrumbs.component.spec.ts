import { Router, provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import { describe, expect, it } from 'vitest';

import { BreadcrumbsComponent } from './breadcrumbs.component';

/**
 * Il percorso di Impostazioni → Shopify, con le sue cinque schede nella rotta
 * (13/09/2026). ⛔ Qui il segmento della scheda usciva grezzo — «Impostazioni ›
 * Ordini Shopify › sincronizzazione» — perché «shopify» prendeva l'etichetta di
 * Vendite e la scheda non ne aveva nessuna. Visto a schermo dal proprietario.
 */
async function apri(url: string) {
  const { fixture } = await render(BreadcrumbsComponent, {
    providers: [provideRouter([{ path: '**', children: [] }])],
  });
  await fixture.debugElement.injector.get(Router).navigateByUrl(url);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

function voci(): string[] {
  return screen
    .getAllByRole('listitem')
    .map((li) => li.textContent?.replace(/\s+/g, ' ').trim() ?? '');
}

describe('BreadcrumbsComponent — Impostazioni → Shopify', () => {
  it('senza scheda: «Impostazioni › Shopify», mai «Ordini Shopify»', async () => {
    await apri('/app/settings/shopify');

    expect(voci()).toEqual(['Impostazioni', 'Shopify']);
    expect(screen.getByRole('link', { name: 'Impostazioni' })).toHaveAttribute(
      'href',
      '/app/settings',
    );
  });

  it('con la scheda: la scheda porta il proprio nome, e «Shopify» diventa una tappa', async () => {
    await apri('/app/settings/shopify/sincronizzazione');

    expect(voci()).toEqual(['Impostazioni', 'Shopify', 'Sincronizzazione automatica']);
    expect(screen.getByRole('link', { name: 'Shopify' })).toHaveAttribute(
      'href',
      '/app/settings/shopify',
    );
    expect(screen.queryByText('sincronizzazione')).toBeNull();
  });

  it.each([
    ['prima-connessione', 'Prima connessione'],
    ['operazioni', 'Operazioni manuali'],
    ['problemi', 'Problemi ed esiti'],
    ['connessione', 'Connessione e sedi'],
  ])('la scheda «%s» si chiama «%s»', async (segmento, nome) => {
    await apri(`/app/settings/shopify/${segmento}`);

    expect(voci().at(-1)).toBe(nome);
  });

  it('sotto Vendite «shopify» resta «Ordini Shopify»', async () => {
    await apri('/app/sales/shopify');

    expect(voci()).toEqual(['Vendite', 'Ordini Shopify']);
  });
});
