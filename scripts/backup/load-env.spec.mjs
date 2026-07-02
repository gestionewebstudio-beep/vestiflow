import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => ''),
  };
});

import { existsSync, readFileSync } from 'node:fs';

import { loadApiEnv, repoRoot } from './load-env.mjs';

describe('load-env.mjs', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readFileSync).mockReturnValue('');
  });

  it('espone repoRoot del monorepo', () => {
    expect(repoRoot).toMatch(/vestiflow$/i);
  });

  it('loadApiEnv preserva variabili già presenti in process.env', () => {
    vi.stubEnv('VF_BACKUP_TEST_VAR', 'from-process');

    const env = loadApiEnv();

    expect(env.VF_BACKUP_TEST_VAR).toBe('from-process');
  });

  it('loadApiEnv legge chiavi mancanti da api/.env', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      'VF_BACKUP_FROM_FILE=loaded\n# comment\nMALFORMED_LINE\nQUOTED="value"\n',
    );
    vi.stubEnv('VF_BACKUP_FROM_FILE', '');

    const env = loadApiEnv();

    expect(env.VF_BACKUP_FROM_FILE).toBe('loaded');
    expect(env.QUOTED).toBe('value');
  });
});
