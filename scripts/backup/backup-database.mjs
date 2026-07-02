import { spawn } from 'node:child_process';
import { open, unlink } from 'node:fs/promises';
import { createGzip } from 'node:zlib';

import { encryptStreamToFile } from './crypto.mjs';
import { probePgTool } from './pg-tools.mjs';

/**
 * Dump completo Postgres (formato custom) → gzip → AES-256-GCM.
 * @param {{ directUrl: string; passphrase: string; outputPath: string }} options
 */
export async function backupDatabase({ directUrl, passphrase, outputPath }) {
  if (!directUrl?.trim()) {
    throw new Error('DIRECT_URL mancante. Usa la connection string diretta Supabase (porta 5432).');
  }
  if (!passphrase || passphrase.length < 16) {
    throw new Error(
      'BACKUP_ENCRYPTION_PASSPHRASE mancante o troppo corta (minimo 16 caratteri).',
    );
  }

  const pgDumpPath = await probePgTool('pg_dump');
  const pgDump = spawn(
    pgDumpPath,
    ['--format=custom', '--no-owner', '--no-acl', `--dbname=${directUrl.trim()}`],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );

  let stderr = '';
  pgDump.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const dumpDone = new Promise((resolve, reject) => {
    pgDump.on('error', reject);
    pgDump.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`pg_dump terminato con codice ${code}.\n${stderr}`));
        return;
      }
      resolve(undefined);
    });
  });

  const gzip = createGzip({ level: 9 });
  pgDump.stdout.pipe(gzip);

  const fileHandle = await open(outputPath, 'wx');
  try {
    await encryptStreamToFile(gzip, fileHandle, passphrase);
    await dumpDone;
  } catch (error) {
    await fileHandle.close();
    await unlink(outputPath).catch(() => undefined);
    throw error;
  } finally {
    await fileHandle.close();
  }

  return { outputPath, stderr: stderr.trim() || undefined };
}
