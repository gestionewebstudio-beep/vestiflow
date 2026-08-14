# 06 · Note di merge — famiglia Fattura

**Data:** 14/08/2026
**Destinatario:** chi riprende `feature/fattura-elettronica` (o Claude Code al momento del merge)
**Stato del documento:** piano, non consuntivo. Ogni voce porta il proprio stato. Nessuna voce va letta come già fatta se non lo dice.

Fonte di verità del modello: `docs/07-specifica-famiglia-fattura.md` (deciso 14/08, da implementare).

---

## 1 · Cosa cambierà in `develop`

La famiglia Fattura sarà riorganizzata secondo la specifica 07: un registro, una numerazione continua, tre tipi (Fattura, Accompagnatoria, Nota di credito), percorsi separati per tipo, menù a tendina sul pulsante «Nuovo».

**Stato: deciso 14/08, non iniziato.**

## 2 · Enum `credit_note`

**Stato oggi, misurato sul database condiviso il 14/08:** il tipo `credit_note` **non esiste**. Zero occorrenze in `schema.prisma`; l'enum `DocumentType` in Postgres ha 19 valori e non lo comprende. `_prisma_migrations` ha 116 righe e nessuna per `20260807020000`.

**Cosa va fatto:** portare `20260807020000_credit_note_document_type` da `feature/fattura-elettronica` in `develop`, **identica** — stessa cartella, stesso contenuto, nessuna riscrittura.

**Perché identica, e non per la ragione che sembra:** non è che Prisma la vedrà come già applicata — non lo è, e `migrate deploy` la applicherà. Il motivo è il **checksum**: Prisma memorizza un hash per nome di migration, e lo stesso nome con contenuto diverso fa fallire `deploy` su chiunque l'abbia già applicata. Quindi il nome non basta: il contenuto va lasciato intatto.

## 3 · Indice unico `documents_number_unique`

**Stato oggi, misurato:** il `CASE` dell'indice conosce solo `invoice_accompanying`. Non comprende `credit_note`.

**Cosa va fatto:** ricostruirlo. Nessun dato viene toccato, ma non è innocua: il `CREATE UNIQUE INDEX` fallisce se esistono una Fattura e una Nota di credito con lo stesso numero. **La verifica va rifatta nel momento in cui si applica** — quella di oggi non vale domani.

**Regola che resta, ed è la parte che conta più dell'indice:** il `CASE` dell'indice e `documentNumberingType` (`document-type.util.ts`) sono due facce dello stesso patto, in due linguaggi diversi. Chi aggiungerà un quinto tipo al numeratore deve toccare entrambi, e **nessun test se ne accorge** (cfr. `GUARDIE-MANCANTI.md`, voce 12). Senza questa regola scritta, il difetto che l'indice chiude oggi torna al prossimo tipo.

## 4 · I quattro punti che vanno decisi insieme

Questi non sono avvisi: sono le decisioni per cui serve la conversazione fra i due rami. Tutti già misurati nei documenti esistenti.

**4.1 · Il `<Numero>` verso lo SdI** (`04-…§11`)
Oggi `document.reference` intero finisce in `<Numero>`: l'Agenzia registra `FT-0019` invece di `19`. Sul ramo fattura elettronica esiste un test che fissa quel comportamento (`FT-2026-A-00042`), quindi è una scelta consolidata, non una svista. Il §11 dice che si decide in due, non da una parte sola.

**4.2 · `sales-document-form`** (`§2.4`)
+846 righe da `develop`, +180 dal ramo fattura elettronica, sullo stesso template. È il conflitto testuale più grosso, e sta interamente dentro la famiglia Fattura. Va deciso chi riparte da chi, prima di aprire l'editor.

**4.3 · Due funzioni gemelle** (`§2.2`)
`documentNumberingTypes` e `documentNumberingTypeSet` fanno la stessa cosa in `document-type.util.ts`, una per ramo. Il merge deve sceglierne una, non conservarle entrambe.

**4.4 · La rotta di modifica non porta il tipo** (`03-…§4.11`)
Il ramo fattura elettronica allarga il difetto, aggiungendo la Nota di credito come quarto tipo senza rotta di modifica propria. Le due strade sono già misurate nel §4.11. In `develop` la scelta è per il tipo dichiarato nel percorso (specifica 07 §4): il ramo va allineato.

## 5 · Cosa adattare, non ricostruire

Se sul ramo la Nota di credito era trattata come documento separato — entità, elenco, numerazione o rotta propria — quel lavoro va ricondotto al registro unico. La specifica 07 è la fonte di verità del modello, non questo documento.

## 6 · Trappola nota sulla testata

`available()` restituisce **zero contatori** per `invoice_accompanying` — misurato sul database il 14/08. Non è un caso limite: quel tipo è escluso dai numeratori configurabili per costruzione, perché condivide il numeratore della Fattura. Chi lavora sulla testata della famiglia ci sbatte contro subito. La correzione passa da `documentNumberingType`.

## 7 · Regola operativa sul database

**Verificato il 14/08:** il database Supabase è unico e condiviso, e conteneva 74 tabelle contro 64 modelli in `schema.prisma`. Nove tabelle esistono nel database e non nello schema di questo ramo (anagrafica azienda, cassa, dispositivi fiscali, documenti fiscali, terminali, pagamenti negozio, due tabelle di backup).

**Conseguenza operativa: nessuna migration va generata automaticamente.** Un diff dallo schema proporrebbe di cancellare quelle nove tabelle, incluso lavoro in corso di un altro sviluppatore. Le migration si scrivono a mano.
