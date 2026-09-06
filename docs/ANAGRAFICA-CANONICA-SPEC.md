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
`pec`, `sdiCode`, `phone`, `mobilePhone`, `iban`, `website`, `contactName`,
indirizzo completo, `notes`.

⚠️ **`iban` e `mobilePhone` stanno sul SOGGETTO, non sul ruolo**, e la conseguenza si vede
in due schede: chi è cliente e fornitore ha **un conto solo**, e lo si aggiorna
indifferentemente dall'una o dall'altra. È il conto della persona giuridica, non un patto
commerciale — quello è `ourBankName`, che infatti sta sul ruolo fornitore.

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

## ⭐ Perché un soggetto ha DUE ruoli — deciso il 01/09/2026

> _Proprietario: «quello che dovrebbe cambiare rispetto ai fornitori o clienti che non sono
> entrambe le cose è che posso poter trattare un fornitore da cliente e da fornitore e
> viceversa. Quindi registrare fatture di un fornitore ma poter vendergli merce e quindi mi
> compare nei documenti di vendita. Questo è il senso.»_

⭐ **Il doppio ruolo non è un espediente tecnico: è il caso d'uso.** Alla stessa azienda si
registrano le fatture d'acquisto **e** le si vende merce. Con i due ruoli attivi il soggetto
compare in **entrambe** le famiglie di tendine — acquisti e vendite — con un'anagrafica sola.

⚠️ **Attivare il secondo ruolo CREA una riga** (`allocateNextSupplierCode` /
`allocateNextCustomerCode`): non è un interruttore su una riga esistente, è una scheda in più
nel rispettivo elenco, con codice progressivo proprio. È corretto — i dati commerciali dei
due ruoli sono diversi — ma va saputo: dopo la spunta, l'elenco fornitori ha una voce in più.

**Verificato sul database il 01/09/2026**, con un soggetto di prova a due ruoli:

```text
entrambi attivi         tendina fornitori 1 · tendina clienti 1 · elenco fornitori 1
fornitore disattivato   tendina fornitori 0 · tendina clienti 1 · elenco fornitori 1
cliente disattivato     tendina fornitori 1 · tendina clienti 0 · elenco fornitori 1
```

⭐ **I due stati sono indipendenti**: spegnere un ruolo non tocca l'altro, e in nessun caso
la riga sparisce dal proprio elenco.

## ⭐ Il comando «Attivo» sulla scheda — aggiunto il 01/09/2026

⛔ **Fino a oggi `isActive` del ruolo fornitore non si poteva cambiare da nessuna parte.**
Cercato in tutta l'API: l'unico scrittore era `setSupplierRoleTx`, cioè la spunta «È anche
fornitore» **sulla scheda cliente**. Per un fornitore che non fosse anche cliente non
esisteva alcun percorso — nasceva attivo e restava attivo per sempre, mentre la colonna
«Stato ruolo» dell'elenco mostrava uno stato che quella pagina non governava.

⭐ **Ora la maschera fornitore ha la spunta «Attivo»**, accanto a «È anche cliente»: i due
sono entrambi interruttori di ruolo e si leggono insieme. Il proprietario ha scelto questa
strada fra le due possibili — l'altra era togliere la colonna dall'elenco.

⚠️ **Governano ruoli diversi, e la distinzione va tenuta**: «Attivo» è lo stato di **questo**
ruolo; «È anche cliente» accende o spegne il ruolo **gemello**. Sono due interruttori, non
uno doppio.

✅ **E dal 01/09/2026 ce l'ha anche il CLIENTE**, col rifacimento di quell'anagrafica.

⚠️ **Il buco era lo stesso, ma la diagnosi cambia di poco**: `Customer.isActive` esisteva
nel database e usciva già nella vista API (quindi la colonna «Stato» dell'elenco lo
mostrava), e `listAll` lo filtrava per le tendine dei documenti — **ma nessun payload di
scrittura lo portava**. Il campo si poteva leggere e non scrivere, esattamente come sul
fornitore.

⭐ **Sono state chiuse tutte e tre le tappe**: `CreateCustomerDto.isActive`, l'assegnazione
in `normalizeRoleWrite` (fuori dall'aiuto che normalizza le stringhe: su un booleano
`false` è un valore, non un vuoto) e la spunta nella maschera.

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
