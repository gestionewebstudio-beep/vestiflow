# 29 — Impostazioni → Shopify: la pagina si legge in tre domande

_Proposta del 13/09/2026, **confermata dal proprietario con cinque correzioni** (§3) prima di
costruire. Nasce dal collaudo reale (`docs/28`): il titolare, davanti alla pagina dopo la
ri-autorizzazione, dice «vedo ancora tutto confusionario: non si capiva la fase iniziale del
primo collegamento; adesso non so se questa è una risincro; tutto mischiato, righe senza un
criterio, senza allineamenti; davanti a un problema non capisco cosa dovrei fare, se
risolvere, come, e se qui o altrove»._

## 0. La diagnosi, sulla schermata di oggi

La pagina di oggi (misurata: `shopify-integration-panel.component.html`, 13/09 10:40) mette in
fila, con lo stesso peso visivo, **sette sezioni di tre nature diverse**:

| Sezione di oggi            | Natura                            | Domanda a cui risponde                         |
| -------------------------- | --------------------------------- | ---------------------------------------------- |
| Situazione attuale         | stato + problemi + tabella        | «come sta?» e «cosa c'è che non va?» insieme   |
| Prima connessione          | procedura (una volta)             | «come inizio?»                                 |
| Configurazione             | dati + sedi + azioni pericolose   | «cos'è collegato?» e «come lo cambio?» insieme |
| Percorso prima connessione | procedura + storico               | «a che punto sono?» / «com'è andata?»          |
| Sincronizzazione           | comandi                           | «cosa posso lanciare?»                         |
| Stato ed esiti             | errori + notifiche + interruttore | «cosa è successo?» e «cosa è acceso?» insieme  |

Quattro difetti, tutti di **struttura**, non di grafica:

1. **Stato, problema e comando stanno nella stessa lista.** «Notifiche: attive, 10 registrate»
   (uno stato), «82 coppie senza base» (un problema) e «Allinea» (un comando) hanno la stessa
   forma. Chi legge non sa se deve _fare_ qualcosa o solo _sapere_ qualcosa.
2. **L'azione è una frase, non un comando.** «"Allinea giacenze su Shopify" dopo aver risolto gli
   ordini senza sede: finché ci sono, rifiuta» compare **75 volte** nella tabella, tagliata dalla
   colonna. Non dice se si fa qui o altrove, e non è premibile.
3. **La prima connessione non ha un posto suo nel tempo.** Il percorso (fasi, storico, esito) sta
   in mezzo alla pagina anche dopo l'attivazione, con lo stesso peso dei comandi: non si capisce
   se «questo» è la prima volta, una ripetizione o la normale operatività.
4. **Le righe non hanno una grammatica.** Fatti a due colonne, gruppi a tre righe, comandi a
   «titolo + paragrafo + pulsante» di larghezze diverse: l'occhio non trova un allineamento a
   cui appoggiarsi.

## 1. I criteri (gli «studi» che aiutano a disporre frasi, titoli e divisioni)

Sono principi consolidati e verificabili, non gusti. Ognuno qui sotto è applicato a un punto
preciso della proposta (§2).

| Criterio                                                                        | Che cosa dice                                                                                                       | Dove si applica                                                                                               |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Visibilità dello stato del sistema** (Nielsen, euristica 1, 1994)             | l'utente deve sapere sempre cosa sta succedendo, con un riscontro adeguato e tempestivo                             | il blocco **Stato** in cima, con la data di ogni fatto                                                        |
| **Riconoscere, non ricordare** (Nielsen, euristica 6)                           | le azioni e le opzioni devono essere visibili: non chiedere di ricordare da una schermata all'altra                 | ogni azione porta scritto **dove** si fa (qui / in VestiFlow / su Shopify)                                    |
| **Aiutare a riconoscere, diagnosticare e correggere** (Nielsen, 9)              | un messaggio d'errore dice **cosa** non va, in linguaggio piano, e **propone la via d'uscita**                      | la card di gruppo a tre righe fisse: _Cosa · Effetto · Azione_                                                |
| **Progressive disclosure** (Nielsen Norman Group)                               | prima l'essenziale, il dettaglio a richiesta                                                                        | la frase lunga una volta nel gruppo; lo storico della prima connessione chiuso                                |
| **Piramide rovesciata** (giornalismo; NN/g «Inverted Pyramids», 1996)           | la conclusione per prima, poi il perché, poi il dettaglio                                                           | **Da fare adesso** viene prima di **Problemi**, che viene prima della tabella                                 |
| **Lettura a F** (NN/g, 2006)                                                    | si scandiscono i titoli e le prime parole delle righe: il senso va **in testa** alla riga                           | titoli che nominano la domanda; righe che iniziano col numero e col soggetto                                  |
| **Gestalt: prossimità e regione comune** (Wertheimer 1923; Palmer 1992)         | ciò che è vicino, o dentro lo stesso riquadro, si legge come un gruppo; ciò che è allineato si legge come una serie | una card per sezione; dentro, righe con la **stessa** griglia (etichetta · valore · azione)                   |
| **Somiglianza** (Gestalt)                                                       | elementi con la stessa forma si leggono come dello stesso tipo — e viceversa                                        | stati come badge, problemi come card, comandi come righe uniformi: **mai** la stessa forma per nature diverse |
| **Una cosa per pagina / titoli in forma di compito** (GOV.UK Service Manual)    | ogni schermata risponde a una domanda; i titoli dicono che cosa ci si trova, non che cosa è tecnicamente            | finché il percorso è in corso, la pagina è la prima connessione più i rimedi che servono a completarla        |
| **Una sola azione primaria per vista** (`regole-gestionale`, «Azione primaria») | massimo una CTA primaria per schermata                                                                              | il solo pulsante primario è il comando che il prossimo passo indica (in **Comandi**)                          |
| **Un solo modo di fare le cose** (`regole-stile-ui` §1)                         | lo stesso pattern per gli stessi casi                                                                               | l'azione ha **quattro forme** fisse, in tutta la pagina e nella tabella                                       |

## 2. La proposta: la pagina risponde, in ordine, a tre domande

```text
1. COME STA?            → Stato            (fatti, ognuno con la sua data e il suo colore)
2. COSA FACCIO ADESSO?  → Da fare adesso   (il prerequisito già noto, se c'è; altrimenti niente)
                        → Problemi aperti  (per causa; tre righe fisse; poi la tabella)
3. COSA POSSO FARE?     → Comandi          (quattro righe uguali: cosa fa · ultimo · pulsante)
                        → Notifiche e aggiornamenti automatici
                        → Connessione      (accesso, sedi; in fondo la zona sensibile)
   com'è cominciata     → Prima connessione (conclusa: una riga chiusa in fondo; in corso: in cima)
```

### 2.1 Il mock (scrivania)

```text
Shopify
Collegamento al negozio, problemi da risolvere, comandi.

┌ STATO ───────────────────────────────────────────────────────────────────────┐
│ Negozio          test-vestiflow.myshopify.com    ● collegato · dal 13/09 09:29 │
│ Notifiche        ● 10 su 10 registrate · verificate 13/09 09:42                │
│ Aggiornamenti    ● automatici attivi                                          │
│ Sedi             ● 1 collegata su 5 location del negozio             Sedi ›   │
│ Quantità         ● 82 coppie senza base                          Problemi ›   │
└──────────────────────────────────────────────────────────────────────────────┘

┌ DA FARE ADESSO ──────────────────────────────────────────────────────────────┐
│ 75 coppie articolo × sede sono senza base: il comando «Allinea giacenze su     │
│ Shopify» la stabilisce, e opera su TUTTE le coppie.        Vai al comando ›   │
└──────────────────────────────────────────────────────────────────────────────┘

   (con un ordine senza sede, il blocco già noto viene prima; «Allinea» è spento e lo dice:)
│ L'ordine #1010 ha una riga assegnata a una location non collegata: finché c'è,│
│ «Allinea giacenze» è rifiutato. Collega la location in Sedi, oppure sposta    │
│ la riga su Shopify; poi reimporta l'ordine.                                   │
│                              Apri #1010 ›   Vai a Sedi ›   [ Importa ordini ] │

   (senza coppie senza base e senza ordini senza sede, il blocco NON compare)

┌ PROBLEMI APERTI · 82 · letti alle 13/09 09:42 ───────────────────────────────┐
│ 75  Quantità senza base                                                       │
│     Effetto   la quantità di queste coppie non parte verso Shopify            │
│     Azione    IN VESTIFLOW · «Allinea giacenze su Shopify», su tutte le coppie │
│               → Vai al comando ›                                              │
│  7  Articolo non stoccato nella location Shopify                              │
│     Effetto   la coppia resta senza base: la quantità non parte. Se l'articolo │
│               non deve vendersi da questa sede, il caso resta così e non      │
│               blocca nient'altro                                              │
│     Azione    SU SHOPIFY · stocca l'articolo nella location; poi Allinea      │
│  ─────────────────────────────────────────────────────────────────────────    │
│  [ tabella del motore: Tipo · Elemento · Dettaglio · Sede · Causa · Azione ]  │
│    Azione (breve): «Allinea, tutte le coppie ›» / «Collega la location ›» /   │
│                    «Su Shopify: stocca» / «Apri ordine ›»                     │
└──────────────────────────────────────────────────────────────────────────────┘

┌ COMANDI ─────────────────────────────────────────────────────────────────────┐
│ Catalogo   importa i prodotti nuovi e i campi bidirezionali   ultimo 12/09 23:14 ✓   [ Importa catalogo ] │
│ Giacenze   pubblica le quantità di VestiFlow su Shopify       ultimo 12/09 23:14 · 82 esclusi [ Allinea giacenze su Shopify ] │
│ Clienti    importa i clienti del negozio                      ultimo —               [ Importa clienti ]  │
│ Ordini     acquisisce gli ordini aperti e i loro impegni      ultimo 13/09 09:32 ✓   [ Importa ordini ]   │
└──────────────────────────────────────────────────────────────────────────────┘

┌ NOTIFICHE E AGGIORNAMENTI AUTOMATICI ───────────────────────────────────────┐
│ Notifiche dal negozio    ● 10 su 10 · verificate 09:42  [ Verifica ora ] [ Registra le mancanti ] │
│ Aggiornamenti automatici ● attivi                       [ Sospendi ]                             │
└──────────────────────────────────────────────────────────────────────────────┘

┌ CONNESSIONE ─────────────────────────────────────────────────────────────────┐
│ Accesso a Shopify   13 ambiti ▸        Sedi   1 collegata su 5 ▸               │
│ [ Ripristina connessione ]                                                    │
│ ── Zona sensibile ──────────────────────────────────────────────────────────  │
│ [ Cambia negozio ]   [ Disconnetti ]   [ Disconnetti e rimuovi dati ]         │
└──────────────────────────────────────────────────────────────────────────────┘

▸ Prima connessione — conclusa il 13/09 01:14 · 82 esclusi                (chiusa)
```

⭐ **«Allinea» si esegue in UN posto: la riga Giacenze di Comandi.** «Da fare adesso», la card
del gruppo e la colonna Azione della tabella **rimandano** a quel comando e ne **dichiarano il
perimetro** («su tutte le coppie»): nessuna riga deve far credere di allineare soltanto
quell'articolo. _(Correzione 1 del proprietario, 13/09/2026: nel primo mock il comando compariva
quattro volte, in tre forme.)_

⭐ **«Da fare adesso» è un suggerimento basato sui blocchi già esistenti, non un percorso
nuovo.** Mostra, se ci sono: l'ordine senza sede (il prerequisito che già oggi fa rifiutare
«Allinea», con la sua azione) e le coppie senza base (con il rimando al comando). **Se non ci
sono, il blocco non compare**: nessun «Allinea» inutile, nessuna sequenza inventata per ogni
problema possibile. _(Correzione 3.)_

⭐ **«Da fare su Shopify» NON è «nessuna azione necessaria».** Un articolo non stoccato nella
location può essere un'esclusione voluta o una correzione da fare su Shopify: la card lo dice
(l'effetto sul risultato richiesto, e che cosa NON blocca) e il gruppo resta **aperto** tra i
problemi, contato con gli altri. Nessun gruppo si chiude o si classifica «informativo» da solo.
_(Correzione 2: il primo mock lo chiudeva e lo contava a parte.)_

### 2.2 Durante la prima connessione: il percorso in cima, i rimedi a portata di mano

```text
Shopify
┌ STATO ──────────────────────────────────────────────┐
│ Negozio            test-vestiflow… ● collegato        │
│ Prima connessione  fase 2 di 3 · Sedi                 │
└─────────────────────────────────────────────────────┘
┌ PRIMA CONNESSIONE · fase 2 di 3 — Sedi ─────────────────────────────────────┐
│  (il percorso di oggi, così com'è: le tre fasi — Scelte, Sedi, Controllo —    │
│   con quella corrente aperta; trasferimento, esito e attivazione nella terza) │
└──────────────────────────────────────────────────────────────────────────────┘
┌ CONNESSIONE ─────────────────────────────────────────────────────────────────┐
│ Accesso a Shopify   12 ambiti ▸   [ Ripristina connessione ]   [ Disconnetti ] │
└──────────────────────────────────────────────────────────────────────────────┘
```

Restano nascosti i **comandi ordinari** (Comandi, Problemi, Notifiche e aggiornamenti), che
sono già chiusi dal cancello dell'attivazione e mostrati spenti confondevano. Restano
**raggiungibili i rimedi che servono a completare il percorso**: l'accesso a Shopify (gli
ambiti, e il «Disconnetti → Connetti» che li aggiorna), il ripristino della connessione, le
sedi. _(Correzione 4: il primo mock nascondeva anche questi.)_

⛔ **Le fasi sono TRE** — Scelte, Sedi, Controllo (`docs/27` §1; `ShopifySetupFase`):
trasferimento, esito e attivazione stanno nella terza. _(Correzione 5: il primo mock diceva «passo
2 di 4».)_

Conclusa, la prima connessione scende in fondo, chiusa, con data ed esito; lo storico e l'«Esito
dell'ultimo tentativo» stanno dentro.

### 2.3 La grammatica delle righe — tre forme, sempre le stesse

| Natura       | Forma                                                                                      | Esempio                                           |
| ------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| **Stato**    | etichetta · badge colorato · valore · data · (link alla sezione che lo cambia)             | Notifiche ● 10 su 10 · verificate 09:42           |
| **Problema** | numero · titolo; **Effetto**; **Azione** con la sua forma (sotto)                          | 75 Quantità senza base …                          |
| **Comando**  | nome · cosa fa (una riga) · ultimo esito con data · pulsante, **stessa griglia per tutti** | Ordini · acquisisce… · ultimo 09:32 ✓ · [Importa] |

L'**azione** di un problema ha **quattro forme**, e una sola per problema:

| Forma                      | Come si presenta                                                                | Quando                                                       |
| -------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **QUI** → pulsante         | il comando stesso, premibile (spento con il perché) — solo dove il comando VIVE | Importa ordini in «Da fare adesso»; i comandi in Comandi     |
| **IN VESTIFLOW** → link    | «Vai al comando ›», «Vai a Sedi ›», «Apri #1010 ›», «Apri articolo ›»           | Allinea (rimando al comando, col perimetro), sedi, ordine    |
| **SU SHOPIFY** → testo     | «Su Shopify: stocca l'articolo nella location; poi Allinea»                     | ciò che VestiFlow non può fare, e che serve al risultato     |
| **NESSUNA AZIONE** → testo | «Nessuna azione necessaria: …» con il perché                                    | solo dove è vero per costruzione; **mai** dedotto da un tipo |

⛔ La frase lunga («…dopo aver risolto gli ordini senza sede: finché ci sono, rifiuta») **non si
ripete per riga**: sta una volta nella card del gruppo e nel «perché» del pulsante spento. Nella
tabella la colonna Azione porta la forma breve (verbo · dove) ed è premibile dove è un link.

### 2.4 Cosa cambia, sezione per sezione (dal codice di oggi)

| Oggi                                                          | Proposta                                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| «Situazione attuale»: 4 fatti + gruppi + tabella              | si divide in **Stato** (fatti, con date e link) e **Problemi aperti** (gruppi + tabella)                           |
| —                                                             | nasce **Da fare adesso**: il prerequisito già noto (ordine senza sede) e le coppie senza base; vuoto → non compare |
| «Configurazione»: badge, ambiti, sedi, prossimi passi, azioni | diventa **Connessione**, in fondo; le azioni distruttive in una **zona sensibile** con tono proprio                |
| «Percorso prima connessione» in mezzo                         | **Prima connessione**: in cima finché in corso (con Connessione sotto); conclusa, una riga chiusa in fondo         |
| «Sincronizzazione»: 4 blocchi titolo+paragrafo+pulsante       | **Comandi**: 4 righe con la stessa griglia (nome · cosa fa · ultimo esito · pulsante); qui vive «Allinea»          |
| «Stato ed esiti»: errori, feedback, webhook, interruttore     | **Notifiche e aggiornamenti automatici**; gli esiti di un comando restano accanto al comando (banner in riga)      |
| tabella: colonna Azione = frase lunga, 75 volte               | colonna Azione = forma breve, premibile dove è un link; la frase una volta nel gruppo                              |

Sul **telefono** l'ordine è lo stesso; le righe di Stato e Comandi diventano card a due righe
(etichetta/valore sopra, azione sotto a tutta larghezza); la tabella è già a card sul motore.

### 2.5 Che cosa NON cambia

Nessun comando nuovo, nessun automatismo nuovo, nessuna correzione automatica dei dati. I
comandi restano quelli decisi (un solo comando manuale sulle quantità, `docs/27` §4-bis); i
cancelli dei permessi restano dove sono; la lettura della pagina resta senza effetti; i testi
delle cause restano quelli del vocabolario (`shopify-setup-situazione.util`); il **motore
tabella non si tocca** per adattarlo al mock (la colonna Azione cambia nel modello colonne
della pagina, non nel motore). Si riusano i contenitori e i componenti condivisi che ci sono.
Cambiano la **divisione**, l'**ordine**, i **titoli** e la **forma** di ciò che c'è già.

## 3. Deciso dal proprietario il 13/09/2026

Impostazione generale confermata — stato distinto dai problemi; problemi raggruppati con
conseguenza e azione comprensibile; comandi con la stessa struttura; storico della prima
connessione chiuso dopo l'attivazione; azioni sensibili separate dalle operazioni quotidiane —
con cinque correzioni, tutte applicate al mock qui sopra prima di costruire:

1. **un punto chiaro per eseguire «Allinea»**; gli altri richiami portano al comando e ne
   dichiarano il perimetro, senza farlo sembrare un'azione sulla singola riga;
2. **«Da fare su Shopify» resta distinto da «nessuna azione necessaria»**: gli articoli non
   stoccati non diventano informativi da soli;
3. **«Da fare adesso» è un suggerimento basato sui blocchi esistenti**, non un workflow nuovo;
   se è tutto a posto non propone niente;
4. **durante la prima connessione restano accessibili i rimedi** per connessione e permessi;
5. **le fasi restano tre**.

Verifica a schermo richiesta, prima di chiudere: **percorso iniziale**, **sincronizzazione con
problemi**, **sincronizzazione senza problemi**.

## 4. La prima costruzione (13/09, 10:45–11:40) — superata dalle cinque schede di §5

⛔ Qui c'era la descrizione della pagina UNICA sulle tre domande (Stato · Da fare adesso ·
Problemi aperti · Comandi · Notifiche · Connessione · Prima connessione in fondo), costruita e
vista a schermo nelle tre situazioni. **Il proprietario l'ha respinta lo stesso giorno**
(13/09, 12:10: «tutto in un'unica pagina lunga non funziona da gestionale») e ha chiesto la
navigazione a schede di §5: il testo è stato tolto, resta qui sotto ciò che di quella tornata
vale ancora — i componenti e le correzioni sono state riusate, non rifatte.

**Corretto dopo il primo sguardo del proprietario** (13/09, 11:20 — «linee corte verticali nere
già abolite altrove e rimesse; il titolo sotto e non vicino a Indietro; graficamente elementare,
da sito vetrina»): ⛔ le barrette in `--color-primary` sui titoli erano state RESPINTE il
01/09 (`_anagrafica.scss`) e la regola §7-bis di `regole-stile-ui` le prescriveva ancora —
corretta la regola, tolte dai due pannelli, guardia `check:barrette-titolo` nel lint; il
colore sta sul testo del titolo col filo tinto. Densità da gestionale: pulsanti di barra (28px,
12px) su tutto il pannello, sezioni a 8px, etichette di Stato con la grammatica delle label
(11px maiuscole), stati in **variante piatta** (§5: 12px/500, colore sul testo) e non pastiglie
a ogni riga, comandi come righe separate da un filo di cella e non scatole nella scatola,
descrizioni di una riga, card della pagina a padding denso, accento delle card dei gruppi
smorzato al 55% come nel motore.

**Verifiche**: pannello 40/40 · problemi 5/5 · pannello percorso 11/11 · pagina Shopify ·
util problemi 7/7 · situazione API 11/11 · `check:types` 0 · `npm run lint` verde con 61
guardie · e2e 11/11 · **regressione completa tutta verde** (13/09, 11:50): frontend
3.513/3.513, componenti 1.394/1.394, API unitaria 2.787/2.787. ⚠️ Preesistente e non toccato: `e2e/allinea-pannello.spec.ts:149` ha un
errore di tipo (`sbloccaSecondo?.()` su `never`) che `tsc -p e2e/tsconfig.json` segnala;
Playwright non lo compila e la prova gira.

## 5. Le CINQUE SCHEDE — decise dal proprietario il 13/09/2026, costruite e riviste lo stesso giorno

> **Una navigazione da gestionale con cinque schede stabili**, nell'ordine del lavoro:
> **Prima connessione** (sempre visibile, tre fasi, comandi spenti dopo l'esecuzione con il
> motivo) · **Sincronizzazione automatica** (un flusso per riga: attivo, limitato, sospeso, da
> verificare — e da che cosa) · **Operazioni manuali** (cosa fa, su quali dati, ultimo esito,
> pulsante) · **Problemi ed esiti** (le cause raggruppate, l'elenco sul motore, gli esiti) ·
> **Connessione e sedi** (negozio, accesso, sedi; disconnessione e cambio negozio in fondo).
> Prima dell'attivazione si apre la prima, dopo la seconda. Nessun motore, regola, permesso o
> effetto cambia: cambia dove si trova ogni cosa.

Il mock approvato: `https://claude.ai/code/artifact/818d3818-feb3-4f63-b868-c254b6a7b948`.

### 5.1 Gli otto punti di rifinitura (proprietario, 13/09, 12:40) — tutti applicati

| #   | Chiesto                                                                                                                                                                                                     | Fatto                                                                                                                                                                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | colonne coerenti funzione · descrizione · stato/esito · comando, vicine                                                                                                                                     | una griglia SOLA per tutte le righe di una scheda (`subgrid` da `lg`; sotto, impilate): a 1280 ogni riga faceva griglia a sé e l'ultima colonna seguiva il proprio pulsante — misurato a schermo                                                                                                             |
| 2   | testi brevi e naturali                                                                                                                                                                                      | «Operazioni avviate manualmente», «Aggiornamenti automatici tra Shopify e VestiFlow», «L'invio delle quantità è sospeso», i termini tecnici nei dettagli (`fulfillment_orders/moved` sta nel «perché», non nel titolo)                                                                                       |
| 3   | gerarchia: nomi e stati leggibili, date e id secondari, mono solo per i codici                                                                                                                              | nome della funzione semibold pieno, descrizione tenue, stato con la sua parola e il perché; il dominio in monospazio, i nomi delle sedi no; una sola forma di data                                                                                                                                           |
| 4   | colori con un significato preciso; «attiva» non nasconde le limitazioni                                                                                                                                     | verde = operativa; ambra = limitata / da verificare; neutro = sospesa, storico, mai eseguita; rosso solo errori e azioni distruttive. La parola di stato della scheda dice **limitata**, non «attiva»                                                                                                        |
| 5   | Prima connessione consultabile, non sbiadita                                                                                                                                                                | le tre fasi leggibili; solo i comandi non più utilizzabili sono spenti, col motivo; «conclusa il …» e l'esito (riuscita con N esclusi / allineamento fermo / trasferimento interrotto) sono due stati; le scelte sono la fotografia di allora, le sedi di oggi stanno in «Connessione e sedi»                |
| 6   | Problemi: niente nomi troncati nei gruppi; più spazio ad articolo e variante; l'elenco usa lo spazio; esclusioni volute distinte dai casi da risolvere                                                      | intestazioni dei gruppi senza esempi; colonne «Articolo / ordine» (respira) e «Variante»; `block-size` pieno del riquadro; tono **da valutare** (neutro) per «su Shopify» e «nessuna azione», ambra per il resto; i rimandi vanno al comando e dichiarano il perimetro («tutti gli articoli, tutte le sedi») |
| 7   | ogni operazione: cosa fa, su quali dati, ultimo esito, pulsante; attesa visibile senza invitare a ripetere; sedi «Attiva su Shopify» distinta da «Collegata a VestiFlow»; testo della rimozione dati esatto | righe con perimetro in chiaro; «Controllo in corso — N di M …; attendi, non ripetere il comando»; tabella sedi con «Su Shopify» e «Sede VestiFlow»; il testo dice che la rimozione è oggi sospesa sull'API                                                                                                   |
| 8   | verifica sulla pagina reale, nella matrice                                                                                                                                                                  | §5.3                                                                                                                                                                                                                                                                                                         |

### 5.2 La revisione del proprietario sulla pagina reale (13/09, 13:05–13:15) — e le correzioni

Guardata su `localhost:4212` con i dati del collaudo (82 problemi, 5 location):

| Visto                                                                      | Causa                                                                                                                                        | Correzione                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| «lo sfondo grigio non mi piace, soprattutto sotto alle scritte»            | `.setup__fase` non corrente aveva `--color-surface-soft`: a percorso concluso tutte e tre le fasi erano grigie                               | fasi su superficie bianca, divise dal bordo; la corrente col bordo di fuoco                                                                                                                                                                                                                                         |
| «i tab non si capisce che sono tab; da mobile non si capisce che scorrono» | `app-nav-tabs` dentro la card, sotto «Integrazione Shopify» e la riga di stato: una riga fra le altre; sullo scorrimento la barra è nascosta | schede a **livello di pagina**, sotto Indietro + titolo, fuori dalla card (la forma del mock); **ombra sui bordi** quando c'è contenuto fuori vista (quattro fondi `local`/`scroll`, niente script); la scheda attiva **entra in vista da sola** a ogni navigazione; hover con filo                                 |
| «la grafica del mock era leggermente meglio»                               | il mock aveva lo stato in maiuscoletto tenue e il conteggio a pastiglia; l'attuale «· conclusa», «· 87» in riga                              | `NavTab` ha `stato`, `tono` e `conteggio`: «Prima connessione CONCLUSA», «Sincronizzazione automatica LIMITATA» (ambra), «Problemi ed esiti (82)» a pastiglia; la card contiene **solo** la scheda aperta, con titolo, sottotitolo e frase d'apertura; via il titolo doppio e il sottotitolo che elencava le schede |
| «una leggera divisione ottica in più, qualche spazio» (Problemi)           | cause, barra e tabella attaccate                                                                                                             | un titolo con filo sopra per l'elenco («Tutti i problemi, uno per riga · N in tutto»), passo maggiore fra le cause                                                                                                                                                                                                  |
| «da mobile diventa impossibile la gestione con card enormi»                | la card ripeteva effetto e azione per esteso — identici per ogni riga della causa, già scritti nel gruppo                                    | card **compatta**: nome (link) e sede, variante e causa; effetto e azione stanno una volta nel gruppo. Da ~150px a ~55px per card (misurato: nessuna sopra i 90px)                                                                                                                                                  |
| breadcrumb «Impostazioni › Ordini Shopify › sincronizzazione»              | «shopify» prendeva l'etichetta di Vendite; la scheda non aveva etichetta                                                                     | «Impostazioni › Shopify › Sincronizzazione automatica», prova propria del breadcrumb (7)                                                                                                                                                                                                                            |
| il testo vecchio «NESSUNA AZIONE» sulla pagina reale                       | l'API di collaudo (avviata alle 10:19) teneva in memoria i moduli di allora; `dist/` era già ricompilato alle 10:46                          | riavviata alle 13:26: un processo Node non ricarica i file                                                                                                                                                                                                                                                          |

⭐ **Due cose trovate costruendo, non chieste:**

- **la rotta senza scheda ricreava la pagina.** `shopify` e `shopify/:scheda` erano due rotte
  con lo stesso componente: il reindirizzo alla scheda predefinita distruggeva la prima istanza
  — e con lei il banner del ritorno OAuth (`?shopify=setup`), misurato in
  `prima-connessione.spec`. Ora `shopify` **reindirizza a `shopify/auto`** e il pannello
  sostituisce «auto» con la scheda predefinita appena lo stato è noto (connessione letta;
  percorso letto o fallito): una pagina sola, nessuna ricreazione. Ad attivazione riuscita si
  apre la Sincronizzazione automatica;
- **una notifica mancante fermava tutti e quattro i flussi.** Le due notifiche assenti sono
  dei fulfillment order: «da verificare» sono gli **Ordini**; le Quantità sono «limitate» dagli
  ordini senza sede; catalogo e clienti restano attivi. L'indirizzo sbagliato li riguarda tutti.

### 5.3 La matrice di verifica (§5.1 punto 8) — `e2e/situazione-shopify.spec.ts`, 9 prove

| Caso                                | Che cosa si controlla                                                                                                                                                                                                                                                                                                                                                                                                                                              | Esito                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| scrivania 1280                      | le cinque schede, i rimandi che non eseguono (`sync/inventory/align` mai chiamato), le righe, il breadcrumb                                                                                                                                                                                                                                                                                                                                                        | ✅                    |
| scrivania ampia 1800                | le righe non si stirano: stato e comando restano vicini alla descrizione (< 400px di scarto)                                                                                                                                                                                                                                                                                                                                                                       | ✅                    |
| telefono verticale 390              | schede a scorrimento, card compatte (nessuna sopra 90px), niente scorrimento orizzontale                                                                                                                                                                                                                                                                                                                                                                           | ✅                    |
| telefono orizzontale 844×390        | leggibile, niente sbordo                                                                                                                                                                                                                                                                                                                                                                                                                                           | ✅                    |
| **emulazione** zoom 200% + tastiera | **finestra CSS 640×450 con rapporto di pixel 2** (`deviceScaleFactor: 2`, contesto proprio): riproduce la GEOMETRIA di una finestra 1280×900 al 200% — regole di larghezza e densità doppia — e Tab/Invio fra le schede. ⚠️ **Non è lo zoom del browser**: Playwright non lo imposta, e viewport più densità non bastano a dichiararlo provato (precisazione del proprietario, 13/09). Lo zoom vero (Ctrl+) è un controllo a mano, in `DA-FARE` «Controlli visivi» | ✅ emulato · ⏸ a mano |
| nomi lunghi                         | la tabella taglia a colonna senza sbordare; la card mostra il nome intero                                                                                                                                                                                                                                                                                                                                                                                          | ✅                    |
| zero problemi                       | scheda «attiva» in verde, pastiglia a zero, «Nessun problema aperto»                                                                                                                                                                                                                                                                                                                                                                                               | ✅                    |
| caricamento ed errore               | scheletro, poi stato di errore con «Riprova»                                                                                                                                                                                                                                                                                                                                                                                                                       | ✅                    |
| comando in corso                    | «in corso» sulla riga, pulsante spento, poi «completata»                                                                                                                                                                                                                                                                                                                                                                                                           | ✅                    |

Permessi limitati in `impostazioni-shopify.spec` (6), prima connessione in corso e conclusa in
`prima-connessione.spec` (2): **17/17**. Il resto: pannello 48/48, problemi, percorso,
schede condivise, breadcrumb; `check:types` 0; `npm run lint` verde; **frontend
3.528/3.528, API 2.787/2.787** (13/09, 13:40).

### 5.4 I cinque residui della revisione sulla pagina reale (proprietario, 13/09, 15:40) — chiusi

_«Chiuderei soltanto questi residui, poi tornerei al collaudo Shopify. Non serve un'altra
riprogettazione.»_

| #   | Residuo                                                                                                                                                      | Chiusura                                                                                                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | la tabella Problemi troppo compressa a 1280 (8 colonne)                                                                                                      | di serie **cinque** colonne — articolo, variante, sede, causa, azione — con causa e azione nella forma breve che già c'era; «Tipo» (si legge nel gruppo), Conseguenza e Rilevato si riaccendono da «Colonne». Nessun motore toccato                                                                                   |
| 2   | «75 articoli»                                                                                                                                                | «75 **combinazioni variante/sede** da allineare: la quantità non viene inviata» (singolare accordato)                                                                                                                                                                                                                 |
| 3   | testi aggiunti e non sostituiti: Sincronizzazione con titolo + sottotitolo + intro che si ripetono; «Esito non registrato: compare qui dopo l'esecuzione» ×3 | un titolo e **una** riga; «**Nessun esito disponibile**» nelle quattro righe                                                                                                                                                                                                                                          |
| 4   | Prima connessione conclusa: la fase 1 mostrava ancora le due spiegazioni intere; «1 collegate»                                                               | a percorso concluso la **scelta** si legge nel titolo, senza pulsanti; la spiegazione della **sola** direzione scelta è un dettaglio richiudibile («Che cosa ha fatto …»); sedi ed esito restano visibili; «1 **collegata** · 4 lasciate fuori» (`conteggioSedi`)                                                     |
| 5   | «Disconnetti e rimuovi dati» acceso mentre il testo dice che l'API rifiuta                                                                                   | **spento**, con il motivo accanto al pulsante (`aria-describedby`: «Sospeso: l'API rifiuta la rimozione dei dati importati finché non esiste lo scollegamento che li conserva») e non più ripetuto nel paragrafo sopra. ⛔ La purga non è stata costruita: `shopify.spec` prova il comando spento, il wizard è `skip` |

**Le due precisazioni sulle verifiche dichiarate**: la prova dello zoom è dichiarata per ciò
che è — un'**emulazione** (640×450 a rapporto di pixel 2, §5.3), con lo zoom vero del
browser da controllare a mano — e le schede condivise fuori da Shopify hanno un controllo mirato —
`e2e/nav-tabs-cassa-magazzino.spec.ts` (2): Cassa («Aree della Cassa») e Magazzino («Sezioni
magazzino») a 1280 e a 390, una sola scheda attiva, **nessuna** pastiglia né conteggio (li
passa solo il pannello Shopify), sul telefono scorre la barra e non la pagina; scatti in
`test-results/nav-tabs/`.

Prove: pannello 107/107, canale 221; e2e isolate del pannello 17/17 + rettifiche 3 +
nav-tabs 2; `check:types` 0.

⚠️ **Aperto**: `e2e/allinea-pannello.spec.ts:149` resta l'errore di tipo preesistente.
