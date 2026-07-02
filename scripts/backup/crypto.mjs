import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { Transform } from 'node:stream';

export const BACKUP_MAGIC = Buffer.from('VFBAK1', 'utf8');
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;
export const HEADER_LEN = BACKUP_MAGIC.length + SALT_LEN + IV_LEN + TAG_LEN;

function deriveKey(passphrase, salt) {
  return scryptSync(passphrase, salt, KEY_LEN);
}

/**
 * Cifra uno stream in AES-256-GCM.
 * Formato file: VFBAK1 | salt(16) | iv(12) | authTag(16) | ciphertext…
 */
export async function encryptStreamToFile(inputStream, fileHandle, passphrase) {
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const key = deriveKey(passphrase, salt);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  await fileHandle.write(BACKUP_MAGIC);
  await fileHandle.write(salt);
  await fileHandle.write(iv);
  const tagPosition = (await fileHandle.stat()).size;
  await fileHandle.write(Buffer.alloc(TAG_LEN));

  await new Promise((resolve, reject) => {
    let pendingWrite = Promise.resolve();

    inputStream.on('data', (chunk) => {
      const encrypted = cipher.update(chunk);
      if (encrypted.length) {
        pendingWrite = pendingWrite
          .then(() => fileHandle.write(encrypted))
          .catch(reject);
      }
    });
    inputStream.on('error', reject);
    inputStream.on('end', () => {
      pendingWrite
        .then(async () => {
          const tail = cipher.final();
          if (tail.length) {
            await fileHandle.write(tail);
          }
          const tag = cipher.getAuthTag();
          await fileHandle.write(tag, 0, TAG_LEN, tagPosition);
          resolve(undefined);
        })
        .catch(reject);
    });
  });
}

export function createDecryptStream(passphrase) {
  let state = 'header';
  let header = Buffer.alloc(0);
  let decipher;

  return new Transform({
    transform(chunk, encoding, callback) {
      try {
        if (state === 'header') {
          header = Buffer.concat([header, chunk]);
          if (header.length < HEADER_LEN) {
            callback();
            return;
          }
          const magic = header.subarray(0, BACKUP_MAGIC.length);
          if (!magic.equals(BACKUP_MAGIC)) {
            callback(new Error('File backup non valido (magic header mancante).'));
            return;
          }
          const salt = header.subarray(BACKUP_MAGIC.length, BACKUP_MAGIC.length + SALT_LEN);
          const iv = header.subarray(
            BACKUP_MAGIC.length + SALT_LEN,
            BACKUP_MAGIC.length + SALT_LEN + IV_LEN,
          );
          const tag = header.subarray(
            BACKUP_MAGIC.length + SALT_LEN + IV_LEN,
            HEADER_LEN,
          );
          const key = deriveKey(passphrase, salt);
          decipher = createDecipheriv('aes-256-gcm', key, iv);
          decipher.setAuthTag(tag);
          const rest = header.subarray(HEADER_LEN);
          state = 'body';
          if (rest.length) {
            this.push(decipher.update(rest));
          }
          callback();
          return;
        }

        if (decipher) {
          this.push(decipher.update(chunk));
        }
        callback();
      } catch (error) {
        callback(error);
      }
    },
    flush(callback) {
      try {
        if (decipher) {
          this.push(decipher.final());
        }
        callback();
      } catch (error) {
        callback(error);
      }
    },
  });
}
