# 27 — La prima connessione Shopify: il percorso, com'è costruito

Mandato del proprietario dell'11/09/2026 sera: _«completare il percorso della prima
connessione Shopify, non soltanto B7 … per blocchi interni fino alla consegna
funzionante»_, **definito nella forma finale il 12/09/2026** (§0). Le decisioni di
contesto stanno in `docs/24` §12.-1 (i tre momenti, la quarta fase, le cinque risposte) e
nel quadro funzionale §1–§3: **qui c'è come è realizzato**, e le decisioni del 12/09 che
le completano.

## 0. La partenza come l'ha definita il proprietario — 12/09/2026

> **La fase iniziale è gestita da noi operatori VestiFlow, con il titolare, in una
> finestra operativa controllata.** Il programma non spegne Shopify e non presenta la
> conferma umana come prova tecnica dell'assenza di movimenti.

| Il percorso                         | Chi       | Che cosa                                                                                                                                                                                                    |
| ----------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 · direzione iniziale              | operatore | Shopify → VestiFlow oppure VestiFlow → Shopify                                                                                                                                                              |
| 2 · sedi                            | operatore | collegamento **esplicito** di ogni location: collega, crea, lascia                                                                                                                                          |
| 3 · anteprima e conferma            | operatore | lettura di controllo di articoli, quantità e ordini aperti; poi la conferma                                                                                                                                 |
| — trasferimento, esiti, attivazione | operatore | seguono la conferma della fase 3: il trasferimento, la lettura degli esiti, la **conferma dell'attivazione** (⛔ non è una «fase 4»: le fasi visibili sono tre — precisazione del proprietario, 13/09/2026) |
| la finestra                         | titolare  | sulle sedi interessate **nessuna vendita, evasione, reso o movimento** che cambi le quantità, finché l'attivazione non è confermata                                                                         |

- **Prima della conferma del trasferimento** sono consentiti solo salvataggio delle scelte,
  configurazione e letture di controllo. **La sincronizzazione continua parte solo dopo la
  conferma finale di attivazione.**
- **Ordini iniziali: nessuno storico.** Non si importano ordini se non è necessario; niente
  `pullOrders` completo durante la partenza. Gli ordini **ancora aperti** possono produrre
  effetti di magazzino dopo l'attivazione: si mostrano agli operatori nell'anteprima e si
  acquisiscono all'attivazione **come impegni** (giacenza invariata). Quelli senza sede
  collegata o evasi in parte restano senza impegno e **segnalati** (§4).
- **Attivazione parziale**: si attivano solo le parti correttamente preparate; le irrisolte
  restano escluse e indicate. **La ripresa** dopo un'interruzione non duplica e non assume
  che una base precedente sia ancora valida (§3).
- **La direzione iniziale non determina le regole successive**: dopo l'attivazione valgono
  le regole per campo (`docs/24` §9.2) e per le quantità (§8.11, §31 di `DA-FARE`).
- **Sincronizzazione continua**: gli ordini successivi e il recupero dopo interruzioni sono
  suoi (§5). **Il pulsante «Allinea giacenze» resta separato**: non ripete la prima
  connessione, anche se l'attivazione ne usa il motore.

⛔ **Niente regole basate sull'uguaglianza dei totali o su orari locali.** Tre tentativi
precedenti — confine temporale per coppia (`baselineReadAt`), confronto dei totali
(`on_hand`/`committed` contro giacenza/impegni), e prima ancora il confronto `committed`
(`DA-FARE` §31 prova 38) — sono caduti sui controesempi del proprietario, riprodotti sui
servizi veri in `prima-connessione-controesempi.integration-spec.ts` (3 verdi): impegno
locale e ordine online non acquisito si compensano; V→S evaso prima dell'acquisizione passa
con 0 = 0 e giacenza non aggiornata; base rifatta più acquisizione tardiva = contato due
volte. Quella prova resta come guardia sulle semantiche del ciclo ordini.

## 1. Le fasi visibili, e dove stanno

Tutto in **Impostazioni → Shopify**, sezione «Prima connessione», che compare a negozio
collegato finché il percorso non è attivato; la sezione **Sincronizzazione** resta chiusa
finché il percorso non è attivato. Le tre fasi sono visibili insieme, con quella corrente
aperta; trasferimento, esito e attivazione seguono la conferma.

| Fase                     | Stato (`ShopifySetup.status`)                 | Che cosa fa                                                                                           |
| ------------------------ | --------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1 · Scelte               | `scelte`                                      | la direzione: Shopify → VestiFlow o VestiFlow → Shopify                                               |
| 2 · Sedi                 | `sedi`                                        | per ogni location Shopify: collega / crea / lascia                                                    |
| 3 · Controllo e conferma | `controllo`                                   | l'anteprima (articoli, sedi, quantità, **ordini aperti**), la conferma                                |
| — trasferimento          | `trasferimento` · `interrotto` · `trasferito` | catalogo, quantità, esito con esclusi                                                                 |
| — attivazione            | `attivato`                                    | ordini aperti → impegni, base per coppia, esclusioni, webhook; poi la **Situazione attuale** (§4-bis) |

Si torna alla 1 o alla 2 finché non si conferma; dopo la conferma si può solo riprendere
(`interrotto` → `trasferimento`) o attivare.

⭐ **Le «Variazioni previste» dell'anteprima stanno sul motore comune** (`docs/26`, come A3 e
A26): righe articolo × sede con Attuale e Prevista, ordinabili, card sotto `lg`; colonne
risolte nel componente (è dumb, come `product-stock-table`), **senza riga totali** — l'anteprima
porta al più 200 righe su `righeTotali`, e la somma delle righe rese sarebbe il totale della
vista. La tabella delle sedi è una **maschera** (una tendina per location); gli elenchi dentro
`details` sono le anomalie **previste** dall'anteprima, prima della conferma (dichiarati in
`check:elenchi-fuori-motore`). ⛔ **Qui c'era «anomalie nominate e avvisi» anche per ciò che si
legge DOPO l'attivazione**, e non reggeva: con 84 voci era un elenco operativo, non un avviso
(collaudo del 13/09/2026, `docs/26` prescrive il motore per gli elenchi consultabili). I
problemi aperti stanno sul motore comune, in §4-bis.

⭐ **Conclusa, la prima connessione è uno STORICO richiudibile** (13/09/2026): chiuso di serie,
col sommario in una riga («Conclusa il … · catalogo 55 importati · quantità 25 scritte su 82 ·
ordini 4 acquisiti · allineamento fermo»); dentro, le tre fasi com'erano, l'anteprima dichiarata
«storico di allora», l'esito **datato** («Esito dell'ultimo tentativo · 13/09/2026, 02:59») e il
fermo in **una riga** con «Vedi problemi». I comandi quotidiani non stanno più sotto tre fasi e
un'anteprima di allora, e la «Situazione attuale» sta **in cima alla pagina**.

## 2. Il modello

```text
shopify_setups              UNA riga per tenant: direzione, stato, date, anteprima (JSON),
                            esito (JSON), ultimo id ordine all'attivazione (`orders_since_id`)
shopify_location_choices    UNA riga per (tenant, location Shopify): collega | crea | lascia,
                            con la sede VestiFlow scelta; sopravvive al percorso
```

⭐ **Collega e crea scrivono anche coppia e periodo** (`shopify_location_pairs` /
`shopify_location_links`, B7): la scelta di una persona È il collegamento esplicito di
`docs/24` §1.13.1. «Lascia» non scrive niente sulle sedi. La **sede di un ordine** si
risolve dalla coppia attiva (o dalla colonna-cache per le connessioni nate prima), **mai per
nome, mai la prima in ordine alfabetico** (tolto il 12/09: `resolveShopifyOrderLocationId`).

⭐ **La scelta vale anche FUORI dal percorso** (12/09/2026): la stessa tabella
(`app-shopify-location-choices`) sta nella sezione Sedi di Impostazioni → Shopify per le
connessioni nate prima e per ogni **disconnessione + riconnessione**. «Disconnetti» azzera la
colonna-cache ma **non chiude il periodo** (disconnettere sospende): alla riconnessione allo
stesso negozio il sync riconosce la sede **dalla coppia attiva** e rimette la cache. **«Lascia»
su una location collegata chiude il periodo** (`unlinked` / `operator`) e azzera la cache: da
lì gli ordini di quella location non hanno sede finché una persona non la ricollega — e
«collega» apre un periodo nuovo sulla stessa coppia (la storia resta). ⛔ Cambiare la sede di
una location collegata non è rappresentabile (la coppia è l'identità): prima «lascia», poi
«collega». Prove: `prima-connessione-percorso` caso 6, `shopify-location-sync.service.spec` (+1).

⚠️ **Nessuna riga = percorso mai iniziato.** La riga nasce nel callback OAuth **nella
stessa transazione** della connessione, solo se il tenant non aveva né negozio né articoli
collegati; per quella connessione non partono sedi automatiche né webhook (`?shopify=setup`).
Le connessioni nate prima non vengono spinte nel percorso: tutto resta com'era.

## 3. Il trasferimento — riuso, non riscrittura

| Passo    | Shopify → VestiFlow                                                                                                                                                                                                                                                             | VestiFlow → Shopify                                                              |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| catalogo | `pullCatalog` con l'elenco degli **esclusi** (gli ambigui di §4); idempotente per GID                                                                                                                                                                                           | `pushProduct` per articolo locale senza remoto; idempotente per identità         |
| quantità | **base iniziale**: per ogni coppia (variante collegata × sede collegata) si legge `on_hand` e si scrive la giacenza con un movimento di rettifica `origin: shopify`, origine `canale` (nessun rinvio al canale), causale «Prima connessione Shopify», `external_ref` per coppia | il motore di **Allinea** su tutto il perimetro, a blocchi, con le sue protezioni |
| ordini   | nessuno (§5)                                                                                                                                                                                                                                                                    | nessuno (§5)                                                                     |

⛔ **Un solo trasferimento per tenant alla volta** (single-flight in memoria); l'avanzamento
sta nell'esito JSON, aggiornato a ogni passo; un'eccezione non gestita → `interrotto`, con
l'esito parziale — **mai «completato»**.

⭐ **La ripresa RILEGGE ogni coppia e scrive solo la differenza**: zero se niente è
cambiato (nessun doppione), un movimento tracciato se il negozio si è mosso nel frattempo.
Non assume che la base precedente sia ancora valida. Il catalogo non si reimporta
(`updated`, non `imported`). Provato: caso 4 di `prima-connessione-percorso`.

## 4. Gli esclusi e le anomalie — nominati, mai risolti di nascosto

| Caso                                                                        | Che cosa succede                                                                             | Come si recupera                                                 |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| stesso SKU dalle due parti, senza collegamento                              | l'articolo non si importa / non si pubblica; sta in `esito.esclusi` con motivo `sku_ambiguo` | il collegamento manuale (altra modalità, non in questo percorso) |
| import di un prodotto fallito                                               | `failed` di `pullCatalog` → `esito.esclusi`                                                  | correggere e riprendere                                          |
| push fallito                                                                | `esito.esclusi`, `shopifySyncEnabled = false` sull'articolo all'attivazione                  | riaccendere l'interruttore dalla scheda articolo                 |
| quantità non determinabile (sede non stoccata, articolo assente sul canale) | la coppia non riceve base, sta in `esito.esclusi`                                            | Allinea, o correzione su Shopify                                 |
| location Shopify senza scelta                                               | blocca la fase 3 finché non è decisa                                                         | scegliere                                                        |
| ordine aperto **senza sede collegata**                                      | nessun impegno; `requiresReview` con `ORDINE_SENZA_SEDE_MOTIVO`; nell'anteprima è nominato   | collegare la location in «Sedi» e ripetere l'acquisizione        |
| ordine aperto **evaso in parte**                                            | nessun impegno; `requiresReview` (evasione parziale non gestita)                             | verifica a mano dopo l'attivazione                               |
| coppia **non allineata** all'attivazione (base non stabilita)               | `esito.esclusi` con il motivo di Allinea                                                     | «Allinea giacenze» dopo aver risolto la causa                    |

⭐ **Nessun caso irrisolto si dichiara pronto** (12/09/2026): `ShopifySetupDto.irrisolti`
(`shopify-setup-irrisolti.util`) unisce gli esclusi del trasferimento e gli ordini che non
diventano impegni, con tipo, nome e motivo; il pannello li mostra **aperti davanti al pulsante**
— «L'attivazione riguarda solo le parti preparate: N casi restano esclusi» — e dopo
l'attivazione il badge li conta («Attivata · N casi esclusi»). Solo con l'elenco vuoto si legge
«Nessun caso escluso». La parola «pronto» non compare. Prove: util 5, pannello +3, percorso caso 7,
`e2e/prima-connessione` (scatti in `test-results/prima-connessione/`).

## 4-bis. La SITUAZIONE ATTUALE — ciò che è aperto adesso, con causa e azione _(13/09/2026)_

> **Capire subito che cosa funziona, che cosa è fermo, perché, e quale azione è possibile —
> senza rileggere decine di righe o ripetere la prima connessione.** _(proprietario)_

⛔ **Il difetto misurato sul collaudo.** La pagina diceva «84 casi da risolvere a mano»: erano
**82 esclusi persistiti** nell'esito (7 `sede_non_stoccata` + **75 `errore_di_lettura`**, cioè
il difetto GID già corretto) più 2 ordini dall'**anteprima** — fotografie mai rivalutate
(`esito.esclusi` si accumula fra trasferimento e attivazione). I due ordini dicevano «collega la
location» perché il `reviewReason` era stato scritto prima e gli «irrisolti» venivano dal flag
`sedeDeterminabile` dell'anteprima: nessuno dei due conosceva la causa di oggi (il permesso).
Intanto lo stato per coppia diceva **75 coppie senza base, 0 con base** — lo stato attuale
esisteva e nessuno lo leggeva.

### Che cosa è, e che cosa non è

| È                                                                                                      | Non è                                                                         |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `ShopifySetupDto.situazione` — calcolata **a ogni lettura** dello stato, da dati letti ora             | l'esito dell'ultimo tentativo (`esito`), che resta una fotografia con la data |
| ogni problema con **causa**, **conseguenza**, **azione** (o «nessuna», con il perché) e **rilevatoAt** | una lista di codici (`sede_non_stoccata`) da decifrare                        |
| letta **senza effetti**: nessun allineamento né correzione parte dall'apertura della pagina            | un comando: le azioni riusano i comandi esistenti e le loro protezioni        |

### Le fonti, e come si distingue «attuale» da «fotografia»

| Problema                 | Da dove si legge ADESSO                                                                                                                        | `rilevatoAt`                     |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| ordine senza sede        | `ordiniApertiSenzaSede` (marcatore sul `reviewReason`); la **causa** dal motivo scritto sull'ordine                                            | l'ultima valutazione dell'ordine |
| coppia senza base        | varianti collegate × sedi con coppia attiva, **meno** gli stati con `lastPushedAvailable`; la causa dall'ultimo tentativo, **dichiarata tale** | l'ultimo tentativo (attivazione) |
| articolo escluso         | gli esclusi `articolo` dell'esito il cui prodotto è **ancora** senza `shopifyProductId`                                                        | —                                |
| permessi mancanti        | `scopeDiagnostics.missingFromGrant` (chiesti e non concessi)                                                                                   | letto adesso                     |
| notifiche non registrate | `webhookMissingTopics`, solo se `webhookTopicsKnown`                                                                                           | letto adesso                     |
| ordini non acquisiti     | `esito.attivazione.ordini.falliti` (conteggio)                                                                                                 | l'attivazione                    |

⚠️ **Un motivo scritto PRIMA della lettura dai fulfillment order** («il payload Shopify non porta
una location…») non dice la causa di oggi: si classifica «da rileggere», con l'azione «Reimporta
gli ordini» e la data dell'ultima valutazione. ⚠️ **Il difetto GID corretto non sistema le 75
coppie**: restano senza base finché un'operazione successiva riesce — e lo dice la riga, con
«ultimo tentativo: …».

Le cause (`ShopifySetupProblemaCausa`) e le azioni (`apri_ordine`, `apri_articolo`, `sedi`,
`permessi`, `allinea`, `importa_ordini`, `webhook`, `nessuna`) sono un vocabolario chiuso:
`shopify-setup-situazione.util` (API, pura, 11 prove) li produce; `shopify-problemi.util`
(frontend) li traduce in frasi e raggruppa.

### Come si legge

In **Impostazioni → Shopify**, **in cima** (prima della Configurazione): quattro fatti —
Connessione, **Quantità** («ferme verso Shopify: 2 ordini aperti senza sede» / «N coppie senza
base» / «in corso»), Notifiche («2 su 10 non registrate»), Problemi («87 aperti, in 6 cause») —
poi `app-shopify-problemi`:

1. **le cause**, una riga per causa: conteggio, i primi tre nomi, la conseguenza, l'azione come
   pulsante se eseguibile da lì — «75 righe» diventano «1 causa, 75 articoli»;
2. **l'elenco sul motore comune** (vista `ShopifyProblemi`, come le non allineate di Allinea):
   ricerca libera, Colonne, Filtri a valori su Tipo/Causa/Sede, ordinamento, **Esporta CSV** di
   ciò che si vede, card sotto `lg`; l'elemento è un **collegamento** all'ordine
   (`/app/sales/:id`) o all'articolo (`/app/products/:id`).

Le azioni: `allinea` → «Allinea giacenze» (rifiuta finché ci sono ordini senza sede, e la riga lo
dice); `importa_ordini` → «Importa ordini»; `webhook` → registra le notifiche mancanti;
`permessi` e `sedi` portano alla sezione. ⛔ Niente correzioni automatiche dei dati.

⭐ **Il badge del percorso conta questi problemi** («Attivata · 87 problemi aperti»), non più
gli esclusi di allora; il banner in testa dice «con problemi aperti — Vedi problemi»; il fermo
dell'allineamento nello storico è una riga corta con «Vedi problemi».

### Tre difetti chiusi con lo stesso lavoro

- **«Sedi non attivate» con la sede collegata**: `collega` scrive l'id della coppia ma non lo
  stato `synced` — che significa «dati della sede letti da Shopify» («Sincronizza location») e
  **non** va scritto da chi non li ha letti. I lettori ora leggono la coppia dall'id
  (`isShopifyManagedLocation`, `locationSetupStatusOf`, la tabella delle sedi dice «Collegata»).
- **«Apri impostazioni»** del banner della shell portava a `/app/settings`, non alla pagina
  Shopify: ora `/app/settings/shopify`.
- **La tendina delle sedi sul telefono**: il pannello fisso (aggiunto per la cella che
  ritaglia) si chiude a ogni scorrimento e rendeva la scelta impossibile — misurato dalla prova a
  schermo; fisso solo da `lg` in su (`ViewportService.compact`).

### Un solo comando manuale sulle quantità — deciso il 13/09/2026

Verificato il 13/09/2026 su richiesta del proprietario: «Riallinea le giacenze» (`pullInventory`)
era già presente; «Allinea giacenze» è arrivato dopo (`4d52e64d`, §31.23 di `DA-FARE`) e i due
sono rimasti entrambi. `docs/24` nomina UN comando sulle quantità («Allinea giacenze — solo le
quantità, VestiFlow → Shopify»); nessuna decisione chiede due comandi manuali. **Che cosa fa
«Riallinea» che «Allinea» non fa**: legge i livelli remoti in blocchi da 50 (REST), passa ogni
livello dalla riconciliazione del webhook (registra il valore osservato, ripubblica il valore
VestiFlow dove differisce, **senza attendere l'esito e senza tetto**: `DA-FARE` §27.3 #1) e in coda
svuota la coda dei ritentativi (`retryPending`). «Allinea» asserisce il valore VestiFlow coppia per
coppia con base, protezioni, tetto di scritture per blocco ed elenco delle non allineate — copre
anche i disallineamenti, che sono coppie del perimetro. ⏸ **Nessuna funzione necessaria resta
scoperta**; il ritentativo della coda non ha altro ingresso in UI (esiste `POST sync/inventory/pending`).
⭐ **Deciso dal proprietario il 13/09/2026: in interfaccia resta il solo «Allinea giacenze su
Shopify».** Il pulsante «Riallinea» è tolto, **senza un sostituto**; `pullInventory`, l'endpoint
`POST sync/inventory`, il servizio del frontend e gli automatismi restano intatti — la distinzione
tecnica resta interna. Il permesso che governava il blocco Giacenze governa ora «Allinea»: le prove
dei permessi (pannello 39, e2e Impostazioni) lo verificano su quel comando. ⚠️ Le tre prove e2e
`permissions*` cercano il comando sulle giacenze nella pagina Magazzino, dove non sta più
dall'11/09: erano già da rivedere, e qui si è solo aggiornato il nome.

## 5. Ordini: la partenza e la sincronizzazione continua

⭐ **Tre origini di acquisizione**, dichiarate sull'evento canonico
(`OnlineOrderEventInput.acquisizione`):

| Origine    | Chi la usa                                                     | Un evaso SENZA impegno in VestiFlow…                                                                                                                                                         |
| ---------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pendenti` | l'attivazione: `listOpenUnfulfilledOrders` → solo gli aperti   | non arriva: si acquisiscono solo aperti (impegni) e parziali (segnalati)                                                                                                                     |
| `continua` | webhook `orders/*` e il recupero dopo interruzione             | **si scarica** alla sede dell'evasione, una volta (UNIQUE per riga): la merce è partita mentre VestiFlow governava la giacenza. Senza sede determinabile: nessuno scarico e `requiresReview` |
| `massiva`  | «Importa ordini» delle connessioni nate prima (storico intero) | resta `not_applied`, come sempre: la giacenza reale è già allineata dal canale                                                                                                               |

**All'attivazione**, nell'ordine: acquisizione degli aperti come impegni → base per coppia
col motore di Allinea (dove il canale porta già il valore di VestiFlow la base nasce senza
scrivere; dove no, da qui in poi vale VestiFlow e la coppia è nominata) → esclusione degli
articoli non risolti → si fissa **l'ultimo id ordine del negozio** (`orders_since_id`) →
registrazione dei webhook → `attivato`. Tutto nell'esito (`esito.attivazione`).

**Il recupero della sincronizzazione continua** (`recuperaOrdini`, dietro «Importa ordini»
per una connessione attivata dal percorso): gli ordini **nati dopo** `orders_since_id` —
gli id Shopify crescono con la creazione, nessun orologio — più la rilettura per id degli
ordini che VestiFlow **conosce** e che quella scansione non raggiunge (nati prima del
confine: gli acquisiti alla partenza), **aperti o chiusi**. Tutto con origine `continua`:
**l'ordine creato ed evaso mentre i webhook erano fermi viene scaricato, una volta** (caso
5). Non tocca lo storico.

⛔ **Qui la rilettura prendeva i soli aperti** (`cancelledAt` e `fulfilledAt` nulli), e il
buco è stato trovato il 13/09/2026 sera leggendo il codice, non da una prova: un ordine
nato prima dell'attivazione, acquisito perché aperto, poi evaso, che riceve un **rimborso a
webhook fermi** non stava in nessuno dei due insiemi — la rettifica si perdeva, e «Importa
ordini» a percorso attivato È questo recupero, quindi senza rimedio a mano. Lo salvava solo
la riconsegna di Shopify (fino a 8 tentativi in 4 ore). Deciso dal proprietario: si
rileggono anche gli acquisiti alla partenza, evasi o annullati compresi, **nel perimetro dei
conosciuti** — niente storico, nessun orologio. Il costo, misurato (caso 19): **una scansione
per id più una lettura per ordine conosciuto fuori dalla scansione**; a cose ferme nessuna
scrittura su movimenti, giacenze, impegni e Vendite (le righe del rimborso si riscrivono in
posto, per contratto di `persistRefunds`). Sul collaudo: 9 ordini conosciuti, 4 fuori dalla
scansione, nessuno dei 4 chiuso.

⚠️ **Limite dichiarato V→S**: un ordine evaso PRIMA dell'acquisizione non ha effetti (era
già uscito dallo scaffale, e se il negozio spediva dallo stesso scaffale senza registrarlo in
VestiFlow la giacenza locale va **contata**, non dedotta da Shopify). È la finestra
operativa a rendere raro il caso, non il programma.

## 6. Le prove

- `api/src/test/integration/prima-connessione-percorso.integration-spec.ts` — **servizi
  veri su PostgreSQL 5433, negozio simulato con quantità, impegni, location e ordini**, 5
  verdi: (1) S→V senza ordini: catalogo, giacenza = `on_hand`, base stabilita all'attivazione
  senza scrivere, webhook solo all'attivazione; (2) V→S: articolo pubblicato, quantità di
  VestiFlow su Shopify, giacenza locale intatta; (3) ordine precedente aperto: impegno
  all'attivazione, scarico una volta alla sua evasione, webhook ripetuto ignorato; (4)
  interruzione dopo il catalogo: la ripresa non reimporta, scrive la base una volta, a negozio
  fermo non scrive, dopo un movimento scrive solo la differenza; (5) primo ordine dopo
  l'attivazione (impegno → scarico) e ordine creato ed evaso a webhook fermi, recuperato e
  scaricato una volta. Poi i casi 6–19 (vedi il file); il **19** (13/09/2026) è il rimborso a
  webhook fermi su un ordine pre-attivazione già evaso: rosso prima della correzione del
  recupero, poi recuperato una volta, senza secondo scarico né seconda Vendita, con Registro,
  Cruscotto, elenco ed export coerenti, secondo recupero e webhook tardivo senza doppioni, e
  lo storico estraneo (un ordine già evaso prima della partenza) mai acquisito.
- `prima-connessione-controesempi.integration-spec.ts` (3) — i controesempi ai tentativi
  ritirati, sulle semantiche del ciclo ordini.
- `sedi-collegamento-esplicito.integration-spec.ts` (4) — B7 su PostgreSQL.
- Unità: `shopify-order-location.util.spec.ts` (6), `shopify-location-sync.service.spec.ts`
  (36), `shopify-setup-panel.component.spec.ts` (6), `shopify-integration-panel` (36),
  `shopify-setup.service.spec.ts` (4, client).
- `e2e/prima-connessione.spec.ts` (2, suite isolata `cassa-isolated`): il percorso a schermo
  con l'API instradata — scelte, sedi, controllo (ordini da risolvere, variazioni sul motore),
  conferma, casi irrisolti aperti, attivazione, sezione Sedi dopo; e il telefono (card, tendina
  intera, nessuno scorrimento orizzontale). Scatti in `test-results/prima-connessione/`.
- ✅ Le scelte sedi **fuori dal percorso** (§2) e la sezione Sedi: `shopify-location-choices`
  (3), `shopify-integration-panel` (+2), percorso caso 6.
- ⏸ Il collaudo con Shopify vero: perimetro in `docs/28`, da approvare prima di eseguire.

## 7. Il fuori perimetro

Riconciliazione manuale, abbinamento degli SKU ambigui, cambio di negozio durante il
percorso, secondo canale. La verifica dell'effettiva assenza di movimenti nella finestra è
della procedura (guida operativa), non del programma.
