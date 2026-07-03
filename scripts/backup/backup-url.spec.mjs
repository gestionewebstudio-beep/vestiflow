import { describe, expect, it } from 'vitest';

import {
  assertBackupDatabaseUrl,
  resolveBackupDatabaseUrl,
  sanitizeBackupDatabaseUrl,
} from './backup-url.mjs';

describe('backup-url.mjs', () => {
  it('preferisce BACKUP_DATABASE_URL rispetto a DIRECT_URL', () => {
    expect(
      resolveBackupDatabaseUrl({
        BACKUP_DATABASE_URL: 'postgres://pooler/db',
        DIRECT_URL: 'postgres://direct/db',
      }),
    ).toBe('postgres://pooler/db');
  });

  it('usa DIRECT_URL come fallback', () => {
    expect(resolveBackupDatabaseUrl({ DIRECT_URL: 'postgres://direct/db' })).toBe(
      'postgres://direct/db',
    );
  });

  it('assertBackupDatabaseUrl rifiuta URL vuoto', () => {
    expect(() => assertBackupDatabaseUrl('')).toThrow(/URL database mancante/);
  });

  it('assertBackupDatabaseUrl rifiuta host Supabase diretto db.*.supabase.co', () => {
    expect(() =>
      assertBackupDatabaseUrl('postgres://user:pass@db.abcdef.supabase.co:5432/postgres'),
    ).toThrow(/host diretto db\.\*\.supabase\.co/);
  });

  it('accetta pooler Supabase', () => {
    expect(() =>
      assertBackupDatabaseUrl(
        'postgres://user:pass@aws-0-eu-west-1.pooler.supabase.com:5432/postgres',
      ),
    ).not.toThrow();
  });

  it('sanitizeBackupDatabaseUrl rimuove pgbouncer e passa a session pooler 5432', () => {
    expect(
      sanitizeBackupDatabaseUrl(
        'postgresql://postgres.x:pass@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=5',
      ),
    ).toBe('postgresql://postgres.x:pass@aws-0-eu-west-1.pooler.supabase.com:5432/postgres');
  });

  it('resolveBackupDatabaseUrl sanitizza DIRECT_URL con parametri Prisma', () => {
    expect(
      resolveBackupDatabaseUrl({
        DIRECT_URL:
          'postgresql://postgres.x:pass@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true',
      }),
    ).toBe('postgresql://postgres.x:pass@aws-0-eu-west-1.pooler.supabase.com:5432/postgres');
  });
});
