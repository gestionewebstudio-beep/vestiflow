-- Modalita' di pagamento normative FatturaPA: il catalogo globale MP01-MP23 e
-- il collegamento dai Tipi pagamento aziendali (tranche C2A, `docs/25` §7).
--
-- ── PERCHE' ────────────────────────────────────────────────────────────────
-- La specifica Pagamenti/Tesoreria §2.1-2.3 ha gia' deciso i DUE livelli:
-- Modalita' normativa col codice FatturaPA, e Tipo aziendale che la
-- referenzia. Il codice non l'aveva mai implementato: `payment_options` porta
-- il codice DENTRO l'etichetta — «Contanti (MP01)» — che nessuno puo' leggere
-- come dato. E' anche il motivo per cui `fatturapa-xml.util.ts` NON emette
-- `ModalitaPagamento`: «sarebbe un valore inventato».
--
-- ⛔ Questa migration NON abilita quell'emissione: e' un intervento fiscale
--    separato, con prove contro XSD e documenti storici.
--
-- ── ADDITIVA E COMPATIBILE COL CODICE PRECEDENTE ───────────────────────────
-- Il database e' condiviso, quindi il rollback non puo' essere un `DROP`:
-- togliere colonne e' una perdita, non un ritorno indietro. Il ritorno
-- ammesso e' distribuire il codice VECCHIO sopra questo schema, e da li'
-- discende la forma della migration:
--
--   · nessun `NOT NULL` su colonne nuove di tabelle esistenti;
--   · nessuna rinomina, nessun `DROP`;
--   · nessuna riga esistente riscritta a parte `method_code_id`.
--
-- Nomi, etichette e snapshot su documenti, clienti e fornitori NON si toccano.

-- ── 1. Il catalogo globale ─────────────────────────────────────────────────
--
-- Nessun `tenant_id`: e' uno STANDARD, non una preferenza aziendale. Oggi il
-- catalogo e' replicato per tenant (92 righe per 23 codici, misurate il
-- 04/09/2026) e ogni copia puo' divergere dalle altre.
CREATE TABLE "payment_method_codes" (
  "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
  "code"       TEXT         NOT NULL,
  "label"      TEXT         NOT NULL,
  "sort_order" INTEGER      NOT NULL DEFAULT 0,
  "is_active"  BOOLEAN      NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "payment_method_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_method_codes_code_key" ON "payment_method_codes"("code");
CREATE INDEX "payment_method_codes_sort_order_idx" ON "payment_method_codes"("sort_order");

-- Stessa disciplina di ogni altro catalogo di sistema (`vat_natures`):
-- default-deny per la Data API pubblica di Supabase. L'API applicativa si
-- connette come owner e non e' toccata (`regole-sicurezza`).
ALTER TABLE "payment_method_codes" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "payment_method_codes" FROM anon, authenticated;

-- ── 2. Il seed, STRUTTURATO ────────────────────────────────────────────────
--
-- ⛔ Codice ed etichetta sono due colonne, non un nome da cui ricavarli.
--    Fonte: FatturaPA, specifiche tecniche 1.3.1 (Tesoreria §2.2).
INSERT INTO "payment_method_codes" ("code", "label", "sort_order", "updated_at") VALUES
  ('MP01', 'Contanti',                                    1, CURRENT_TIMESTAMP),
  ('MP02', 'Assegno',                                     2, CURRENT_TIMESTAMP),
  ('MP03', 'Assegno circolare',                           3, CURRENT_TIMESTAMP),
  ('MP04', 'Contanti presso Tesoreria',                   4, CURRENT_TIMESTAMP),
  ('MP05', 'Bonifico',                                    5, CURRENT_TIMESTAMP),
  ('MP06', 'Vaglia cambiario',                            6, CURRENT_TIMESTAMP),
  ('MP07', 'Bollettino bancario',                         7, CURRENT_TIMESTAMP),
  ('MP08', 'Carta di pagamento',                          8, CURRENT_TIMESTAMP),
  ('MP09', 'RID',                                         9, CURRENT_TIMESTAMP),
  ('MP10', 'RID utenze',                                 10, CURRENT_TIMESTAMP),
  ('MP11', 'RID veloce',                                 11, CURRENT_TIMESTAMP),
  ('MP12', 'RIBA',                                       12, CURRENT_TIMESTAMP),
  ('MP13', 'MAV',                                        13, CURRENT_TIMESTAMP),
  ('MP14', 'Quietanza erario',                           14, CURRENT_TIMESTAMP),
  ('MP15', 'Giroconto su conti di contabilità speciale', 15, CURRENT_TIMESTAMP),
  ('MP16', 'Domiciliazione bancaria',                    16, CURRENT_TIMESTAMP),
  ('MP17', 'Domiciliazione postale',                     17, CURRENT_TIMESTAMP),
  ('MP18', 'Bollettino di c/c postale',                  18, CURRENT_TIMESTAMP),
  ('MP19', 'SEPA Direct Debit',                          19, CURRENT_TIMESTAMP),
  ('MP20', 'SEPA Direct Debit CORE',                     20, CURRENT_TIMESTAMP),
  ('MP21', 'SEPA Direct Debit B2B',                      21, CURRENT_TIMESTAMP),
  ('MP22', 'Trattenuta su somme già riscosse',           22, CURRENT_TIMESTAMP),
  ('MP23', 'PagoPA',                                     23, CURRENT_TIMESTAMP);

-- ── 3. Il collegamento dal Tipo aziendale ──────────────────────────────────
ALTER TABLE "payment_options" ADD COLUMN "method_code_id" UUID;

CREATE INDEX "payment_options_method_code_id_idx" ON "payment_options"("method_code_id");

-- `RESTRICT` e non `SET NULL`: un codice normativo si DISATTIVA
-- (`is_active = false`), non si cancella lasciando Tipi orfani che il giorno
-- dopo nessuno sa piu' a che modalita' puntavano.
ALTER TABLE "payment_options"
  ADD CONSTRAINT "payment_options_method_code_id_fkey"
  FOREIGN KEY ("method_code_id") REFERENCES "payment_method_codes"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ⛔ Le CONDIZIONI di pagamento non hanno una modalita' normativa, e non
--    devono poterne avere una: «30 gg f.m.» non e' un modo di pagare.
--    Prisma non esprime i CHECK: vive qui, e lo schema lo dichiara a parole.
ALTER TABLE "payment_options"
  ADD CONSTRAINT "payment_options_method_code_only_for_method"
  CHECK ("kind" = 'method' OR "method_code_id" IS NULL);

-- ── 4. Il backfill: due whitelist ESATTE ───────────────────────────────────
--
-- ⛔ Il codice NON si estrae mai dall'etichetta: niente regex, niente
--    suffissi, niente parsing. Una voce rinominata dall'utente in «Bonifico
--    (MP05) - ns. banca» non deve essere interpretata, e con una regex lo
--    sarebbe.
--
-- Due condizioni oltre al nome, entrambe necessarie:
--   · `kind = 'method'` — le condizioni restano fuori per definizione;
--   · `is_system = true` — una voce creata dall'utente non si tocca, anche se
--     per caso si chiama come una di sistema.

-- 4a. Le 23 voci del seed corrente, che portano il codice fra parentesi.
UPDATE "payment_options" po
SET "method_code_id" = pmc."id"
FROM (VALUES
  ('Contanti (MP01)',                                   'MP01'),
  ('Assegno (MP02)',                                    'MP02'),
  ('Assegno circolare (MP03)',                          'MP03'),
  ('Contanti presso Tesoreria (MP04)',                  'MP04'),
  ('Bonifico (MP05)',                                   'MP05'),
  ('Vaglia cambiario (MP06)',                           'MP06'),
  ('Bollettino bancario (MP07)',                        'MP07'),
  ('Carta di pagamento (MP08)',                         'MP08'),
  ('RID (MP09)',                                        'MP09'),
  ('RID utenze (MP10)',                                 'MP10'),
  ('RID veloce (MP11)',                                 'MP11'),
  ('RIBA (MP12)',                                       'MP12'),
  ('MAV (MP13)',                                        'MP13'),
  ('Quietanza erario (MP14)',                           'MP14'),
  ('Giroconto su conti di contabilità speciale (MP15)', 'MP15'),
  ('Domiciliazione bancaria (MP16)',                    'MP16'),
  ('Domiciliazione postale (MP17)',                     'MP17'),
  ('Bollettino di c/c postale (MP18)',                  'MP18'),
  ('SEPA Direct Debit (MP19)',                          'MP19'),
  ('SEPA Direct Debit CORE (MP20)',                     'MP20'),
  ('SEPA Direct Debit B2B (MP21)',                      'MP21'),
  ('Trattenuta su somme già riscosse (MP22)',           'MP22'),
  ('PagoPA (MP23)',                                     'MP23')
) AS mappa("nome", "codice")
JOIN "payment_method_codes" pmc ON pmc."code" = mappa."codice"
WHERE po."name" = mappa."nome"
  AND po."kind" = 'method'
  AND po."is_system" = true
  AND po."method_code_id" IS NULL;

-- 4b. Le voci di un seed PRECEDENTE, che il codice attuale non produce piu'
--     ma che sono quelle realmente usate dagli snapshot (misurato il
--     04/09/2026: i clienti usano «Bonifico bancario»). Cinque su sette.
--
-- ⚠️ `Contrassegno` e `PayPal` restano scollegate DI PROPOSITO:
--    · «Contrassegno» descrive il momento e il canale d'incasso, non dice
--      come il cliente paghera' al corriere — contanti, carta o altro;
--    · «PayPal» non ha una corrispondenza normativa univoca da assumere.
--    Le assegnera' l'utente dalle Impostazioni, se e quando vorra'.
UPDATE "payment_options" po
SET "method_code_id" = pmc."id"
FROM (VALUES
  ('Contanti',           'MP01'),
  ('Assegno',            'MP02'),
  ('Bonifico bancario',  'MP05'),
  ('Carta di pagamento', 'MP08'),
  ('RiBa',               'MP12')
) AS mappa("nome", "codice")
JOIN "payment_method_codes" pmc ON pmc."code" = mappa."codice"
WHERE po."name" = mappa."nome"
  AND po."kind" = 'method'
  AND po."is_system" = true
  AND po."method_code_id" IS NULL;
