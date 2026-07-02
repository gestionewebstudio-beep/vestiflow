import { mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_BUCKETS = [
  'product-media',
  'user-avatars',
  'document-attachments',
  'supplier-attachments',
];

async function listObjectsRecursive(client, bucket, prefix = '') {
  const paths = [];
  const limit = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await client.storage.from(bucket).list(prefix, {
      limit,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) {
      throw new Error(`List storage ${bucket}/${prefix || ''}: ${error.message}`);
    }
    if (!data?.length) {
      break;
    }

    for (const item of data) {
      const objectPath = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) {
        paths.push(...(await listObjectsRecursive(client, bucket, objectPath)));
      } else {
        paths.push(objectPath);
      }
    }

    if (data.length < limit) {
      break;
    }
    offset += limit;
  }

  return paths;
}

function bucketFromEnv(env, key, fallback) {
  const value = env[key]?.trim();
  return value || fallback;
}

function resolveBuckets(env) {
  return [
    bucketFromEnv(env, 'SUPABASE_PRODUCT_MEDIA_BUCKET', 'product-media'),
    bucketFromEnv(env, 'SUPABASE_USER_AVATARS_BUCKET', 'user-avatars'),
    bucketFromEnv(env, 'SUPABASE_DOCUMENT_ATTACHMENTS_BUCKET', 'document-attachments'),
    bucketFromEnv(env, 'SUPABASE_SUPPLIER_ATTACHMENTS_BUCKET', 'supplier-attachments'),
  ];
}

/**
 * Scarica tutti i bucket Supabase Storage configurati.
 * @param {{ supabaseUrl: string; serviceRoleKey: string; outputDir: string; buckets?: string[] }} options
 */
export async function backupStorage({ supabaseUrl, serviceRoleKey, outputDir, buckets }) {
  if (!supabaseUrl?.trim() || !serviceRoleKey?.trim()) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sono obbligatori per il backup storage.');
  }

  const client = createClient(supabaseUrl.trim(), serviceRoleKey.trim(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  mkdirSync(outputDir, { recursive: true });

  const summary = [];
  const bucketList = buckets?.length ? buckets : DEFAULT_BUCKETS;

  for (const bucket of bucketList) {
    const bucketDir = join(outputDir, bucket);
    mkdirSync(bucketDir, { recursive: true });

    let objectPaths = [];
    try {
      objectPaths = await listObjectsRecursive(client, bucket);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.toLowerCase().includes('not found')) {
        summary.push({ bucket, fileCount: 0, skipped: true, reason: 'bucket assente' });
        continue;
      }
      throw error;
    }

    let downloaded = 0;
    for (const objectPath of objectPaths) {
      const { data, error } = await client.storage.from(bucket).download(objectPath);
      if (error) {
        throw new Error(`Download ${bucket}/${objectPath}: ${error.message}`);
      }
      const normalizedTarget = join(bucketDir, ...objectPath.split('/'));
      mkdirSync(dirname(normalizedTarget), { recursive: true });
      const buffer = Buffer.from(await data.arrayBuffer());
      await writeFile(normalizedTarget, buffer);
      downloaded += 1;
    }

    summary.push({ bucket, fileCount: downloaded, skipped: false });
  }

  const totalFiles = summary.reduce((acc, item) => acc + item.fileCount, 0);
  return { summary, totalFiles, outputDir };
}

export { DEFAULT_BUCKETS, resolveBuckets };
