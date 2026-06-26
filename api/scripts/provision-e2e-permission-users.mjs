/**
 * Crea/aggiorna utenti commesso E2E con permessi granulari (idempotente).
 * Richiede api/.env con DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 *
 * Tenant: E2E_TENANT_ID oppure tenant di E2E_USER_EMAIL / E2E_CLERK_EMAIL.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PrismaClient, UserRole } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
loadEnvFile(resolve(scriptDir, '../.env'));
loadEnvFile(resolve(scriptDir, '../../.env'));

const DEFAULT_PASSWORD = process.env.E2E_GRANULAR_PASSWORD?.trim()
  || process.env.E2E_CLERK_PASSWORD?.trim()
  || 'VestiflowE2e!2026';

const CATALOG_IMPORT_EMAIL =
  process.env.E2E_CLERK_CATALOG_IMPORT_EMAIL?.trim().toLowerCase()
  || 'e2e.clerk.catalog-import@vestiflow.test';

const INVENTORY_IMPORT_EMAIL =
  process.env.E2E_CLERK_INVENTORY_IMPORT_EMAIL?.trim().toLowerCase()
  || 'e2e.clerk.inventory-import@vestiflow.test';

const E2E_CLERKS = [
  {
    email: CATALOG_IMPORT_EMAIL,
    displayName: 'E2E Commesso Catalog Import',
    permissions: ['catalog.import_export', 'reports.view'],
  },
  {
    email: INVENTORY_IMPORT_EMAIL,
    displayName: 'E2E Commesso Inventory Import',
    permissions: ['inventory.import_export', 'reports.view'],
  },
];

const prisma = new PrismaClient();

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^(['"])(.*)\1$/, '$2');
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function createSupabaseAdmin() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY obbligatori in api/.env');
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function listAllAuthUsers(supabase) {
  const users = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`listUsers Supabase: ${error.message}`);
    }
    users.push(...data.users);
    if (data.users.length < perPage) {
      break;
    }
    page += 1;
  }

  return users;
}

async function ensureAuthUser(supabase, email, password) {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = (await listAllAuthUsers(supabase)).find(
    (user) => user.email?.toLowerCase() === normalizedEmail,
  );

  if (existing) {
    const { error } = await supabase.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    });
    if (error) {
      throw new Error(`updateUser ${normalizedEmail}: ${error.message}`);
    }
    return existing.id;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: normalizedEmail,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`createUser ${normalizedEmail}: ${error?.message ?? 'errore sconosciuto'}`);
  }
  return data.user.id;
}

async function resolveTenantContext() {
  const tenantIdOverride = process.env.E2E_TENANT_ID?.trim();
  if (tenantIdOverride) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantIdOverride } });
    if (!tenant) {
      throw new Error(`Tenant E2E_TENANT_ID non trovato: ${tenantIdOverride}`);
    }
    return resolveTenantResources(tenant.id);
  }

  const anchorEmail =
    process.env.E2E_USER_EMAIL?.trim()
    || process.env.E2E_CLERK_EMAIL?.trim();
  if (!anchorEmail) {
    throw new Error(
      'Imposta E2E_TENANT_ID oppure E2E_USER_EMAIL / E2E_CLERK_EMAIL in .env per individuare il tenant.',
    );
  }

  const anchorUser = await prisma.user.findFirst({
    where: { email: { equals: anchorEmail, mode: 'insensitive' } },
    select: { tenantId: true },
  });
  if (!anchorUser) {
    throw new Error(`Utente ancoraggio non trovato nel DB: ${anchorEmail}`);
  }

  return resolveTenantResources(anchorUser.tenantId);
}

async function resolveTenantResources(tenantId) {
  const store = await prisma.store.findFirst({
    where: { tenantId },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!store) {
    throw new Error(`Nessuno store per tenant ${tenantId}`);
  }

  const location = await prisma.location.findFirst({
    where: { tenantId, licensedInVf: true, isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
  });

  return { tenantId, storeId: store.id, assignedLocationId: location?.id ?? null, locationName: location?.name ?? null };
}

async function upsertTenantUser({
  tenantId,
  storeId,
  assignedLocationId,
  email,
  displayName,
  permissions,
  authUserId,
}) {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await prisma.user.findFirst({
    where: {
      tenantId,
      email: { equals: normalizedEmail, mode: 'insensitive' },
    },
  });

  if (existing) {
    const user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        authUserId,
        displayName,
        role: UserRole.clerk,
        assignedLocationId,
        permissions,
        isActive: true,
      },
    });
    await prisma.userStore.upsert({
      where: { userId_storeId: { userId: user.id, storeId } },
      update: {},
      create: { userId: user.id, storeId },
    });
    return user;
  }

  const user = await prisma.user.create({
    data: {
      tenantId,
      authUserId,
      email: normalizedEmail,
      displayName,
      role: UserRole.clerk,
      assignedLocationId,
      permissions,
      isActive: true,
      stores: { create: { storeId } },
    },
  });
  return user;
}

try {
  const supabase = createSupabaseAdmin();
  const ctx = await resolveTenantContext();

  if (!ctx.assignedLocationId) {
    console.warn(
      'Attenzione: nessuna location licenziata attiva — commessi creati senza sede assegnata.',
    );
  } else {
    console.log(`Sede operativa assegnata: ${ctx.locationName} (${ctx.assignedLocationId})`);
  }

  console.log(`Tenant: ${ctx.tenantId}`);
  console.log(`Password E2E (tutti gli utenti granulari): ${DEFAULT_PASSWORD}`);
  console.log('---');

  for (const profile of E2E_CLERKS) {
    const authUserId = await ensureAuthUser(supabase, profile.email, DEFAULT_PASSWORD);
    const user = await upsertTenantUser({
      tenantId: ctx.tenantId,
      storeId: ctx.storeId,
      assignedLocationId: ctx.assignedLocationId,
      email: profile.email,
      displayName: profile.displayName,
      permissions: profile.permissions,
      authUserId,
    });

    console.log(`OK ${profile.email}`);
    console.log(`   id: ${user.id}`);
    console.log(`   permessi: ${profile.permissions.join(', ')}`);
  }

  console.log('---');
  console.log('Aggiorna .env (root) per Playwright:');
  console.log(`E2E_CLERK_CATALOG_IMPORT_EMAIL=${CATALOG_IMPORT_EMAIL}`);
  console.log(`E2E_CLERK_INVENTORY_IMPORT_EMAIL=${INVENTORY_IMPORT_EMAIL}`);
  console.log(`E2E_CLERK_CATALOG_IMPORT_PASSWORD=${DEFAULT_PASSWORD}`);
  console.log(`E2E_CLERK_INVENTORY_IMPORT_PASSWORD=${DEFAULT_PASSWORD}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Provisioning E2E fallito: ${message}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
