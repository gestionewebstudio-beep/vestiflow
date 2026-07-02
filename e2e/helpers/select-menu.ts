import { expect, type Page } from '@playwright/test';

export async function pickSelectMenuOption(
  page: Page,
  ariaLabel: string,
  option?: { index?: number; name?: string | RegExp },
): Promise<void> {
  await page.getByRole('button', { name: ariaLabel, exact: true }).click();
  const listbox = page.getByRole('listbox', { name: ariaLabel });

  if (option?.name) {
    await listbox.getByRole('option', { name: option.name }).click();
    return;
  }

  // index 0 è spesso il placeholder vuoto ("Seleziona…", "Tutti", ecc.).
  const optionIndex = option?.index ?? 1;
  await listbox.getByRole('option').nth(optionIndex).click();
}

/** Cerca e seleziona una variante (autocomplete server-side, min. 2 caratteri). */
export async function pickVariantWithSearch(page: Page, searchTerm: string): Promise<void> {
  const term = searchTerm.trim();
  if (term.length < 2) {
    throw new Error('pickVariantWithSearch richiede almeno 2 caratteri.');
  }

  const variantTrigger = page.getByRole('button', { name: 'Variante', exact: true }).first();
  await variantTrigger.click();
  const search = page.getByRole('searchbox', { name: /Cerca variante/i });

  const summariesResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/products/variants/summaries') && response.status() === 200,
    { timeout: 20_000 },
  );
  await search.fill(term);
  await summariesResponse;

  const listbox = page.getByRole('listbox', { name: 'Variante' });
  let option = listbox
    .getByRole('option')
    .filter({ hasNotText: /^Seleziona/i })
    .filter({ hasText: new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') })
    .first();
  if ((await option.count()) === 0) {
    option = listbox
      .getByRole('option')
      .filter({ hasNotText: /^Seleziona/i })
      .first();
  }
  await expect(option).toBeVisible({ timeout: 20_000 });
  await option.click();

  await expect(variantTrigger).not.toHaveText(/Cerca SKU|Seleziona/i, { timeout: 15_000 });
}

export function defaultVariantSearchTerm(): string {
  const fromEnv = process.env.E2E_TEST_SKU?.trim();
  if (fromEnv && fromEnv.length >= 2) {
    return fromEnv.slice(0, Math.min(fromEnv.length, 6));
  }
  return 'TSB-L';
}

/** Preferisce il fornitore seed (Confezioni Sud SRL) se presente. */
export async function pickSeedSupplier(page: Page): Promise<boolean> {
  await page.getByRole('button', { name: 'Fornitore', exact: true }).click();
  const listbox = page.getByRole('listbox', { name: 'Fornitore' });
  const seeded = listbox.getByRole('option', { name: /Confezioni Sud/i });
  if ((await seeded.count()) > 0) {
    await seeded.first().click();
    return true;
  }
  await page.keyboard.press('Escape');
  return false;
}

/** Primo fornitore reale (esclude placeholder). */
export async function pickAnySupplier(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Fornitore', exact: true }).click();
  const listbox = page.getByRole('listbox', { name: 'Fornitore' });
  const option = listbox
    .getByRole('option')
    .filter({ hasNotText: /Seleziona/i })
    .first();
  await expect(option).toBeVisible({ timeout: 15_000 });
  await option.click();
}
