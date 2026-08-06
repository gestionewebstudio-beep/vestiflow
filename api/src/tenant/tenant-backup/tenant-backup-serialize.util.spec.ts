import { describe, expect, it } from 'vitest';

import { parseBackupRows, serializeBackupRows } from './tenant-backup-serialize.util';

describe('tenant-backup-serialize.util', () => {
  it('serializza e ripristina righe con Date', () => {
    const rows = [{ id: '1', createdAt: new Date('2026-01-01T00:00:00.000Z') }];
    const parsed = parseBackupRows<{ id: string; createdAt: string }>(serializeBackupRows(rows));
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.id).toBe('1');
    expect(parsed[0]?.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('rifiuta JSON non array', () => {
    expect(() => parseBackupRows('{"id":"x"}')).toThrow(/array JSON/);
  });
});
