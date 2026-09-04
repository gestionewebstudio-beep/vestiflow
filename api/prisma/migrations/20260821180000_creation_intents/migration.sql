-- Il registro degli INTENTI DI CREAZIONE (T15).
--
-- Specifica: `docs/T15-IDEMPOTENZA-SALVATAGGI.md`.
--
-- ── IL PROBLEMA ─────────────────────────────────────────────────────────────
-- Lo stesso comando di salvataggio, reinviato dopo che la transazione ha gia'
-- COMMITTATO ma la risposta si e' persa (timeout di 15s del client, rete, tab
-- chiusa), crea un SECONDO record con effetti pieni. Censiti 45 comandi in
-- perimetro: 12 vulnerabili.
--
-- La causa e' unica: il solo discriminante fra creazione e aggiornamento e'
-- `dto.id`, che per costruzione il client non possiede quando la risposta si
-- perde — l'id lo impara nel ramo `next` della sottoscrizione, che in quel caso
-- non viene mai eseguito. Ogni riconciliazione del sistema (righe per
-- `line.id`, movimenti per `source_line_id`, impegni per `sales_order_line_id`)
-- e' chiavata su qualcosa che APPARTIENE al record: un secondo record porta
-- chiavi nuove, e ogni riconciliazione riparte da zero.
--
-- ── PERCHE' UNA TABELLA E NON UNA COLONNA ───────────────────────────────────
-- Valutate entrambe. Una colonna `creation_intent_id` su `documents` sarebbe
-- stata piu' semplice sul PRIMO percorso e piu' cara su tutti gli altri: i
-- percorsi vulnerabili scrivono su tabelle diverse (`documents`, `sales_orders`,
-- `supplier_orders`, `manual_receipts`, `inventory_count_sessions`), e ognuna
-- avrebbe voluto la sua colonna, il suo indice e il suo gestore di P2002.
--
-- ⛔ E avrebbe rotto una cosa che oggi funziona. `isDocumentNumberConflict`
-- riconosce il conflitto di numero dal MODELLO Prisma, e il suo commento si
-- giustifica cosi': «documents → SOLO `documents_number_unique`. Nessun altro
-- candidato». Un secondo vincolo unico su quella tabella avrebbe fatto arrivare
-- all'operatore «numero gia' assegnato» — con la proposta di un numero libero
-- che non c'entra niente — davanti a un banale reinvio. Su questo modello il
-- P2002 non entra in `MODELLI_NUMERATI`, quindi non la sfiora.
--
-- ── COME FUNZIONA ───────────────────────────────────────────────────────────
-- Il claim e' la PRIMA scrittura della stessa transazione che crea il record e
-- applica gli effetti. Da cui, senza bisogno di altro:
--
--   rollback     la riga del claim muore con la transazione: nessun residuo,
--                e l'intento resta riutilizzabile
--   concorrenza  la seconda INSERT aspetta il vincolo unico; se la prima
--                conferma riceve un P2002 PRIMA di aver toccato le giacenze
--   replay       stesso intento + stessa impronta → si restituisce il risultato
--                gia' prodotto, leggendo `result_ref`
--   abuso        stesso intento + impronta diversa → conflitto strutturato, e
--                nessuna seconda creazione
--
-- ⚠️ `intent_id` e' TEXT e non UUID di proposito: e' un identificativo OPACO
-- generato dal client. Vincolarne la forma qui significherebbe decidere per i
-- chiamanti futuri, e il valore non viene mai interpretato — solo confrontato.
--
-- ⚠️ Nessuna scadenza e nessuna pulizia in questa migration. La ritenzione e'
-- una decisione di prodotto (quanto a lungo un reinvio deve essere riconosciuto)
-- e non si prende di straforo dentro una migration: finche' non e' presa, il
-- registro cresce, ed e' una riga corta per salvataggio.

CREATE TABLE "creation_intents" (
  "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"   UUID        NOT NULL,
  -- Opaco, dal client. Vedi la nota sopra.
  "intent_id"   TEXT        NOT NULL,
  -- L'ambito serve a LEGGERE il registro e a dare un messaggio sensato, non a
  -- decidere: a decidere e' il vincolo unico qui sotto.
  "scope"       TEXT        NOT NULL,
  -- Impronta della richiesta: distingue il reinvio dello stesso comando
  -- dall'uso improprio dello stesso intento per un comando diverso.
  "fingerprint" TEXT        NOT NULL,
  -- Riferimento opaco al record creato: `NULL` finche' la creazione non e'
  -- andata a buon fine. Lo interpreta il percorso che l'ha scritto.
  "result_ref"  TEXT,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creation_intents_pkey" PRIMARY KEY ("id")
);

-- ⭐ IL VINCOLO CHE FA TUTTO IL LAVORO.
--
-- Tenant-scoped come ogni chiave di deduplica di questo repository
-- (`online_order_events`, `online_sales`): il tenant e' una COLONNA del vincolo,
-- non un pezzo della stringa. Due tenant che generassero lo stesso intento —
-- caso remoto ma non impossibile con identificativi client — restano separati.
CREATE UNIQUE INDEX "creation_intents_tenant_intent_unique"
  ON "creation_intents" ("tenant_id", "intent_id");

-- Per leggere il registro e per l'eventuale pulizia futura.
CREATE INDEX "creation_intents_tenant_created_idx"
  ON "creation_intents" ("tenant_id", "created_at" DESC);

-- CASCADE: il registro non ha valore fuori dal suo tenant, e non deve opporsi
-- alla cancellazione di un tenant come farebbe un RESTRICT.
ALTER TABLE "creation_intents"
  ADD CONSTRAINT "creation_intents_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Sicurezza (regole-sicurezza): RLS abilitata + REVOKE nella stessa migration
-- che crea la tabella. L'API si connette come owner e bypassa la RLS; la
-- anon/publishable key, che finisce nel bundle JS, no. Lo verifica
-- `npm run check:rls` in CI.
ALTER TABLE "creation_intents" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "creation_intents" FROM anon, authenticated;
