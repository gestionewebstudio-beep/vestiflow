# VestiFlow e Shopify — quadro funzionale

Raccolta delle decisioni e delle precisazioni del proprietario del 9-10 settembre 2026.

**Scopo:** leggere in pochi minuti come deve funzionare la sincronizzazione, senza ricostruire la chat o lo storico dei difetti. Non è una nuova architettura, un'autorizzazione a implementare o una dichiarazione che tutto sia già disponibile.

Le regole richieste sono distinte dalle proposte e dalle scelte aperte. Le decisioni più recenti confermate dal proprietario prevalgono; i dettagli canonici rimangono nelle specifiche richiamate in fondo. Le precisazioni raccolte qui devono essere recepite nelle sezioni pertinenti, non diventare una seconda specifica tecnica concorrente.

## 1. I cinque momenti da non confondere

| Momento | Risultato richiesto |
| --- | --- |
| Prima configurazione | Scegliere le sedi collegate e da dove partire con il catalogo. |
| Attività ordinaria | Sincronizzare secondo la matrice dei campi, senza perdere aggiornamenti. |
| Emergenza | Sospendere la sincronizzazione conservando dati e collegamenti. |
| Ripresa e riallineamento manuale | Considerare il periodo non sincronizzato e correggere differenze verificate. |
| Importazione da file | Preparare e controllare articoli nuovi o aggiornamenti, anche a gestione già avviata. |

VestiFlow deve funzionare integralmente anche senza Shopify. Per un'azienda senza modulo Shopify non devono comparire comandi, campi o errori del canale.

## 2. Catalogo iniziale: preparazione manuale sì, fusione automatica no

| Situazione | Percorso richiesto |
| --- | --- |
| VestiFlow vuoto, Shopify popolato | Importare il catalogo da Shopify conservando i suoi identificativi. |
| Shopify vuoto, VestiFlow popolato | Pubblicare da VestiFlow e registrare gli identificativi restituiti da Shopify. |
| Entrambi popolati | Preparazione manuale e controllata, anche esportando da Shopify e importando tramite file in VestiFlow. Nessuna fusione automatica. |

**Precisazione del proprietario:** escludere la fusione automatica non vieta all'utente di preparare i dati manualmente. Non autorizza nemmeno cancellazioni o sovrascritture implicite del catalogo di destinazione.

Importare dati e collegare articoli remoti sono due azioni diverse. Il collegamento deve conservare o acquisire gli identificativi Shopify reali del negozio corretto. Se il file non li contiene, nome, SKU e barcode non diventano automaticamente prove d'identità. Il percorso deve evitare sia doppioni locali sia nuove copie remote di articoli già esistenti.

La direzione iniziale non cambia la sincronizzazione successiva: vale sempre la matrice canonica dei campi, che qui non viene duplicata.

**Decisione confermata il 10/09/2026 — partenza controllata.** L'allineamento iniziale si svolge anche in più fasi, acquisendo e controllando gli ordini online pendenti e correggendo le differenze prima di considerare conclusa la preparazione. Un ordine già compreso nelle quantità di partenza non deve essere sottratto di nuovo quando viene acquisito. Non occorre che tutti gli ordini siano evasi: occorre distinguere gli effetti già contabilizzati da quelli ancora da acquisire.

VestiFlow **non sospende le vendite Shopify** e non ne impone la sospensione come prerequisito. L'operatore decide se fermarle temporaneamente dal negozio oppure allineare a vendite aperte, assumendo il rischio di ordini concorrenti e di successive correzioni. La sincronizzazione resta operativa durante questi passaggi: non si introduce una modalità di manutenzione che la spenga per poter allineare.

Il rischio accettato per questa operazione esplicita non autorizza un riallineamento nascosto alla prima vendita locale. Terminata la preparazione si entra nel regime continuo di §4. Le modalità tecniche di attivazione devono rispettare questa sequenza, non inventare una base mediante un invio ordinario.

## 3. Sedi: collegamento esplicito tramite identificativi

- Per gestire il magazzino serve almeno una sede operativa VestiFlow.
- L'operatore sceglie quali sedi collegare, una sede VestiFlow per una location Shopify.
- Il collegamento usa **ID sede VestiFlow e ID location Shopify**, con l'appartenenza all'azienda e al negozio corretti. Il nome serve alla lettura, mai all'abbinamento automatico.
- Una sede rinominata conserva il collegamento. Due sedi omonime restano distinte.
- Una sola sede VestiFlow non raccoglie automaticamente la somma di più location Shopify. Le quantità sono separate per variante e sede.
- Una sede non collegata resta fuori dagli scambi previsti per quel collegamento. Un ordine senza sede identificata non autorizza lo scarico dalla prima sede disponibile.

Essere lo “specchio delle sedi” significa mantenere la corrispondenza scelta e le disponibilità coerenti, non copiare nomi, indirizzi o qualunque rettifica numerica remota.

## 4. Ordini e quantità: conta l'origine dell'effetto

Alla prima connessione si registra un confine temporale. Si acquisiscono gli ordini creati da quell'istante in avanti, non lo storico precedente. Pausa e riconnessione allo stesso negozio non spostano il confine e non fanno dimenticare il periodo intermedio.

L'ordine fornisce articoli, quantità ordinate e sedi interessate: **non fornisce una giacenza da copiare**. VestiFlow applica gli effetti previsti su impegni e movimenti. Il Disponibile resta Giacenza meno Impegnata; le quantità locali possono essere negative secondo le regole del gestionale.

| Origine | Comportamento richiesto |
| --- | --- |
| Effetto già applicato da Shopify | Acquisirlo in VestiFlow senza generare, per quella sola acquisizione, un reinvio automatico della disponibilità al canale. |
| Operazione locale | Generare l'aggiornamento da trasmettere, senza sovrascrivere vendite online non ancora acquisite. |

L'arrivo di un ordine Shopify non deve cancellare aggiornamenti locali ancora pendenti. Ricevere due volte lo stesso evento non deve duplicare gli effetti.

**Controesempio da conservare:** Shopify parte da 10, riceve due ordini e scende a 8. VestiFlow ne ha ricevuto uno e vede 9. Leggere 8 da Shopify e scrivere “porta a 9 se sei ancora a 8” può riuscire, ma rimette in vendita un'unità già acquistata. Un confronto numerico prima della scrittura, da solo, non prova che gli ordini siano stati acquisiti tutti.

La stessa protezione serve per una vendita locale durante l'arrivo degli ordini online. Il criterio tecnico che la garantisce va dimostrato, non dedotto dall'autorevolezza di VestiFlow o da un'attesa fissa.

**Regime richiesto:** una vendita locale genera l'effetto da sottrarre sul canale, un carico locale quello da aggiungere; un effetto Shopify acquisito aggiorna VestiFlow senza essere rimandato. Restano le regole dei negativi e della quantità pubblicabile: questa descrizione funzionale non autorizza un delta grezzo che pubblichi merce inesistente. La convergenza va verificata dopo l'elaborazione degli eventi, non promessa in ogni istante fra due sistemi distinti.

**Rettifiche manuali sul canale:** le quantità vanno gestite in VestiFlow. Modifiche fatte nell'admin Shopify, o da altri sistemi che vi scrivono, non diventano movimenti locali, non vengono accettate come nuova giacenza VestiFlow e non vengono corrette automaticamente imponendo il totale locale. Possono lasciare uno scarto, che l'operatore corregge con il comando esplicito di §5. Questo limite va dichiarato nelle guide; non giustifica la perdita di operazioni VestiFlow o di ordini da acquisire.

## 5. Pausa, ripresa e comando manuale

**Emergenza, distinta dall'allineamento:** resta richiesta una sospensione esplicita e riconoscibile della sincronizzazione, in ingresso e in uscita, senza cancellare i collegamenti. Non archivia prodotti, non manda quantità zero e non blocca il lavoro locale. Alla ripresa si recupera il periodo sospeso e non deve sparire il lavoro pendente. La sospensione di un articolo o variante riguarda tutte le sue sedi, non una singola sede. Non si attiva automaticamente per eseguire il primo allineamento o il pulsante Allinea.

**Decisione confermata il 10/09/2026 — comando Allinea:** l'operatore può richiederlo quando vuole, anche a negozio aperto. Controlla le differenze per variante e sede e porta **Shopify alle disponibilità pubblicabili di VestiFlow**, mai VestiFlow ai numeri Shopify. Le coppie uguali non richiedono una scrittura. Il comando non spegne la sincronizzazione né governa l'apertura delle vendite.

La preparazione considera gli ordini del periodo gestito e il controllo delle differenze; può essere ripetuta in più passaggi. **Deciso il 10/09/2026 — non è più aperta:** il recupero degli ordini appartiene alla **sincronizzazione continua** e non dipende dal pulsante. Gli ordini arrivano da soli; quelli non consegnati per un guasto si recuperano automaticamente, perché Shopify non garantisce ogni consegna. **Allinea corregge le disponibilità, non serve a far arrivare gli ordini.** Prima del confronto può starci un controllo di freschezza, che non è una reimportazione di tutti gli ordini e non garantisce che non ne arrivi uno subito dopo. L'effetto del comando su Shopify riguarda solo le disponibilità, non catalogo, prezzi o stato degli ordini. A vendite aperte può arrivare un ordine durante il giro: una passata vuota o due numeri uguali non provano l'assenza di eventi in transito. L'operatore accetta questo rischio residuo del riallineamento esplicito; nessuna promessa che basti sempre un giro o che una sovrascrittura sia reversibile. Il rischio non va trasferito alla sincronizzazione ordinaria.

Restano le protezioni tecniche su tenant, negozio, sede, identità escluse, concorrenza, doppie applicazioni, risposte perse e lavoro locale arrivato durante l'invio. Un guasto non diventa un successo perché l'utente ha scelto di operare a vendite aperte. Le modalità UI oltre al comando richiesto non si inventano qui; lo stato implementato va distinto dal funzionamento approvato.

Il ripristino di un backup è un percorso distinto: riportare un articolo nel gestionale non autorizza a riattivare un collegamento remoto chiuso o escluso. Restano valide le regole specifiche di ripristino e di riaggancio esplicito.

## 6. Importazioni massive e carichi di lavoro

Le importazioni manuali servono anche durante l'attività ordinaria: CSV Shopify, XML fornitori e altri formati da verificare e supportare esplicitamente. Il fatto che un formato sia richiesto non significa che sia già implementato.

Vanno distinti creazione e aggiornamento, conservati i dati preesistenti e rese visibili le anomalie. Una ripetizione non deve duplicare gli effetti. La disponibilità dichiarata dal fornitore non è automaticamente merce presente in una sede VestiFlow.

**Proposta da confermare:** importare in locale, controllare e poi allineare al canale. Non è ancora decisa la conferma per lotto o articolo, né il trattamento dei dati modificati nel frattempo.

La colonna “Sincronizza con Shopify: sì/no” è un requisito da definire esplicitamente: valori ammessi, campo vuoto, aggiornamento di articoli già collegati e momento dell'invio. Non si deve attribuire al campo un comportamento implicito, né confondere sospensione e disattivazione del prodotto.

Nel primo allineamento ogni articolo deve essere completo per i campi previsti. Durante l'attività ordinaria, sotto carico, disponibilità e prezzi hanno precedenza sulle informazioni descrittive, senza abbandonare queste ultime. Capacità e ritardi vanno misurati sui picchi. Interruzioni e riavvii non devono far sparire aggiornamenti pendenti.

## 7. Le scelte ancora aperte

| Scelta | Limite già fermo |
| --- | --- |
| Dettagli tecnici della partenza controllata | Il flusso e la scelta di lavorare a vendite aperte sono approvati in §2 e §5. Non imporre zeri, sommare sedi o usare il primo invio ordinario per inventare la base. |
| Recupero dopo la pausa d'emergenza | Ingressi e uscite si fermano su scelta esplicita e si recuperano alla riattivazione. La copertura degli eventi e i limiti di accesso vanno realizzati e dichiarati, non dedotti da una lista vuota. |
| Conferma delle importazioni e colonna sì/no | Distinguere articoli nuovi da aggiornamenti di quelli già collegati. |
| Invii sicuri e recuperabili | Dimostrare la gestione di ordini in ritardo, modifiche locali e risposte perse. Code, worker e altre soluzioni non sono autorizzati per il solo fatto di essere citati. |

## 8. Prove essenziali, non nuove regole

- Primo avvio nelle due direzioni e preparazione manuale con entrambi i cataloghi popolati; nessuna fusione automatica.
- Sedi omonime, sede rinominata, collegamento assente e ordine riferito a una sede non collegata.
- Ordine diviso fra sedi, assegnazione cambiata, annullamento e reso; effetti sulle sedi corrette e senza duplicazioni.
- Ordini prima e dopo il confine iniziale; riconnessione senza azzerarlo.
- Due ordini online con uno ancora non acquisito; vendita locale nella stessa finestra.
- Nuovo ordine prima della lettura remota e fra lettura e scrittura del riallineamento.
- Partenza in più fasi con ordini pendenti: nessun effetto contato due volte; nessuna sospensione delle vendite o della sincronizzazione imposta da VestiFlow.
- Rettifica manuale Shopify: nessuna variazione automatica della giacenza VestiFlow; Allinea corregge il canale nella direzione richiesta.
- Allinea durante attività locale e online: gli effetti sopraggiunti non spariscono; gli esiti dichiarano ciò che è stato applicato, senza promettere assenza di ordini in transito.
- Riconsegna dello stesso evento e risposta persa dopo una scrittura riuscita.
- Pausa e ripresa con attività locale e online; ripristino seguito da sincronizzazione.
- Importazioni ripetute, picchi, interruzioni e recupero, con controlli su dati locali, remoto simulato ed esiti mostrati.
- Azienda senza Shopify e isolamento fra aziende, negozi e sedi.

Le prove di limiti noti non sono prove di conformità. Simulazioni e collaudi contro Shopify reale vanno distinti; questi ultimi richiedono un'autorizzazione separata.

## 9. Dove stanno i dettagli e come procedere

- [Specifica del ciclo di vita e sincronizzazione](24-specifica-ciclo-vita-catalogo-e-sincronizzazione-shopify-v2.md): sedi §1.13; ordini e riconnessione §1.15; capacità §8.9; importazioni massive §8.10; funzionamento richiesto §8.11; matrice dei campi §9.2; primo allineamento §12.0 e quantità iniziali §12.9.
- [DA-FARE](DA-FARE.md): stato effettivo, difetti, dipendenze e interventi autorizzati. Non duplicarne qui il consuntivo.
- [Piano di collaudo Shopify](PIANO-COLLAUDO-SHOPIFY.md): scenari, ambienti e risultati. Le prove richiamano le regole, non le ridecidono.

Concludere i controlli già autorizzati; confrontare il codice con questo perimetro; correggere un blocco circoscritto alla volta; aggiornare le specifiche nei punti pertinenti e ripetere i test. Le guide utente devono descrivere ciò che è realmente disponibile, senza presentare le proposte come funzioni rilasciate.
