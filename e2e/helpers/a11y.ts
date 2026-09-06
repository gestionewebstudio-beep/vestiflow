import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/**
 * La forma della violazione che ci serve per il messaggio d'errore — un
 * sottoinsieme di ciò che axe restituisce.
 *
 * `impact` ammette anche `null`: axe lo dichiara così, e significa «violazione
 * senza impatto assegnato». Prima qui era `string | undefined`, e il tipo
 * mentiva su ciò che il dato può essere davvero — la conseguenza era un errore
 * di compilazione a ogni chiamata, non un difetto a schermo. Allargato invece
 * di convertire al confine: questo tipo esiste per descrivere l'uscita di axe,
 * quindi la descrive.
 */
export interface A11yViolation {
  readonly id: string;
  readonly impact?: string | null;
  readonly description: string;
}

export function formatA11yViolations(violations: readonly A11yViolation[]): string {
  if (violations.length === 0) {
    return '';
  }

  return violations
    .map((v) => `[${v.impact ?? 'senza impatto'}] ${v.id}: ${v.description}`)
    .join('\n');
}

export async function assertNoSeriousA11yViolations(
  page: Page,
  options: { include?: string } = {},
): Promise<void> {
  let builder = new AxeBuilder({ page });
  if (options.include) {
    // ⛔ **axe valida l'`include` PRIMA di analizzare**, e `page.goto()`
    //    ritorna al `load`: il bootstrap di Angular avviene dopo. Se
    //    l'elemento non c'e' ancora, il messaggio non parla di attesa —
    //    dice «No elements found for include in page Context», che si legge
    //    come un selettore sbagliato.
    //
    // ⚠️ Misurato il 03/09/2026: in CI questa prova falliva cosi', mentre in
    //    locale passava in 689 ms. Il selettore era corretto: mancava
    //    l'attesa. L'assunto verificato non cambia — cambia solo QUANDO.
    await page.locator(options.include).first().waitFor({ state: 'visible' });
    builder = builder.include(options.include);
  }

  const results = await builder.analyze();
  const blocking = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );

  expect(
    blocking.map((v) => v.id),
    formatA11yViolations(blocking),
  ).toEqual([]);
}
