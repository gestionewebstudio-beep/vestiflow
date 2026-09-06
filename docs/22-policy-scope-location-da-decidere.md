# 22 · Scope Location — le policy da decidere

**Data:** 28/08/2026
**Stato:** ⏸ **aperto.** Nessuna riga di codice è stata cambiata per preparare questa pagina.

> ⛔ **Nessuna di queste è una vulnerabilità.** Le sei vulnerabilità sono state
> corrette e falsificate: stanno in `21-audit-scope-location-esito.md`, che è
> chiuso. Qui ci sono **domande di prodotto** che il censimento ha fatto emergere
> e che nessuno ha ancora deliberato. Il comportamento corrente è **misurato**, e
> lasciato intatto apposta.

⚠️ **Chi rilegge fra sei mesi non deve scambiarle per lavoro rimasto indietro.**
Finché una riga di questa pagina non è decisa, il codice fa ciò che la colonna
«oggi» dice — e lo fa per scelta.

---

## Come sono divise

|                                              |                                                                                        |
| -------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Parte A — cambiano chi VEDE o chi SCRIVE** | la risposta sposta il confine dell'autorizzazione. Sono le cinque che contano          |
| **Parte B — semantica di prodotto**          | il perimetro non cambia; cambia il significato di un'operazione. Si decidono con calma |

⭐ **La distinzione non è formale.** Una risposta in Parte A cambia cosa un
commesso vede aprendo una schermata; una in Parte B cambia come si chiama una
cosa, o quando la si offre.

---

# Parte A — chi vede, chi scrive

## A1 · Il Registro Corrispettivi è **aziendale** o **per sede**?

**Domanda secca:** un commesso di Napoli, aprendo il Registro, deve vedere
l'incasso di Milano?

**Oggi:** ⛔ **sì, e in modo incoerente con sé stesso.** Misurato:

```text
GET /corrispettivi/locations            riceve l'utente  →  il SELETTORE è filtrato
GET /corrispettivi/orders               no
GET /corrispettivi/summary              no
GET /corrispettivi/export/csv           no
GET /corrispettivi/export/spreadsheet   no
GET /corrispettivi/export/pdf           no
```

⚠️ **Il menu a tendina mostra solo le sedi proprie, i dati dietro no.** È la
stessa forma dei sei difetti corretti — un selettore filtrato sopra dati non
filtrati — con una differenza che la tiene fuori da quell'elenco: **lì la
risposta giusta era ovvia, qui no.**

| Opzione                    | Cosa comporta                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| **A · registro aziendale** | resta com'è. **Un solo totale per periodo**, che è la proprietà che un registro fiscale ha |
| **B · registro per sede**  | righe, riepilogo, filtri, stampa ed export filtrano tutti sull'ambito di chi guarda        |

⛔ **Conseguenza di B, ed è la ragione per cui non è ovvia:** fa esistere **N
totali diversi per lo stesso periodo**. Due persone che stampano lo stesso giorno
ottengono due registri diversi, ed entrambi si chiamano «il registro di agosto».

⛔ **Conseguenza di A:** il commesso di Napoli legge l'incasso di Milano, incluso
il dettaglio riga per riga.

⚠️ **La decisione non è frazionabile.** Filtri, righe, riepilogo, stampa ed
export si muovono insieme, o si ottiene un riepilogo che non torna con le righe
che gli stanno sopra — che è peggio di entrambe le opzioni.

**Raccomandazione tecnica:** ⭐ **se si sceglie B, il criterio non è «filtra le
righe»: è che la stampa DICHIARI il proprio perimetro.** Un registro che porta
«Sedi: Napoli» in testata resta un documento onesto anche se non è quello
aziendale. Senza quella riga, B produce documenti indistinguibili che dicono
numeri diversi.

---

## A2 · Le tre mutazioni sull'Ordine fornitore chiedono **lettura** o **scrittura**?

**Domanda secca:** un manager assegnato alla sola Napoli può **annullare** ed
**eliminare** un ordine fornitore destinato a Milano?

**Oggi: sì.** `cancel`, `delete` e il gate del `PATCH` passano tutti da
`getById`, che applica la politica di **lettura**.

⚠️ **La differenza fra le due politiche è una sola, ed è misurata:**

```text
lettura     onora  inventory.view_all_locations   →  passa
scrittura   NON lo onora                          →  rifiuta
```

⛔ **E `inventory.view_all_locations` è nei default del ruolo MANAGER**
(`tenant-permission.constants.ts`). Non è un permesso raro da supervisore: ce
l'ha ogni manager appena creato.

| Opzione                               | Cosa comporta                                                                |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| **A · resta lettura** _(oggi)_        | chi può vedere l'ordine può annullarlo ed eliminarlo                         |
| **B · scrittura sulle tre mutazioni** | si allinea ai Documenti, che su ogni mutazione usano lettura **+** scrittura |

⚠️ **L'asimmetria coi Documenti è misurata, non decisa.** `documents.service.ts`
chiama `assertDocumentLocationWritable` su ogni mutazione; gli Ordini fornitore
no. Nessuno dei due comportamenti è stato scelto guardando l'altro.

**Conseguenza di B:** un manager con `view_all_locations` smetterebbe di poter
annullare ordini di sedi non sue. **È esattamente il punto della domanda**:
bisogna sapere se quel manager esiste ed è voluto, perché se esiste, B gli toglie
qualcosa che oggi fa.

**Raccomandazione tecnica:** ⭐ **B, ma non «perché scrivere è più severo».** La
ragione è che **eliminare un ordine è irreversibile e leggerlo non lo è**: la
politica che governa un `DELETE` non dovrebbe essere la stessa che governa un
`GET`. Se si sceglie A, va scritto qui perché — e «così un supervisore multi-sede
può ripulire» è una ragione valida, purché sia detta.

---

## A3 · Un record **senza Location** è leggibile da chiunque?

**Domanda secca:** un ordine cliente che non ha sede è visibile a tutti quelli
che hanno il permesso di modulo?

**Oggi: sì**, ed è il contratto **dichiarato** del predicato:
`if (!user || !locationId) return;` — niente sede, niente da confrontare, passa.

⚠️ **Non è un caso di bordo raro.** Quattro entità di business hanno la sede
annullabile nello schema:

```text
SalesOrder.locationId       String?
Document.locationId         String?
OnlineSale.locationId       String?
OnlineSaleLine.locationId   String?
```

| Opzione                                         | Cosa comporta                                                                           |
| ----------------------------------------------- | --------------------------------------------------------------------------------------- |
| **A · passa** _(oggi)_                          | un record senza sede non appartiene a nessuna sede, quindi non c'è nessuno da escludere |
| **B · solo per chi ha accesso a tutte le sedi** | «senza sede» diventa «di tutte le sedi», e lo vede solo chi le ha tutte                 |

⛔ **Il rischio di A non è teorico: è che diventi una via d'uscita.** Un record
creato senza sede — per errore, per import, per una maschera che non la chiede —
è leggibile da tutti, e nessuno se ne accorge, perché non c'è niente da vedere
che segnali l'anomalia.

⛔ **Il rischio di B** è che nasconda dati legittimi a chi ci deve lavorare, e che
il rimedio («assegnagli una sede») non sia sempre possibile.

**Raccomandazione tecnica:** ⭐ **prima della policy, misurare quanti record senza
sede esistono davvero e come sono nati.** Se sono zero, A e B coincidono oggi e
la scelta costa nulla; se sono molti, la domanda vera non è la policy — è perché
una sede non è stata assegnata.

⚠️ **Questa misura richiede il database e NON è stata fatta**: nessun accesso al
database condiviso. Non è una svista: è il vincolo con cui si sta lavorando.

---

## A4 · L'anagrafica sedi: «sapere che esiste» o «poterla usare»?

**Domanda secca:** chi ha il permesso di sezione Magazzino deve poter leggere
**indirizzo completo e stato Shopify** di ogni sede del tenant, comprese quelle
in cui non opera?

**Oggi: sì.** `GET /inventory/locations` non riceve l'utente e restituisce
l'intero record. Non è solo il nome:

```text
name · code · isActive · storeId
addressLine1 · addressLine2 · city · province · postalCode · countryCode
shopifyLocationId · shopifySyncStatus · shopifyLastSyncAt · shopifyLastError
```

| Opzione                      | Cosa comporta                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| **A · resta tutto** _(oggi)_ | alimenta molte tendine, ed è la strada più semplice                                  |
| **B · filtrata sull'ambito** | si vedono solo le proprie sedi                                                       |
| **C · due forme**            | un elenco **minimo** (id, nome) per chiunque, e il record **pieno** solo sull'ambito |

⚠️ **B ha una conseguenza che va cercata prima, non dopo:** questa rotta alimenta
le tendine di altre schermate. Filtrarla può svuotare un selettore che oggi
funziona — per esempio la destinazione di un trasferimento (A5), che è
deliberatamente aperta.

**Raccomandazione tecnica:** ⭐ **C.** «Conoscere che una sede esiste» e «leggere
dove si trova e com'è messa la sua sync» sono due domande diverse, e oggi una
sola risposta le serve entrambe. La forma minima non rompe nessuna tendina; il
record pieno smette di uscire da un elenco.

---

## A5 · La destinazione di un trasferimento è **esente**: è voluto?

**Domanda secca:** un operatore assegnato alla sola Napoli può spedire merce a
Milano, dove non opera?

**Oggi: sì, sempre.** `assertLocationInUserScope` esce senza controllare quando
`purpose === 'transferDestination'`, e questo vale in quattro punti — documenti,
trasferimenti, e due rotte di inventario.

| Opzione                                   | Cosa comporta                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------------- |
| **A · esenzione voluta** _(oggi)_         | spedire a un magazzino è un'operazione normale: non ci si opera, ci si manda merce |
| **B · anche la destinazione nell'ambito** | si trasferisce solo fra sedi proprie                                               |

⭐ **A è quasi certamente la risposta giusta, e va scritta proprio per questo:**
un'esenzione che nessun documento dichiara sembra una dimenticanza al primo che
la trova, e prima o poi qualcuno la «corregge».

⚠️ **Ma va delimitata.** L'esenzione autorizza a **spedire verso** una sede, non
a **leggerne** la giacenza. Se la maschera di trasferimento mostra la
disponibilità della destinazione, l'esenzione sta concedendo anche una lettura —
e quella non è stata decisa qui.

**Raccomandazione tecnica:** dichiarare A, e **verificare separatamente cosa la
maschera di trasferimento mostra della destinazione.** Quella verifica non è
stata fatta.

---

# Parte B — semantica di prodotto

Il perimetro di chi vede cosa non cambia. Si decidono con calma.

| #   | Domanda                                                                                | Oggi                                                                                     | Nota                                                                                   |
| --- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| B1  | **Anteprima import** — politica di lettura o di scrittura?                             | **lettura**, ed è il pavimento documentato (`T15` §12: «sola lettura»)                   | l'oracolo di giacenza è già chiuso. Alzarla a scrittura è più severo, non più corretto |
| B2  | **Numeratori e anteprima numerazione** — vanno partizionati per sede?                  | no: il numeratore è `tenant + tipo + serie`. La sede filtra **quali serie** sono usabili | partizionare il progressivo cambia la numerazione fiscale, non l'autorizzazione        |
| B3  | **Sync inventario Shopify** — il perimetro sono le sedi mappate o quelle di chi avvia? | le **mappate**: è un processo di tenant                                                  | scoparlo su chi lo avvia renderebbe la sync dipendente da chi preme il pulsante        |

⭐ **B2 e B3 sembrano domande di sicurezza e non lo sono**, ed è il motivo per cui
stanno qui: in entrambe la Location non è il confine dell'autorizzazione, è un
attributo del dominio. Trattarle come le altre porterebbe a «correggere» cose che
funzionano.

---

## Cosa NON è in questa pagina

⛔ **Le sei vulnerabilità.** Corrette, falsificate, chiuse in `21`.

⛔ **La guardia architetturale.** `scripts/check-location-scope.mjs` sta in
`npm run lint` e non dipende da nessuna di queste decisioni.

⚠️ **Un consumer frontend corretto il 28/08/2026, e non è una policy:** la
Vendita al banco convertiva in silenzio l'errore dell'API in «nessun risultato»
(`catchError(() => of(null))` in `readVariant`). Da quando la ricerca articolo
verifica la sede, quel ramo può ricevere un **403 vero** — e lo faceva sparire.
Ora l'errore arriva a `searchMessage`, il contratto che quella maschera già usa,
e sei prove lo tengono fermo.
