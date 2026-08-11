-- Gestione utenti delegata al titolare (Impostazioni → Utenti):
-- 1) users.must_change_password — la password iniziale la imposta chi crea
--    l'account (titolare o admin piattaforma), quindi la conosce: al primo
--    accesso l'app chiede di cambiarla e il flag si azzera a cambio avvenuto.
-- 2) tenant_user_audit_logs — ogni mutazione di un account tenant (creazione,
--    modifica con diff prima/dopo, eliminazione) lascia traccia di chi l'ha
--    fatta e su chi. Attore e bersaglio sono snapshot testuali, senza FK verso
--    users: la riga resta leggibile anche dopo rinomina/eliminazione degli
--    account coinvolti.

ALTER TABLE "users" ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE "TenantUserAuditAction" AS ENUM ('created', 'updated', 'deleted');

CREATE TABLE "tenant_user_audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "actor_user_id" UUID,
  "actor_email" TEXT NOT NULL,
  "actor_name" TEXT NOT NULL,
  "actor_is_platform_admin" BOOLEAN NOT NULL DEFAULT false,
  "target_user_id" UUID,
  "target_email" TEXT NOT NULL,
  "action" "TenantUserAuditAction" NOT NULL,
  "details" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_user_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tenant_user_audit_logs_tenant_created_idx"
  ON "tenant_user_audit_logs"("tenant_id", "created_at");

-- Sicurezza (regole-sicurezza): RLS abilitata + REVOKE nella stessa migration.
-- L'API si connette come owner (bypassa RLS); la anon/authenticated key no.
ALTER TABLE "tenant_user_audit_logs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "tenant_user_audit_logs" FROM anon, authenticated;

ALTER TABLE "tenant_user_audit_logs"
  ADD CONSTRAINT "tenant_user_audit_logs_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
