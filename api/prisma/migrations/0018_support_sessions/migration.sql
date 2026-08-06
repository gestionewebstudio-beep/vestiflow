-- Sessioni assistenza: operatore piattaforma → gestionale cliente (impersonation controllata).

CREATE TABLE "support_sessions" (
    "id" UUID NOT NULL,
    "operator_user_id" UUID NOT NULL,
    "target_tenant_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "support_sessions_operator_user_id_ended_at_idx" ON "support_sessions"("operator_user_id", "ended_at");
CREATE INDEX "support_sessions_target_tenant_id_idx" ON "support_sessions"("target_tenant_id");

ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_operator_user_id_fkey" FOREIGN KEY ("operator_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_target_tenant_id_fkey" FOREIGN KEY ("target_tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "support_sessions" ENABLE ROW LEVEL SECURITY;
