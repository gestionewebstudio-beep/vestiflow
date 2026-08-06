import { describe, expect, it } from 'vitest';

import { resolvePgTool } from './pg-tools.mjs';

describe('pg-tools.mjs', () => {
  it('mette il comando PATH come ultimo fallback', () => {
    const candidates = resolvePgTool('pg_dump');
    expect(candidates.at(-1)).toBe('pg_dump');
  });

  it('su Linux preferisce binari versionati quando presenti', () => {
    if (process.platform !== 'linux') {
      return;
    }

    const candidates = resolvePgTool('pg_dump');
    if (candidates.length <= 1) {
      return;
    }

    expect(candidates[0]).toMatch(/^\/usr\/lib\/postgresql\/\d+\/bin\/pg_dump$/);
  });
});
