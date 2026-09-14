import { describe, expect, it } from 'vitest';

import { urlRiservataAlRegistro } from './platform-audit-prisma.client';

/**
 * L'URL della connessione riservata al registro (`docs/DA-FARE` §10.3).
 *
 * ⛔ **Il requisito è «stesso database dell'operazione, preservando gli altri
 *    parametri»**: qui si verifica proprio quello, perché una URL costruita a
 *    pezzi manderebbe le scritture del registro su un bersaglio diverso da
 *    quello dell'operazione — e nessun test di integrazione se ne accorgerebbe,
 *    dato che là il client si passa esplicitamente.
 */
describe('urlRiservataAlRegistro', () => {
  const BASE =
    'postgresql://utente:segreto@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=5';

  it('porta connection_limit a UNO, e non tocca nient altro', () => {
    const url = new URL(urlRiservataAlRegistro(BASE));

    expect(url.searchParams.get('connection_limit')).toBe('1');
    // ⭐ Stesso database, stesso host, stessa porta, stesse credenziali.
    expect(url.protocol).toBe('postgresql:');
    expect(url.hostname).toBe('aws-0-eu-west-1.pooler.supabase.com');
    expect(url.port).toBe('6543');
    expect(url.pathname).toBe('/postgres');
    expect(url.username).toBe('utente');
    expect(url.password).toBe('segreto');
    // ⭐ E gli altri parametri di connessione restano: `pgbouncer` deciso altrove
    //    non deve sparire perché il registro si è preso una connessione sua.
    expect(url.searchParams.get('pgbouncer')).toBe('true');
  });

  it('aggiunge il limite quando la URL non ne ha, e conserva i parametri che ci sono', () => {
    const url = new URL(
      urlRiservataAlRegistro(
        'postgresql://u:p@localhost:5433/vestiflow_test?schema=public&options=-c%20lock_timeout%3D30000',
      ),
    );

    expect(url.searchParams.get('connection_limit')).toBe('1');
    expect(url.searchParams.get('schema')).toBe('public');
    expect(url.searchParams.get('options')).toBe('-c lock_timeout=30000');
    expect(url.pathname).toBe('/vestiflow_test');
  });

  it('⛔ LANCIA se il bersaglio manca: non ripiega su niente', () => {
    // Un client del registro connesso a un bersaglio deciso altrove sarebbe
    // peggio di un client che non parte.
    expect(() => urlRiservataAlRegistro(undefined)).toThrow(/DATABASE_URL assente/);
    expect(() => urlRiservataAlRegistro('')).toThrow(/DATABASE_URL assente/);
    expect(() => urlRiservataAlRegistro('   ')).toThrow(/DATABASE_URL assente/);
  });
});
