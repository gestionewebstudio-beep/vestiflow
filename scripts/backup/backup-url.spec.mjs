import { describe, expect, it } from 'vitest';

import {
  assertBackupDatabaseUrl,
  mascheraUrl,
  resolveBackupDatabaseUrl,
  sanitizeBackupDatabaseUrl,
} from './backup-url.mjs';

describe('backup-url.mjs', () => {
  /*
    ⛔ **Il bersaglio di un backup non si deduce da `api/.env`.** Fino al
    07/09/2026 `resolveBackupDatabaseUrl` riceveva l'ambiente di sviluppo e
    ripiegava su `DIRECT_URL`: bastava `npm run backup` per puntare al database
    condiviso senza averlo nominato.

    ⭐ Ora le fonti sono tre, tutte dichiarazioni di chi esegue, e la funzione
    restituisce anche l'ORIGINE — perché il chiamante possa dire da dove viene
    il bersaglio senza stampare l'URL.
  */
  describe('resolveBackupDatabaseUrl', () => {
    it("l'URL esplicita batte ogni altra fonte", () => {
      expect(
        resolveBackupDatabaseUrl({
          urlEsplicita: 'postgres://esplicita/db',
          daFileIndicato: 'postgres://file/db',
          daAmbiente: 'postgres://ambiente/db',
        }),
      ).toEqual({ url: 'postgres://esplicita/db', origine: '--database-url' });
    });

    it('poi il file indicato, poi l’ambiente del processo', () => {
      expect(
        resolveBackupDatabaseUrl({
          daFileIndicato: 'postgres://file/db',
          daAmbiente: 'postgres://ambiente/db',
        }).origine,
      ).toBe('file di ambiente indicato con --env-file');

      expect(resolveBackupDatabaseUrl({ daAmbiente: 'postgres://ambiente/db' })).toEqual({
        url: 'postgres://ambiente/db',
        origine: 'ambiente del processo',
      });
    });

    it('⛔ senza fonti NON inventa un bersaglio', () => {
      expect(resolveBackupDatabaseUrl({})).toEqual({ url: '', origine: null });
      expect(resolveBackupDatabaseUrl()).toEqual({ url: '', origine: null });
    });

    it('una fonte fatta di soli spazi non conta come indicata', () => {
      expect(
        resolveBackupDatabaseUrl({ urlEsplicita: '   ', daAmbiente: 'postgres://ambiente/db' })
          .origine,
      ).toBe('ambiente del processo');
    });

    it('sanitizza i parametri Prisma e porta il pooler alla 5432', () => {
      expect(
        resolveBackupDatabaseUrl({
          daFileIndicato:
            'postgresql://postgres.x:pass@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true',
        }).url,
      ).toBe('postgresql://postgres.x:pass@aws-0-eu-west-1.pooler.supabase.com:5432/postgres');
    });
  });

  it('assertBackupDatabaseUrl rifiuta un bersaglio non indicato', () => {
    expect(() => assertBackupDatabaseUrl('')).toThrow(/Bersaglio del database non indicato/);
  });

  it('assertBackupDatabaseUrl rifiuta host Supabase diretto db.*.supabase.co', () => {
    expect(() =>
      assertBackupDatabaseUrl('postgres://user:pass@db.abcdef.supabase.co:5432/postgres'),
    ).toThrow(/host diretto db\.\*\.supabase\.co/);
  });

  it('⛔ il messaggio d’errore non nomina un progetto Supabase reale', () => {
    let messaggio = '';
    try {
      assertBackupDatabaseUrl('postgres://user:pass@db.abcdef.supabase.co:5432/postgres');
    } catch (errore) {
      messaggio = String(errore.message);
    }
    // L'esempio dev'essere un segnaposto: un identificativo vero in un
    // messaggio d'errore finisce nei log come qualunque altra credenziale.
    expect(messaggio).toMatch(/<progetto>/);
    expect(messaggio).toMatch(/<regione>/);
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

  /*
    ⛔ **NIENTE URL NEI LOG.** Una stringa di connessione porta password, host,
    utente e identificativo di progetto: in un registro di CI o in un incolla
    di chat diventa pubblica.

    ⚠️ Il difetto era una maschera PARZIALE: `run-restore.mjs` faceva
    `directUrl.replace(/:[^:@/]+@/, ':***@')`, che copre la password e lascia
    host e utente — e il nome del progetto Supabase sta nell'host.
  */
  describe('mascheraUrl', () => {
    it('copre TUTTO, non solo la password', () => {
      const mascherato = mascheraUrl(
        'postgresql://postgres.abcdef:segretissima@aws-0-eu-west-1.pooler.supabase.com:5432/postgres',
      );
      expect(mascherato).toBe('postgresql://***');
      expect(mascherato).not.toContain('segretissima');
      expect(mascherato).not.toContain('supabase.com');
      expect(mascherato).not.toContain('abcdef');
    });

    it('maschera anche dentro lo stderr di pg_dump', () => {
      const stderr =
        'pg_dump: error: connection to server at "aws-0.pooler.supabase.com" failed\n' +
        'dsn: postgresql://postgres.xyz:pw@aws-0.pooler.supabase.com:5432/postgres';
      const mascherato = mascheraUrl(stderr);
      expect(mascherato).toContain('postgresql://***');
      expect(mascherato).not.toContain('pw@');
    });

    it('lascia intatto un testo senza URL', () => {
      expect(mascheraUrl('pg_dump terminato con codice 1.')).toBe(
        'pg_dump terminato con codice 1.',
      );
    });
  });
});
