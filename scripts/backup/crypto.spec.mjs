import { mkdtemp, open, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';

import {
  BACKUP_MAGIC,
  createDecryptStream,
  encryptStreamToFile,
  HEADER_LEN,
} from './crypto.mjs';

describe('crypto.mjs', () => {
  it('roundtrip cifra e decifra payload', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vf-backup-test-'));
    const path = join(dir, 'payload.enc');
    const payload = 'hello backup world';
    const handle = await open(path, 'w');

    try {
      await encryptStreamToFile(Readable.from([payload]), handle, 'test-passphrase');
      await handle.close();

      const encrypted = await readFile(path);
      expect(encrypted.subarray(0, BACKUP_MAGIC.length).equals(BACKUP_MAGIC)).toBe(true);
      expect(encrypted.length).toBeGreaterThan(HEADER_LEN);

      const decryptedChunks = [];
      await new Promise((resolve, reject) => {
        const decrypt = createDecryptStream('test-passphrase');
        decrypt.on('data', (chunk) => decryptedChunks.push(chunk));
        decrypt.on('end', resolve);
        decrypt.on('error', reject);
        decrypt.write(encrypted);
        decrypt.end();
      });

      expect(Buffer.concat(decryptedChunks).toString('utf8')).toBe(payload);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rifiuta magic header errato', async () => {
    await new Promise((resolve, reject) => {
      const decrypt = createDecryptStream('passphrase');
      decrypt.on('error', (error) => {
        expect(error.message).toMatch(/magic header/);
        resolve(undefined);
      });
      decrypt.on('end', () => reject(new Error('Atteso errore di decifratura.')));
      decrypt.write(Buffer.alloc(HEADER_LEN, 0));
      decrypt.end();
    });
  });
});
