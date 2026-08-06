import { Logger } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Bucket allegati: creato al primo utilizzo se manca.
 *
 * I bucket Supabase erano stati creati a mano e quello degli allegati non era
 * mai stato provisionato: ogni upload falliva con "Bucket not found", anche
 * con un PDF valido. L'auto-provisioning rende il flusso indipendente da
 * passaggi manuali e vale per ogni ambiente (locale, staging, produzione).
 *
 * Il bucket è PRIVATO: gli allegati si scaricano solo tramite l'API, che
 * verifica tenant e permessi.
 */
const logger = new Logger('AttachmentStorage');

/** Bucket già verificati in questo processo: un solo controllo per avvio. */
const ensuredBuckets = new Set<string>();

export async function ensureAttachmentBucket(
  client: SupabaseClient,
  bucket: string,
  maxFileBytes: number,
): Promise<void> {
  if (ensuredBuckets.has(bucket)) {
    return;
  }

  const { data, error } = await client.storage.getBucket(bucket);
  if (data && !error) {
    ensuredBuckets.add(bucket);
    return;
  }

  const { error: createError } = await client.storage.createBucket(bucket, {
    public: false,
    fileSizeLimit: maxFileBytes,
  });

  // "already exists": creato da un'altra istanza in parallelo — va bene così.
  if (createError && !/already exists/i.test(createError.message)) {
    logger.error(`Creazione bucket allegati "${bucket}" non riuscita: ${createError.message}`);
    return;
  }

  logger.log(`Bucket allegati "${bucket}" pronto.`);
  ensuredBuckets.add(bucket);
}

/** Solo per i test: azzera la cache dei bucket verificati. */
export function resetEnsuredAttachmentBuckets(): void {
  ensuredBuckets.clear();
}
