import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

export interface A11yViolation {
  readonly id: string;
  readonly impact?: string;
  readonly description: string;
}

export function formatA11yViolations(violations: readonly A11yViolation[]): string {
  if (violations.length === 0) {
    return '';
  }

  return violations.map((v) => `[${v.impact}] ${v.id}: ${v.description}`).join('\n');
}

export async function assertNoSeriousA11yViolations(
  page: Page,
  options: { include?: string } = {},
): Promise<void> {
  let builder = new AxeBuilder({ page });
  if (options.include) {
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
