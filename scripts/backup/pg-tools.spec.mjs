import { describe, expect, it } from 'vitest';

import { perDocker, resolvePgTool } from './pg-tools.mjs';

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

  /*
    ⛔ **IL RIPIEGO DOCKER esiste perche` su questa macchina pg_dump NON c`e`.**
    Ne` nel PATH, ne` fra le installazioni versionate: il backup non partiva
    affatto. La causa radice non era il PATH — era pretendere
    un'installazione di PostgreSQL su una macchina che non ne ha bisogno per
    nient`altro, mentre Docker c`e` gia` e ci gira gia` `postgres:17`
    per il database di prova.
  */
  it('riscrive l_host locale: dentro un container localhost e` il container', () => {
    expect(perDocker('postgresql://u:p@localhost:5433/db')).toBe(
      'postgresql://u:p@host.docker.internal:5433/db',
    );
    expect(perDocker('postgresql://u:p@127.0.0.1:5433/db')).toBe(
      'postgresql://u:p@host.docker.internal:5433/db',
    );
  });

  it('⛔ NON tocca un host remoto: il backup punta a Supabase, non a localhost', () => {
    const remoto = 'postgresql://u:p@aws-0-eu-west-1.pooler.example.com:5432/postgres';
    expect(perDocker(remoto)).toBe(remoto);
  });
});
