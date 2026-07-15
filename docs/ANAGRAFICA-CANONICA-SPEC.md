# Anagrafica canonica e ruoli cliente/fornitore

Specifica di riferimento del modello anagrafico VestiFlow (logica Danea).
Introdotta con la migrazione `20260715120000_party_canonical_anagraphics`.

## Principio

VestiFlow distingue il **soggetto anagrafico** dai **ruoli commerciali** che
esso ricopre. La stessa persona o azienda può essere solo cliente, solo
fornitore, o entrambi — **senza mai duplicare l'anagrafica**.

- I dati **anagrafici, fiscali, di contatto e gli indirizzi** appartengono al
  soggetto (`parties`) e sono conservati **una sola volta**.
- I dati **commerciali** appartengono al singolo ruolo (`customers`,
  `suppliers`).

## Modello dati

### `parties` — soggetto canonico

`companyName`, `firstName`, `lastName`, `vatNumber`, `taxCode`, `email`,
`pec`, `phone`, `website`, `contactName`, indirizzo completo, `notes`.

Denominazione minima: **ragione sociale oppure nome e cognome** (validata in
form e in API).

### `customers` / `suppliers` — ruoli

Tabelle di ruolo agganciate 1:1 al soggetto (`partyId` univoco). Gli **id dei
ruoli non sono cambiati** con la migrazione: documenti, ordini e storico
continuano a puntare alle stesse righe.

Dati del ruolo **cliente**: `code` (progressivo, univoco per tenant, come il
codice fornitore), `customerDiscount` (a cascata, es. `10+5+4`),
`paymentMethod` + `paymentTerms`, `transportResponsible`,
`documentCreationAlert` ("Mostra avviso"), `documentCreationNote`
("Inserisci nota"), `commercialNotes`, `shopifyCustomerId` (mapping canale di
vendita), `isActive`.

Dati del ruolo **fornitore** (trattato in modo simmetrico): `code`,
`supplierDiscount`, `paymentMethod` + `paymentTerms`, `defaultVatCodeId`,
`transportResponsible`, `freightTerms`, `documentCreationAlert`,
`documentCreationNote`, `isActive`.

Il contratto HTTP resta "piatto": le API espongono i campi del soggetto
appiattiti nella risposta di ciascun ruolo, più `linkedSupplierId` /
`linkedCustomerId` e `linkedSupplierActive` / `linkedCustomerActive` per lo
stato del ruolo gemello.

## Spunta "È anche fornitore" / "È anche cliente"

- **Attivazione**: aggiunge (o riattiva) il secondo ruolo **sullo stesso
  soggetto**. Nessun dato viene copiato: i dati comuni restano condivisi;
  al nuovo ruolo viene assegnato solo il codice progressivo.
- **Disattivazione**: imposta `isActive=false` sul ruolo. Il ruolo è escluso
  dai **nuovi utilizzi** (select ordini/arrivi merce, picker documenti con
  `?active=true`), ma **nessun dato, documento o collegamento storico viene
  eliminato**. Ricontrassegnando la spunta il ruolo esistente si riattiva.
- L'eliminazione di un ruolo fornitore (consentita solo se mai usato in
  ordini/documenti) elimina anche il soggetto solo se privo di altri ruoli.

## Pagamenti (Impostazioni → Pagamenti)

Modalità e condizioni di pagamento sono **due elenchi separati** (logica
Danea), preimpostati al primo accesso del tenant e gestibili (aggiunta,
rinomina, disattivazione, eliminazione):

- Modalità: Contanti, Bonifico bancario, Carta di pagamento, Assegno, RiBa,
  Contrassegno, PayPal.
- Condizioni: Vista fattura, 30 gg d.f., 30 gg f.m., 60 gg d.f., 60 gg f.m.,
  90 gg d.f., Pagamento anticipato.

Le anagrafiche salvano il **nome** della voce (snapshot): rinominare o
eliminare una voce non riscrive i ruoli già salvati; la voce resta visibile
nel form come "(personalizzato)" finché non viene cambiata.

## "Mostra avviso" e "Inserisci nota" in creazione documenti

Configurabili su entrambi i ruoli, applicati nei form documento:

| Form                                        | Avviso (banner) | Nota (auto-inserita nelle note)                |
| ------------------------------------------- | --------------- | ---------------------------------------------- |
| Arrivo merce                                | fornitore       | fornitore                                      |
| Registrazione fattura fornitore             | fornitore       | fornitore                                      |
| Ordine fornitore                            | fornitore       | — (l'ordine non ha campo note)                 |
| Documenti di vendita (DDT/proforma/vendita) | cliente         | cliente (dopo l'eventuale disclaimer proforma) |

La nota auto-inserita non sovrascrive mai testo digitato dall'operatore e non
viene applicata in modifica di documenti esistenti.

## Clienti Shopify

L'anagrafica dei clienti ecommerce resta **owned da Shopify**: il sync
aggiorna i campi del soggetto (nome, contatti, indirizzo, note) e il ruolo
conserva il mapping `shopifyCustomerId`. I campi fiscali (ragione sociale,
P.IVA, CF, PEC) e i dati commerciali del ruolo restano modificabili nel
gestionale.

## Migrazione e sicurezza dati

- Le coppie già collegate (`linked_supplier_id`) sono confluite in un unico
  soggetto; i campi mancanti dell'una sono stati integrati dall'altra.
- Tutti i clienti esistenti hanno ricevuto un codice progressivo (`0001`…).
- Il vecchio `document_creation_note` fornitore (semantica avviso) è stato
  rinominato in `document_creation_alert`.
- Copie integrali pre-migrazione in `_backup_customers_pre_party` e
  `_backup_suppliers_pre_party` (eliminabili una volta verificato l'esito).
- Backup tenant e cancellazione tenant includono `parties` e
  `payment_options`.

## Decisioni rimandate (esplicite)

- **Listini** ("Da valutare" nel prompt): non implementati. Richiedono campi
  prezzo per listino sull'anagrafica articolo (oggi Shopify-ready) e la
  scelta del listino in testata dei documenti di uscita. Da progettare a
  parte.
- **Agente**: non gestito in VestiFlow → non implementato, come richiesto.
