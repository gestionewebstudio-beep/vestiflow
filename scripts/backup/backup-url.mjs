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
 * URL usato da pg_dump. Preferisce BACKUP_DATABASE_URL (session pooler IPv4 su Windows).
 */
export function resolveBackupDatabaseUrl(env) {
  const backupUrl = env.BACKUP_DATABASE_URL?.trim();
  if (backupUrl) {
    return sanitizeBackupDatabaseUrl(backupUrl);
  }
  const directUrl = env.DIRECT_URL?.trim() ?? '';
  return sanitizeBackupDatabaseUrl(directUrl);
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
      'URL database mancante. Imposta BACKUP_DATABASE_URL (consigliato su Windows) ' +
        'o DIRECT_URL in api/.env.',
    );
  }

  const host = extractPgHost(url);
  if (isDirectSupabaseDbHost(host)) {
    throw new Error(
      'BACKUP_DATABASE_URL punta al host diretto db.*.supabase.co, che su Windows spesso ' +
        'non funziona con pg_dump (solo IPv6).\n\n' +
        'In Supabase clicca Connect → Session pooler → porta 5432 e copia la URI con host tipo:\n' +
        '  aws-0-eu-west-1.pooler.supabase.com\n' +
        '(NON db.upuypsqavodytixhlwvz.supabase.co)',
    );
  }
}
