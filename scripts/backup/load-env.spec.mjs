import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

import { leggiFileAmbiente, loadApiEnv, repoRoot } from './load-env.mjs';

/** La cartella di QUESTO file: l'unica ancora che non dipende da dove sta il repository. */
const questaCartella = dirname(fileURLToPath(import.meta.url));

describe('load-env.mjs', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readFileSync).mockReturnValue('');
  });

  /*
    ⛔ **Qui c'era `expect(repoRoot).toMatch(/vestiflow$/i)`, e falliva in un
       worktree.** Asseriva il NOME della cartella, che non e' una proprieta' del
       codice: e' una proprieta' di dove qualcuno ha messo il repository. Un
       worktree si chiama altrimenti, una copia per un collaudo pure, e chi clona
       puo' rinominarla — il test diventava rosso senza che niente fosse rotto.

    ⭐ Quello che `repoRoot` promette e' una RELAZIONE: e' la radice del
       repository, due livelli sopra `scripts/backup/`. Si verifica cosi', e la
       verifica regge ovunque il repository si trovi e comunque si chiami.

    ⚠️ Il confronto passa solo da `node:path`, mai da `node:fs`: qui `fs` e'
       mockato, e un test che chiedesse al filesystem se una cartella esiste
       verificherebbe il mock, non la struttura.
  */
  it('repoRoot e` la radice del repository, ricavata dalla posizione dei file', () => {
    expect(repoRoot).toBe(resolve(questaCartella, '../..'));
  });

  it('e la relazione regge nella direzione opposta: da repoRoot si torna a questa cartella', () => {
    expect(resolve(join(repoRoot, 'scripts', 'backup'))).toBe(resolve(questaCartella));
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

  /*
    `leggiFileAmbiente` e' l'opposto di `loadApiEnv`: non mescola l'ambiente del
    processo e non ripiega su `api/.env`. Legge SOLO il file che qualcuno ha
    nominato, e se non c'e' lancia — un ripiego silenzioso su un'altra fonte e'
    il difetto che backup, restore ed export hanno appena smesso di avere.
  */
  describe('leggiFileAmbiente', () => {
    it('legge solo il file indicato, ignorando process.env', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('SOLO_NEL_FILE=dal-file\n');
      vi.stubEnv('ALTRA_VARIABILE', 'dal-processo');

      const valori = leggiFileAmbiente('/percorso/indicato/.env.rilascio');

      expect(valori.SOLO_NEL_FILE).toBe('dal-file');
      expect(valori.ALTRA_VARIABILE).toBeUndefined();
    });

    it('⛔ se il file non esiste LANCIA, non ripiega', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      expect(() => leggiFileAmbiente('/percorso/che/non/esiste')).toThrow(
        /File di ambiente non trovato/,
      );
    });

    it('salta commenti e righe malformate, toglie le virgolette', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        '# commento\nSENZA_UGUALE\nCHIAVE=valore\nVIRGOLETTE="con spazi"\n',
      );

      const valori = leggiFileAmbiente('/qualunque');

      expect(valori.CHIAVE).toBe('valore');
      expect(valori.VIRGOLETTE).toBe('con spazi');
      expect(valori.SENZA_UGUALE).toBeUndefined();
    });
  });
});
