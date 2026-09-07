/**
 * ⛔ **NIENTE URL NEI LOG.** Una stringa di connessione porta password, host,
 * utente e identificativo di progetto: in un registro di CI o in un incolla di
 * chat diventa pubblica. Si maschera TUTTO cio` che sta fra lo schema e il
 * percorso, non solo la password.
 *
 * ⚠️ Qui c'era, in `run-restore.mjs`, `directUrl.replace(/:[^:@/]+@/, ':***@')`:
 * copre la password e lascia host e utente. Non basta — il nome del progetto
 * Supabase e` nell`host.
 */
export function mascheraUrl(testo) {
  return String(testo).replace(
    /(postgres(?:ql)?:\/\/)[^\s"']*/gi,
    (_intero, schema) => `${schema}***`,
  );
}

/** Parametri query Prisma/pooler non validi per pg_dump. */
const PG_DUMP_STRIP_QUERY_PARAMS = new Set(['pgbouncer', 'connection_limit', 'pool_timeout']);

/**
 * Rimuove query params Prisma e usa session pooler (5432) se l'URL punta al transaction pooler (6543).
 * Evita errori tipo: invalid URI query parameter: "pgbouncer".
 */
export function sanitizeBackupDatabaseUrl(url) {
  const trimmed = url.trim();
  if (!trimmed) {
    return '';
  }

  const qIndex = trimmed.indexOf('?');
  const base = (qIndex === -1 ? trimmed : trimmed.slice(0, qIndex)).replace(':6543/', ':5432/');

  if (qIndex === -1) {
    return base;
  }

  const kept = trimmed
    .slice(qIndex + 1)
    .split('&')
    .filter((part) => {
      const key = part.split('=')[0]?.trim().toLowerCase();
      return key && !PG_DUMP_STRIP_QUERY_PARAMS.has(key);
    });

  return kept.length > 0 ? `${base}?${kept.join('&')}` : base;
}

/**
 * Il bersaglio di pg_dump, e da DOVE gli è arrivato.
 *
 * ⛔ **Mai da `api/.env`.** È il file che la CLI Prisma e l’applicazione
 *    caricano da soli: ciò che sta lì non è una scelta di chi lancia il
 *    comando, è l’ambiente di sviluppo che si trova addosso. Fino al
 *    07/09/2026 questa funzione ci ripiegava sopra con `env.DIRECT_URL`, e
 *    bastava digitare `npm run backup` per puntare al database condiviso
 *    senza averlo nominato.
 *
 * ⭐ **Tre fonti, tutte esplicite**, in ordine di precedenza. L’ultima è
 *    l’ambiente del PROCESSO — una variabile esportata a mano o iniettata
 *    da un workflow: è una dichiarazione di chi esegue, non un file che
 *    qualcuno carica per lui. È anche ciò che tiene in piedi il backup
 *    automatico in CI senza toccarne il workflow.
 *
 * ⚠️ Restituisce anche l’ORIGINE, perché il chiamante la stampi: chi lancia
 *    un backup deve vedere da dove è arrivato il bersaglio, e vederlo senza
 *    che l’URL compaia nei log.
 *
 * @param {{urlEsplicita?: string, daFileIndicato?: string, daAmbiente?: string}} fonti
 * @returns {{url: string, origine: string|null}}
 */
export function resolveBackupDatabaseUrl(fonti = {}) {
  const candidate = [
    [fonti.urlEsplicita, '--database-url'],
    [fonti.daFileIndicato, 'file di ambiente indicato con --env-file'],
    [fonti.daAmbiente, 'ambiente del processo'],
  ];
  for (const [valore, origine] of candidate) {
    const pulito = valore?.trim() ?? '';
    if (pulito) {
      return { url: sanitizeBackupDatabaseUrl(pulito), origine };
    }
  }
  return { url: '', origine: null };
}

function extractPgHost(connectionUrl) {
  const match = connectionUrl.match(/@([^/?]+)/);
  if (!match?.[1]) {
    return null;
  }
  const hostPort = match[1];
  if (hostPort.startsWith('[')) {
    const end = hostPort.indexOf(']');
    return end > 0 ? hostPort.slice(1, end) : hostPort;
  }
  return hostPort.split(':')[0] ?? hostPort;
}

function isDirectSupabaseDbHost(host) {
  return Boolean(host && /^db\.[a-z0-9]+\.supabase\.co$/i.test(host));
}

export function assertBackupDatabaseUrl(url) {
  if (!url) {
    throw new Error(
      'Bersaglio del database non indicato. Non viene MAI dedotto da api/.env:\n' +
        '  --database-url <uri>     indicalo a mano, oppure\n' +
        '  --env-file <percorso>    un file di ambiente che indichi tu, oppure\n' +
        '  BACKUP_DATABASE_URL=...  esportata nell’ambiente di questo comando',
    );
  }

  const host = extractPgHost(url);
  if (isDirectSupabaseDbHost(host)) {
    throw new Error(
      'BACKUP_DATABASE_URL punta al host diretto db.*.supabase.co, che su Windows spesso ' +
        'non funziona con pg_dump (solo IPv6).\n\n' +
        'In Supabase clicca Connect → Session pooler → porta 5432 e copia la URI con host tipo:\n' +
        '  aws-0-<regione>.pooler.supabase.com\n' +
        '(NON db.<progetto>.supabase.co)',
    );
  }
}
