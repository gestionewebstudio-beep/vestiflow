import { expect, type Page } from '@playwright/test';

/** Conferma il dialog `<dialog>` aperto con l'etichetta indicata. */
export async function confirmOpenDialog(page: Page, confirmLabel: string): Promise<void> {
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await dialog.getByRole('button', { name: confirmLabel, exact: true }).click();
}
