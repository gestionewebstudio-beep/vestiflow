import { PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { ambienteIntegrazione } from './env';

/**
 * Le barriere che impediscono alla suite di integrazione di raggiungere DEV.
 *
 * ⭐ **Questo file non ha bisogno del database**, ed è deliberato: si esegue
 *    anche a container spento, e la sua sola funzione è dire se le protezioni
 *    sono ancora in piedi.
 *
 * ⛔ **Serve perché una di esse era già falsa una volta.** La prima stesura di
 *    `setup.ts` CANCELLAVA `DATABASE_URL` dal processo e il commento
 *    dichiarava, con sicurezza, che un `new PrismaClient()` distratto non
 *    avrebbe trovato un URL. Non era vero: importare `@prisma/client` fa
 *    ricaricare `api/.env` a Prisma, che rimette la variabile: la `delete`
 *    veniva annullata dal primo `import` di ogni test.
 *
 *    La protezione esisteva nel commento e non nell'esecuzione — la stessa
 *    forma dei sei difetti di `docs/21`. È stata trovata provandola, non
 *    rileggendola.
 */
describe('barriere anti-DEV della suite di integrazione', () => {
  const salva = { ...process.env };
  const ripristina = (): void => {
    for (const chiave of Object.keys(process.env)) {
      delete process.env[chiave];
    }
    Object.assign(process.env, salva);
  };

  describe('la connessione DEV non è raggiungibile da qui', () => {
    /**
     * ⚠️ **Qui c'era «è sostituita da un segnaposto irraggiungibile»**
     * (`127.0.0.1:1`). Quel disegno faceva fallire un client distratto, ma
     * impediva anche di avviare l'app Nest vera — e senza app non esiste una
     * prova HTTP, che è la sola che certifica la propagazione dell'utente.
     *
     * ⭐ Ora `DATABASE_URL` vale la connessione di TEST, e **l'obiettivo è
     *    rispettato meglio**: non era mai «nessun client deve funzionare», era
     *    «niente deve raggiungere DEV». Un client nudo finisce sul database di
     *    prova, che è il posto giusto.
     */
    it('⛔ DATABASE_URL vale il database di PROVA, non quello di sviluppo', () => {
      expect(process.env['DATABASE_URL']).toContain('localhost:5433/vestiflow_test');
      expect(process.env['DIRECT_URL']).toContain('localhost:5433/vestiflow_test');
      expect(process.env['DATABASE_URL']).not.toContain('supabase');
    });

    it('la vera connessione DEV resta disponibile solo per il confronto', () => {
      expect(process.env['VESTIFLOW_DEV_DATABASE_URL']).toMatch(/supabase/);
      expect(process.env['DATABASE_URL']).not.toBe(
        process.env['VESTIFLOW_DEV_DATABASE_URL'],
      );
    });

    /**
     * ⭐ **La prova che conta di più**, e non si accontenta della variabile:
     * apre una connessione vera e chiede al server come si chiama. Un client
     * costruito senza `datasources` atterra sul database di prova.
     */
    it('⛔ un PrismaClient nudo atterra sul TEST, e lo si chiede al server', async () => {
      const nudo = new PrismaClient();
      const righe = await nudo.$queryRawUnsafe<{ db: string }[]>(
        'SELECT current_database() AS db',
      );
      expect(righe[0]?.db).toBe('vestiflow_test');
      await nudo.$disconnect();
    }, 20_000);

    it('⛔ le credenziali Supabase DEV non sono nel processo', () => {
      expect(process.env['SUPABASE_SERVICE_ROLE_KEY']).toBe('');
      expect(process.env['SUPABASE_URL']).toContain('integrazione.vestiflow.local');
    });
  });

  describe('ambienteIntegrazione() rifiuta ciò che deve rifiutare', () => {
    it('⛔ variabile assente: «Integration database not configured»', () => {
      delete process.env['DATABASE_URL_TEST'];
      expect(() => ambienteIntegrazione()).toThrow(/Integration database not configured/);
      ripristina();
    });

    /**
     * ⭐ La barriera che una lista bianca rende possibile: rifiuta un host
     * remoto QUALUNQUE, non solo quello di DEV. Un controllo «diverso da
     * DATABASE_URL» lascerebbe passare questo.
     */
    it('⛔ host remoto che NON è DEV: rifiutato lo stesso', () => {
      process.env['DATABASE_URL_TEST'] = 'postgresql://u:p@db.altrove.example.com:5432/x';
      expect(() => ambienteIntegrazione()).toThrow(/non . locale/);
      ripristina();
    });

    /**
     * ⭐ **Locale non vuol dire «di prova», ed è il caso che host e porta da
     * soli non coprono.** Sulla 5432 può esserci un PostgreSQL di sviluppo
     * personale; con lo stesso nome di database ci potrebbe essere un
     * `vestiflow_dev`. La suite TRONCA le tabelle: entrambi verrebbero
     * cancellati, e sarebbero «locali» in tutti e due i casi.
     */
    it('⛔ porta sbagliata (5432): rifiutata anche se locale', () => {
      process.env['DATABASE_URL_TEST'] =
        'postgresql://vestiflow:x@localhost:5432/vestiflow_test';
      expect(() => ambienteIntegrazione()).toThrow(/porta 5432, attesa 5433/);
      ripristina();
    });

    it('⛔ nome database sbagliato: rifiutato anche su host e porta giusti', () => {
      process.env['DATABASE_URL_TEST'] =
        'postgresql://vestiflow:x@localhost:5433/vestiflow_dev';
      expect(() => ambienteIntegrazione()).toThrow(
        /database «vestiflow_dev», atteso «vestiflow_test»/,
      );
      ripristina();
    });

    it('⛔ database senza nome: rifiutato', () => {
      process.env['DATABASE_URL_TEST'] = 'postgresql://vestiflow:x@localhost:5433/';
      expect(() => ambienteIntegrazione()).toThrow(/atteso «vestiflow_test»/);
      ripristina();
    });

    /**
     * ⚠️ `DIRECT_URL_TEST` passa dalla stessa verifica: è l'URL che
     * `migrate deploy` usa per SCRIVERE lo schema. Controllare solo il primo
     * lascerebbe scoperto proprio quello che fa più danno.
     */
    it('⛔ DIRECT_URL_TEST sbagliata: rifiutata come l’altra', () => {
      process.env['DIRECT_URL_TEST'] =
        'postgresql://vestiflow:x@localhost:5432/vestiflow_test';
      expect(() => ambienteIntegrazione()).toThrow(/DIRECT_URL_TEST usa la porta 5432/);
      ripristina();
    });

    it('⛔ coincide con DEV: rifiutato', () => {
      process.env['VESTIFLOW_DEV_DATABASE_URL'] =
        'postgresql://u:p@localhost:5433/vestiflow_test';
      expect(() => ambienteIntegrazione()).toThrow(/stesso database/);
      ripristina();
    });

    it('✅ configurazione buona: risolve sul container locale', () => {
      const ambiente = ambienteIntegrazione();
      expect(ambiente.host).toBe('localhost:5433');
      expect(ambiente.database).toBe('vestiflow_test');
    });
  });
});
