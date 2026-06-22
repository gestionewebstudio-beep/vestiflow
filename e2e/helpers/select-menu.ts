import type { Page } from '@playwright/test';

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
