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

## 6. La leggibilità dopo il rilascio — mandato del proprietario del 14/09/2026, costruito lo stesso giorno

_Visto sul negozio vero dopo Disconnetti → Connetti: «è ancora confusionale»; poi, sulla
tendina: «è normale avere anche "crea magazzino test 3"?»; «segna che va sistemato, porta a
confondere»._ Ramo `fix/impostazioni-shopify-leggibilita` da `develop` `209c263f`, nella
copia separata. ⛔ Fuori dal perimetro, per mandato: pausa, «Rinnova autorizzazione», regole
di abbinamento, motore di sincronizzazione, dati di prova.

### 6.1 Che cosa era falso o fuori posto, misurato sul codice prima di toccarlo

| Sulla pagina                                                                                                                | Che cosa faceva davvero il codice                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| «Negozio collegato. Ordini, clienti e giacenze si aggiorneranno … quando attivi gli aggiornamenti»                          | frase fissa del banner `connected`: detta anche a un negozio con gli aggiornamenti **già attivi**                                                                                                                                                                                                                                                                                                                                                                                                                           |
| «Negozio collegato, con problemi aperti — Vedi problemi»                                                                    | rimandava ai «Problemi» anche quando la causa era una **notifica non registrata**, che sta nella Sincronizzazione                                                                                                                                                                                                                                                                                                                                                                                                           |
| il ritorno da Shopify con `channel_not_enabled`, `shop_owned_elsewhere`, `shop_identity_unavailable`, `connection_conflict` | l'API li manda dal 13/09 (`shopify-oauth-ritorno.util`), il pannello leggeva solo `setup · connected · error · disconnected · shop_change_blocked`: pagina **muta**, parametro appeso all'indirizzo                                                                                                                                                                                                                                                                                                                         |
| «Sedi non attivate — Sincronizza le location da Shopify e seleziona fino a N sedi operative»                                | testo del flusso vecchio (il sync creava le sedi, l'operatore ne «selezionava» alcune); dall'11/09 il sync non crea niente e la scelta è per location                                                                                                                                                                                                                                                                                                                                                                       |
| riquadro «Prossimi passi» (sincronizza · importa · attiva)                                                                  | compariva a ogni ritorno da OAuth, anche a negozio attivo, sotto le scelte sulle sedi                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| tendina: Lascia · **Crea la sede «Magazzino test 3»** · Collega a «Magazzino test 3»                                        | nessuna consapevolezza dell'omonima: «Crea» accanto a una sede che si chiama già così                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| «Sincronizza location», «Ripristina connessione», senza un quando                                                           | il primo **legge** le location e riconosce le sedi collegate (`importedCount` sempre 0); il secondo — verificato su `clearErrors` — **non ripristina niente**: azzera l'ultimo errore sulla connessione, azzera gli errori salvati su prodotti e sedi e riporta quelli in stato `error` a `out_of_sync`, cioè li fa **ritentare**; `healStaleErrorStatus` rimette la connessione da `error` a `connected` se la credenziale c'è. Le notifiche mancanti non le tocca (si leggono dalle registrazioni vere), le cause nemmeno |

### 6.2 Le decisioni applicate

| #   | Decisione                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Dove                                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| A   | **la scheda che si apre segue lo stato**: percorso in corso → Prima connessione; **una location del negozio che attende una scelta** → Connessione e sedi; altrimenti Sincronizzazione. ⛔ Una location **lasciata fuori apposta** non conta come «da decidere» (precisazione del proprietario)                                                                                                                                                                                                                                                      | `schedaPredefinita`, `locationDaDecidere`, `locationLasciateFuori`                    |
| A   | **il banner «collegato» dice il vero**: aggiornamenti attivi o sospesi (e dove si riattivano), quante location attendono una scelta; con un avviso, il **testo** dell'avviso e il rimando alla scheda dove sta la causa — «Vedi le notifiche» (Sincronizzazione) se mancano registrazioni o il codice è `webhook…`, «Vedi i problemi» altrimenti                                                                                                                                                                                                     | `bannerCollegato`                                                                     |
| F   | **i quattro rifiuti dell'OAuth hanno un testo** — che cosa è successo, **che nulla è stato scritto**, che fare — col dominio del negozio (`?shop=`); tono errore per «già di un'altra azienda» e «canale non previsto», avviso per i due da ritentare; `shopify` e `shop` tolti dall'indirizzo, connessione riletta                                                                                                                                                                                                                                  | `testoRifiutoOAuth`, `negozioRifiutato`, sottoscrizione a `queryParamMap`             |
| B   | «Prossimi passi» **tolto**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | template, SCSS                                                                        |
| C   | stato sedi: «**Nessuna sede collegata** — Per ogni location del negozio scegli nella tabella: collega una sede, creane una nuova o lasciala fuori. Il piano prevede …»; «**Sedi collegate** — N sedi collegate a una location del negozio · ultima lettura …»; sotto, i conteggi «**N location da decidere**» (avviso) e «**M lasciate fuori** — per scelta, non da configurare» (neutro)                                                                                                                                                            | `location-setup-status.util`, template                                                |
| D   | tendina nell'ordine in cui si decide: **Collega alla sede «…»** per ogni sede libera (o già sua), con **l'omonima per prima e dichiarata «stesso nome della location: suggerita, non applicata»**; poi **Crea una nuova sede «…»** con il dettaglio («una sede in più, oltre a quella con lo stesso nome» se l'omonima c'è); poi **Lascia fuori da VestiFlow** («nessuna sede: non risulta da configurare»). ⛔ **Mai applicata da sola**: senza scelta il menu resta su «Decidi…» e niente viene emesso                                             | `opzioniSede`, `stessoNome` (`localeCompare` it, `sensitivity: base`, spazi ai bordi) |
| E   | **«Rileggi le location dal negozio»** — «Dopo aver aggiunto, rinominato o disattivato una location su Shopify. Aggiorna l'elenco e, per le sedi collegate, nome e indirizzo letti dal negozio; non crea sedi e non cambia le scelte già fatte. Una location sparita dal negozio viene segnalata: la sede resta»; esito «Lette N location dal negozio: M collegate a una sede. Per le altre la scelta … è nella tabella «Sedi»»                                                                                                                       | template, `formatLocationSyncFeedback`                                                |
| E   | **«Azzera le segnalazioni di errore»** — non «Segna l'avviso come letto»: il comando **cambia lo stato del prossimo invio** (i prodotti e le sedi in errore tornano «da allineare» e vengono ritentati), quindi «letto» sarebbe falso quanto «ripristinata». Il testo accanto dice gli effetti e che **non corregge la causa**; l'esito: «Segnalazioni di errore azzerate. N prodotti e M sedi tornano «da allineare»: verranno ritentati al prossimo invio. Le cause non sono state corrette: se il problema c'è ancora, la segnalazione ricompare» | template, `formatClearErrorsFeedback`                                                 |
| G   | messaggio API `location_sync_failed` allineato al nome nuovo del comando                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `shopify-user-error.util.ts`                                                          |

⚠️ **Una correzione non richiesta, nominata**: `select-menu` leggeva a uno screen reader ogni
dettaglio di voce come «SKU …» — il prefisso era della prima voce con dettaglio (le varianti)
ed era già sbagliato per le aliquote IVA e per «Fornitore»/«Cliente». Con i dettagli delle
scelte sulle sedi avrebbe detto «SKU nessuna sede». Ora il nome accessibile è «etichetta,
dettaglio»; nessuna prova dipendeva dal prefisso.

### 6.3 Prove

Pannello 60 (48 + 12: i quattro rifiuti, il banner con aggiornamenti attivi/sospesi e con
avviso — rimando alle notifiche o ai problemi —, la scheda d'apertura con una location da
decidere e con una lasciata fuori, il comando che azzera con i suoi testi prima e dopo, e
**dopo «Azzera» il problema ancora presente resta scritto**: cancellato l'errore salvato, il
banner dice «Con un avviso: 2 notifiche non registrate su Shopify» con «Vedi le notifiche»);
scelte sulle sedi 6 (ordine e dettagli, l'omonima suggerita e mai applicata); pannello di
prima connessione 12 (l'ordine nuovo della fase 2); `location-setup-status.util` 5 (nuova:
la funzione non ne aveva); e2e `impostazioni-shopify` e `prima-connessione` aggiornate alle
etichette, e la seconda **armata** sul telefono: chiede al browser chi sta sotto il centro di
ogni voce della tendina (§6.4). Frontend 3.568, `check:types` 0, `npm run lint` verde.

### 6.4 L'anteprima locale (mandato: «fammi vedere PRIMA di merge e deploy»)

Build con l'auth finta (configurazione `e2e`) in una cartella fuori dal progetto, puntata a
un **finto server** sulla 4215 che risponde da sé a `/api/v1/**` con scenari in memoria —
nessun database, nessuno Shopify, **nessuna chiamata alla 3000**. Indice degli scenari su
`http://127.0.0.1:4215/__anteprima`; accesso `owner@vestiflow.test`. Gli scatti (scrivania
1280, telefono 390) stanno in `scratchpad/anteprima-scatti` della sessione.

**Quattro difetti trovati guardando, non ragionando** — nessuno dei quattro faceva fallire
un test:

| Visto                                                                                                                                             | Corretto                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| «Collega alla sede «Snow C…»: il pulsante della scelta tagliato a 224px, le quattro colonne uguali (259px, `table-layout: fixed`)                 | larghezze per colonna sull'intestazione (30 · 12 · 36 · 22 %), pulsante alla misura di un nome (`--field-w-xl`): misurato 310 · 124 · 372 · 228, pulsante 352                                                                                                                                                       |
| dopo «Azzera le segnalazioni» il banner diceva «Con un avviso.» senza dire quale                                                                  | il banner «collegato» è **vivo**: legge l'ultimo errore salvato o, se non c'è, le notifiche che risultano non registrate; il tono segue (avviso se c'è un rimando, verde se no)                                                                                                                                     |
| collegata la quarta sede dalla tabella, lo stato sopra diceva ancora «3 sedi collegate»                                                           | dopo una scelta il pannello avvisa la pagina (`locationsChanged`), che rilegge le sedi                                                                                                                                                                                                                              |
| **sul telefono la tendina della scelta non si vedeva**: pannello nel DOM (y 477, 5 voci), cella-card con `overflow: hidden`, schermata senza voci | ⛔ dal 13/09 il commento diceva «sul telefono le righe sono card, niente le ritaglia»: falso, la cella eredita il taglio a colonna. La cella che ospita la tendina lascia uscire il pannello (`overflow: visible`). Falsificato sul bundle di anteprima: con `hidden` nessuna voce è colpibile, con `visible` tutte |

⚠️ **«Visibile» per Playwright non è «si vede»**: un elemento ritagliato ha una misura ed è
`visible`, e la prova e2e sul telefono cliccava le voci — verde — mentre a schermo non
c'erano. La guardia nuova chiede `document.elementFromPoint` al centro di ogni voce.

### 6.5 Il pannello della tendina in funzione dello spazio — rilievo del proprietario sull'anteprima (14/09, sera)

_«Il menu misura 352 px, parte da x=50 e termina a x=402: supera lo schermo e taglia parte
dei testi.»_ (scenario «da-decidere», 390×844, tendina «Magazzino test 3»). Il pannello di
`select-menu` è largo `max-content` fino al tetto (`--select-menu-panel-max-width`, 352px) e
**si ribaltava solo se dall'altra parte c'era spazio**: su uno schermo stretto non ce n'era da
nessuna parte, e usciva. Corretto nel componente condiviso, quindi per ogni tendina:

| Deciso all'apertura, misurando                                      | Effetto                                                                                                                                                                               |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ci sta a destra del trigger                                         | come prima                                                                                                                                                                            |
| non a destra, sì a sinistra                                         | si ribalta, come prima                                                                                                                                                                |
| da nessuna parte, ma **ci sta nel confine** (finestra o scrollport) | si spinge dentro: bordo destro a 8px dal confine                                                                                                                                      |
| **più largo del confine**                                           | si stringe allo spazio (meno 8px per lato), allineato al bordo sinistro; classe `--stretto`: **le etichette vanno a capo** invece di finire in «…», i dettagli spezzano fra le parole |

Due difetti preesistenti trovati misurando, corretti nello stesso componente:

- **il pannello ereditava il `white-space` della cella** (`nowrap`, dal taglio a colonna): un
  dettaglio più lungo del tetto restava su una riga e usciva — a 390px casella 302, testo 343,
  fine del testo a x=410. Ora il pannello dichiara `white-space: normal`;
- **il minimo del pannello FISSO era «100%» della FINESTRA** (per `position: fixed` il 100% è
  il viewport): sulla tabella delle sedi a 1280 il pannello era largo 1280 da x=748, tagliato
  dal bordo. Ora il componente dà al CSS la misura del trigger (`--select-menu-trigger-w`),
  che vale come minimo salvo un minimo dichiarato dal contenitore (i filtri di colonna col
  calendario, `--select-menu-panel-min-width`, invariati);
- `word-break: break-all` sui dettagli — pensato per i codici — spezzava le frasi in mezzo a una
  parola («collegata a questa l / ocation»): ora `overflow-wrap: anywhere` con `word-break:
normal`, cioè fra le parole e dentro una parola solo se da sola non ci sta.

**Misurato dopo** (anteprima, scenario «da-decidere», trigger a x=50): 390 → pannello 39–382
(spinto dentro); 360 → 9–352; 320 → **stretto** 8–312, etichette a capo, ogni voce intera;
1280 → 352px, non stretto, pannello = trigger.

**Prove**: `e2e/prima-connessione.spec.ts` «la tendina della scelta sta nello schermo e si
legge intera a 320, 360 e 390, come sulla scrivania» — per ogni larghezza e per ogni voce:
dentro lo schermo, colpibile (`elementFromPoint`), **testo intero** (`scrollWidth` entro
`clientWidth` di etichetta, dettaglio e pannello); a 1280 non stretto. Falsificata spegnendo
lo stringimento: rossa a 320 («esce a destra: right 419»). Suite e2e isolata intera (resa
desktop degli elenchi, filtri di colonna, «resta dentro il contenitore») verde.

**Gli altri usi del nome accessibile «etichetta, dettaglio»** (§6.2, correzione nominata):
verificati con una prova del componente condiviso (`select-menu.component.spec.ts`, nuova:
variante «Maglia…, MAG-M-R · EAN …», IVA «22, 22% ordinaria», controparte «Rossi Srl,
Fornitore», scelta sulle sedi) e con un uso reale fuori da Shopify — la controparte del
Movimento di magazzino (`movement-form.component.spec.ts`: «Rossi Srl, Fornitore», «Anna
Bianchi, Cliente»). Gli altri consumatori con dettaglio — le varianti nei suggerimenti di
Documento di vendita, Operazione di magazzino, Trasferimento, Ordine cliente; il Codice IVA
di «Imposta IVA a tutte le righe» — passano dallo stesso `optionAriaLabel`: per le varianti lo
SKU resta il primo dato annunciato, senza più la parola «SKU» davanti (che visivamente non
c'era). Nessuna prova dipendeva dal prefisso.

## 7. La revisione visiva delle cinque schede — proposta nell'anteprima (14/09/2026, sera), approvata e APPLICATA lo stesso giorno

_Mandato del proprietario: «in generale la pagina non è male e non voglio ricominciare da zero.
Il problema è la divisione INTERNA e la UI di ogni scheda: contenuti ammassati, informazioni
con lo stesso peso, spiegazioni mescolate ai comandi. L'impressione è ancora di un sito
vetrina, non di un gestionale operativo.»_ Cinque schede, funzioni, comandi, abbinamenti e
motore invariati; le correzioni di §6 conservate; pausa esclusa.

La proposta è stata mostrata come pagina statica (`/__proposta`, stessi token dell'app, scenario
«problemi-nomi-lunghi»: attivata con allineamento fermo, 87 problemi in 6 cause, 2 notifiche e 1
permesso mancanti, sedi e articoli con nomi lunghi) e **approvata come base** dal proprietario:
_«mantieni questa organizzazione e applicala al frontend, conservando le correzioni già fatte»_,
con tre punti da sistemare prima (§7.5) e poi l'intervento sulla composizione mobile (§8).
L'applicazione è nel ramo, verificata con la stessa anteprima (`/__anteprima`, scenario
`problemi-nomi-lunghi`), sui dati simulati del server finto.

### 7.1 Che cosa si vede oggi, con quei dati (misurato sugli scatti `oggi-*`)

| Scheda             | Il difetto di organizzazione                                                                                                                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prima connessione  | l'intro ripete i numeri che stanno nelle fasi; tre card numerate con dentro paragrafi, l'esito in un riquadro dentro la fase 3, e in fondo un pulsante «Attiva la sincronizzazione» spento: conclusa, sembra da rifare |
| Sincronizzazione   | titolo + sottotitolo, poi l'errore in rosso che ripete ciò che dice la riga Ordini; le quattro righe hanno descrizione e stato con lo stesso peso; i comandi sulle notifiche stanno chiusi in un dettaglio             |
| Operazioni manuali | griglia già uniforme, ma la descrizione fonde «che cosa fa» e «su che cosa»; manca il «quando serve»; l'esito senza data                                                                                               |
| Problemi ed esiti  | sei card bordate con tre righe ciascuna (EFFETTO / AZIONE) prima dell'elenco: 700px di card su scrivania, il triplo sul telefono; gli esiti delle operazioni in coda, con la stessa veste dei problemi                 |
| Connessione e sedi | un blocco solo: fatti del negozio, dettaglio permessi, comando che azzera, stato sedi, comando di rilettura, tabella, disconnessione — senza gruppi riconoscibili; sul telefono 2.300px                                |

### 7.2 La grammatica comune (tutte le schede)

| Elemento                   | Forma                                                                                                                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **sezione**                | titolo 14px/700 in `--color-primary` con il filo tinto di brand sotto (la forma delle anagrafiche, §7-bis delle regole), a destra un meta breve; **nessuna card per sezione**                                                               |
| **stato**                  | pastiglia piatta con tre toni soltanto — verde (attivo/ok), ambra (attenzione/limitato/fermo), rosso (errore) — e neutro per «sospeso / nessun esito»; il motivo su UNA riga, solo quando c'è                                               |
| **riga operativa**         | griglia a quattro colonne, uguale in Sincronizzazione e Operazioni: nome + direzione (19 %) · descrizione (il resto) · stato + motivo (25 %) · azione (larghezza fissa). Sul telefono ogni riga è una card con il comando a tutta larghezza |
| **fatti**                  | `dl` a colonne (etichetta maiuscola 10px, valore 13px, nota 12px sotto): Negozio, Notifiche, riepilogo della Prima connessione                                                                                                              |
| **comando col suo quando** | pulsante a sinistra (larghezza fissa), accanto una riga: **Quando:** … / che cosa fa / che cosa NON fa. I dettagli lunghi in un `details` «Che cosa fa …»                                                                                   |
| **fascia di stato**        | una sola per scheda, in cima, colorata secondo il tono, con i comandi che risolvono a destra (Sincronizzazione: le notifiche; Connessione: l'avviso)                                                                                        |
| **tabelle**                | la grammatica dei riepiloghi (intestazione grigia 11px maiuscola, fili, 12px); sul telefono card con etichetta:valore — come fa già il motore                                                                                               |
| **approfondimenti**        | `details` con freccia, testo in un riquadro tenue: mai una conseguenza importante lì dentro (quelle stanno nello stato o nel «quando»)                                                                                                      |

### 7.3 Scheda per scheda

**Prima connessione (conclusa).** In testa: titolo, «conclusa il …» (verde), e a destra l'esito
aperto («allineamento delle quantità fermo · 2 ordini senza sede: vedi problemi ›»). Sotto, i
**quattro fatti** (direzione, catalogo, sedi, ordini) e le **tre fasi come stepper**: ✓ numero,
titolo, la scelta o il risultato su una riga, la data a destra, e un `details` per fase (che cosa
ha fatto la direzione; le scelte location per location; anteprima ed esito). ⛔ **Nessun
pulsante**: tolto «Attiva la sincronizzazione» spento con «già attivata»: una cosa conclusa non
mostra comandi. Durante il percorso la stessa scheda ha la fase corrente aperta (sfondo tenue,
i suoi controlli, «Vai al controllo») e le altre chiuse — variante «Vedi com'è DURANTE il
percorso» nella proposta.

**Sincronizzazione automatica.** In cima la **fascia di stato** («da verificare»: attivi con 2
notifiche su 10 non registrate — permesso mancante; ultimo evento; verificate alle) con
«Verifica ora» e «Registra le notifiche mancanti» accanto. Poi **i quattro flussi** in griglia:
flusso e direzione · che cosa si aggiorna · stato con il motivo del blocco solo dove c'è ·
rimando. Poi la sezione **Notifiche dal negozio** con i fatti tecnici (registrate 8 su 10,
indirizzo, ultimo evento, ultima verifica), l'elenco dei dieci topic in un dettaglio, e in fondo
«Disattiva aggiornamenti automatici» con la sua conseguenza scritta accanto. ⛔ L'errore rosso
in testa sparisce: era il motivo della riga Ordini, ripetuto.

**Operazioni manuali.** Stessa griglia per le quattro: operazione e direzione · **Quando serve**
(una frase) + **Modifica:** (che cosa tocca e su che perimetro, una frase in grigio) · **Ultimo
esito** (pastiglia, testo breve, data) · comando (Allinea è l'unico primario). Una nota sola in
fondo («un'operazione alla volta; l'esito resta in Problemi ed esiti»).

**Problemi ed esiti.** Tre sezioni con titolo: **Problemi aperti (87)** come **tabella delle
cause** — N. · causa (con i nomi in piccolo) · effetto · azione con l'etichetta di DOVE si fa e il
rimando — al posto delle sei card; **Tutti i problemi, uno per riga** (motore comune, invariato);
**Esiti delle operazioni precedenti** come tabella neutra — operazione · quando · esito ·
dettaglio · rimando — dichiarata «fotografie con la data, non lo stato di oggi». Sul telefono le
cause sono card compatte (numero a sinistra, causa, effetto, azione).

**Connessione e sedi.** Quattro gruppi: **Negozio** (fatti in colonne; sotto, se c'è, la fascia
d'avviso con «Azzera le segnalazioni di errore» e la sua spiegazione in un dettaglio);
**Permessi su Shopify** (una riga di sintesi «11 concessi su 12 richiesti · per aggiungerne uno:
Disconnetti, poi Connetti», le aree in due colonne con lettura/scrittura e il mancante in
ambra, la conseguenza del mancante in una nota); **Sedi** (le tre pastiglie — collegate, da
decidere, lasciate fuori — nel titolo, il comando «Rileggi» col suo quando, la tabella con la
scelta di §6); **Operazioni sensibili** (titolo neutro, un filo normale: tre comandi in colonna,
ognuno con la sua conseguenza a fianco; il solo pericoloso in rosso, spento col motivo).

### 7.4 Misure: prima della proposta, la proposta, l'applicazione finale (stessi dati, scatti `oggi-*`, `proposta-*`, `finale-*`)

| Scheda            | Prima (scrivania) | Proposta | Applicata | Prima (telefono) | Proposta | Applicata |
| ----------------- | ----------------- | -------- | --------- | ---------------- | -------- | --------- |
| Prima connessione | 1.157px           | 900      | 876       | 1.801            | 1.145    | 1.266     |
| Sincronizzazione  | 876               | 939      | 1.056     | 1.177            | 1.675    | 1.797     |
| Operazioni        | 876               | 900      | 876       | 1.090            | 1.367    | 1.283     |
| Problemi ed esiti | 1.828             | 1.280    | 1.683     | 2.917            | 2.847    | 3.217     |
| Connessione       | 1.074             | 1.225    | 1.269     | 2.306            | 2.711    | 2.553     |

⚠️ L'applicazione non è più corta dappertutto, e non doveva esserlo: Sincronizzazione e
Connessione **mostrano di più** (i fatti delle notifiche e i permessi prima chiusi, il «quando» di
ogni comando, la fascia che dice il permesso mancante). Problemi ed esiti sulla scrivania è più
alta della proposta perché l'elenco sul motore mostra la sua finestra intera con 87 righe e la
tabella degli esiti sta sotto; sul telefono le 87 card sono le stesse. Ciò che si accorcia è ciò
che era ripetuto o ammassato.

### 7.5 L'applicazione (14/09, notte): i tre punti del proprietario e che cosa è cambiato nel codice

**I tre punti prima di applicare** — tutti verificati contro codice e specifiche, testi corretti
senza toccare il motore:

1. **Permesso prima della registrazione.** Quando le notifiche mancano PERCHÉ manca il permesso
   «Sede degli ordini» (`read_merchant_managed_fulfillment_orders`, etichetta aggiunta a
   `shopify-scope-labels.util`), la fascia della Sincronizzazione, la riga Ordini e la riga della
   tabella delle cause dicono prima la nuova autorizzazione (Disconnetti, poi Connetti) e che
   «Registra le notifiche mancanti» da solo non riesce; il comando primario porta a «Connessione e
   sedi». L'API compone i due problemi (`connessione_ambiti_mancanti`,
   `connessione_webhook_mancanti`) in modo indipendente: la lettura congiunta è del frontend
   (`permessoNotificheMancante`, `notificheBloccateDalPermesso`).
2. **La conseguenza di «Azzera» resta visibile**: accanto al comando, nella fascia d'avviso,
   «riporta «da allineare» i prodotti e le sedi in errore, che verranno ritentati al prossimo invio.
   Non corregge la causa» — non in un dettaglio. Verificato su `clearErrors` dell'API.
3. **I testi dei comandi contro il codice**: «Disattiva aggiornamenti automatici» cancella le
   sottoscrizioni e ignora le notifiche in ingresso, ma gli INVII verso Shopify (quantità a ogni
   movimento, articoli al salvataggio) non guardano `autoSyncEnabled`: il testo dice «Gli invii
   verso Shopify continuano», niente «pausa». «Importa catalogo» elenca i campi condivisi secondo
   `docs/24` §9.2 — prezzo barrato compreso, che è bidirezionale — e dichiara che non tocca nome e
   categoria VestiFlow, prezzi di vendita e quantità: niente «non tocca i prezzi» indistinto.

**Dove si applica** (nessun servizio e nessun comando cambia): `shopify-integration-panel`
(fascia di stato, griglia a quattro colonne con intestazione da `lg`, tabella degli esiti,
quattro gruppi di Connessione, sintesi dei permessi con il mancante in ambra), `shopify-setup-panel`
(quattro fatti in testa, stepper a tre fasi, niente pulsante a percorso concluso),
`shopify-problemi` (tabella delle cause al posto delle card; sul telefono la sede sta fra le
parole della card, non nell'ancora). La tabella delle cause e quella degli esiti sono riepiloghi
(classe C in `check:elenchi-fuori-motore`, motivati lì): l'elenco dei problemi resta sul motore.

**Difetti concreti trovati guardando l'anteprima, corretti con una guardia falsificata**:

| Difetto (misurato)                                                                                                          | Correzione                                                                                    | Guardia                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| i fatti delle notifiche larghi 422px su 390: nomi delle notifiche e indirizzo tagliati dal bordo                            | il valore del fatto cede (`min-inline-size: 0; overflow-wrap: anywhere`)                      | `nessunoSbordo` misura anche `.shell__content` (rosso a 422 senza la correzione)               |
| card dei problemi: una sede dal nome lungo nell'ancora lasciava al nome dell'articolo 0px — la card non diceva di chi parla | la sede è una parola: sta in `list-card__words`                                               | «nomi LUNGHI»: il gruppo del nome ≥ 80 % della testa (rosso: 0 su 304 con la sede nell'ancora) |
| elenco delle notifiche a 320px: la pastiglia «mancante» spinta fuori dallo schermo                                          | il nome della notifica cede; le due griglie a colonne da 352px usano `min(…, 100%)`           | misura a 320 sull'anteprima                                                                    |
| Operazioni sulla scrivania: la colonna descrizione a 232px (dodici righe), lo stato a 352 quasi sempre vuoto                | proporzioni della proposta: nome 19 %, stato 25 % (minimo un nome), il resto alla descrizione | riga «Importa catalogo» 230 → 145px a 1280                                                     |

**Prove aggiornate**: pannello 60, problemi 7 (con la riga «permesso prima»), prima connessione
12, scelte 6, etichette dei permessi; e2e `prima-connessione` (titoli «1 · Scelte iniziali», nessun
«Attiva» spento a percorso concluso, la tendina portata al centro prima di aprirla — sul telefono è
assoluta e si apre sotto), `situazione-shopify` (tabella delle cause, permesso prima, quattro
gruppi, esiti). Le guardie: due classi senza regola tolte, la tabella delle cause motivata.

## 8. La composizione mobile e gli aiuti «?» — mandato «A» del proprietario (14/09/2026, notte)

_Il proprietario, guardando lo scatto della Prima connessione in corso sul telefono: «Le
impostazioni sembrano quelle di un sito vetrina e non di un gestionale. Pulsanti enormi rispetto
alle scritte, disposizioni strane e non su righe e chiare. Non viene sfruttato lo spazio
orizzontale. La gerarchia è sballata.» Poi il mandato: ultimo intervento mirato sulla composizione
mobile, scrivania invariata salvo difetti concreti; controlli touch da 44px conservati; spazio
recuperato togliendo rientri e contenitori annidati inutili; componenti esistenti riusati;
spiegazioni aggiuntive in un «?» su `app-hover-tooltip` (mouse, tastiera, tocco); niente nel «?»
di ciò che serve per decidere; approfondimenti lunghi nel dettaglio esistente. Poi la parte grafica
si ferma._

### 8.1 Che cosa c'era a schermo, misurato (390px, Prima connessione in fase Sedi)

| Elemento                                          | Misura                                                                                        | Da dove veniva                                                               |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| testi di sezione, fase, corpo, aiuti              | 13 / 13 / 13 / 12–13px, cambia solo il peso (700/600/400)                                     | la scala di `regole-stile-ui` §3: è quella del gestionale, piatta per regola |
| pulsanti di direzione, Indietro, Vai al controllo | 32px, testo 12px                                                                              | token `--control-h-button` mobile (30/08)                                    |
| tendina «Decidi…»                                 | 44px                                                                                          | token `--field-height` mobile: gli input restano a 44                        |
| colonna dei numeri dello stepper                  | 32 + 12 di gap = **44px su 332**                                                              | composizione (mia)                                                           |
| una location da decidere                          | **card da 169px**, quattro righe etichetta:valore, tendina larga 238 = **61 % dello schermo** | ripiego `data-table-mobile-cards` lasciato com'era (mia)                     |
| suggerimenti in prosa                             | 36 + 78px prima del primo comando                                                             | composizione (mia)                                                           |
| i due pulsanti direzione                          | 144px l'uno in 280 → impilati                                                                 | conseguenza del rientro                                                      |

⭐ **I token non erano rotti**: i valori a schermo erano quelli decisi il 30/08. Ciò che faceva
leggere la scheda come un sito vetrina era la **composizione** — prosa, stepper rientrato, card
dentro card (card → fase → card della sede → cella, tre livelli di rientro) — su una scala
tipografica piatta che nelle tabelle funziona perché la struttura la danno intestazioni e righe, e
qui non c'era.

### 8.2 Che cosa è cambiato

| Dove                                | Prima                                                           | Ora                                                                                                                                                                                                                             |
| ----------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| stepper (`setup__fase`) sotto `lg`  | griglia `32px \| 1fr`: il corpo rientrato di 44px               | `auto \| 1fr`: il numero in linea col titolo, il corpo su tutta la riga (`grid-column: 1 / -1`). Scrivania invariata (`32px \| 224px \| 1fr`)                                                                                   |
| i due pulsanti direzione sotto `md` | 144px l'uno, impilati                                           | `--button-flex: 1 1 0`: si dividono la riga (158px l'uno)                                                                                                                                                                       |
| card della location sotto `lg`      | quattro righe etichetta:valore (169px), tendina 238px           | **card progettata** con lo stesso `<table>` e lo stesso mixin: nome + stato sulla prima riga, tendina a tutta larghezza (298px), «Sede VestiFlow» come riga etichetta:valore; niente padding di cella dentro la card (124px)    |
| spiegazioni in prosa e sottotitoli  | paragrafi `setup__hint`, `__section-meta` esplicativi, `__nota` | un **«?»** accanto al titolo: 5 nel percorso (testa, tre fasi, fasi concluse), 6 nel pannello (Aggiornamenti automatici, Notifiche, Operazioni — con la nota «una alla volta» —, Esiti, «lasciata fuori», Operazioni sensibili) |
| «Problemi aperti», meta             | «letti alle … · 6 cause · l'azione è una per causa»             | «letti alle … · 6 cause»: la frase la dice la colonna Azione                                                                                                                                                                    |
| righe a quattro colonne da `lg`     | nome 176–224, stato 224–352                                     | nome `minmax(176px, 19%)`, stato `minmax(224px, min(25%, 352px))`: le proporzioni della proposta, con lo stato mai oltre un indirizzo — a 1800px il 25 % allontanava il comando dalla descrizione (§7.5)                        |

**Che cosa resta visibile, per regola**: lo stato e il motivo del blocco (fascia e righe), il
«quando» e il «Modifica:» delle operazioni, i fatti, le conseguenze di «Azzera», «Cambia negozio»,
«Disconnetti» e della purga sospesa, la nota sul permesso mancante, «per aggiungerne uno:
Disconnetti, poi Connetti», il «Quando:» di «Rileggi le location». Nessuna spiegazione sta in due
posti: chi va nel «?» sparisce dal testo.

**Misure dopo** (telefono 390, stesso scenario): Prima connessione in corso, card **937 → 623px**;
tendina **238 → 298px**; card della location **169 → 124px**; colonna dei numeri **44 → 0**.
Le cinque schede: §7.4, colonna «Applicata».

### 8.3 Il componente comune, esteso in modo compatibile (`app-hover-tooltip`)

Il tooltip condiviso mostrava la bolla a `:hover` e `:focus-within`; il trigger lo proiettava il
chiamante — in tutte le schermate un'icona `<i tabindex="-1" aria-hidden>`, che né il Tab né lo
screen reader raggiungono, e nel riepilogo Corrispettivi **nessun trigger** (la bolla non si apre).
Nessuna chiusura con Esc, nessuna chiusura al secondo tocco, e sul telefono una bolla da 352px
ancorata a un trigger a metà schermo usciva di 180px.

| Aggiunto                                            | Come                                                                                                                                                                                                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| il trigger integrato `[icona]="true"` + `etichetta` | un `<button>` da 16px con l'area premibile di un pulsante (`--btn-min-height`: 44 sul telefono) via pseudo-elemento; `aria-label` dall'etichetta, `aria-describedby` alla bolla (id generato se il chiamante non lo dà)                           |
| chiusura                                            | Esc (`chiusa` finché il fuoco resta); un secondo tocco/clic sul trigger che ha già il fuoco chiude, il terzo riapre (`pointerdown`, prima che il fuoco arrivi); il fuoco che esce riarma. Gestori sull'host, non su un elemento non focalizzabile |
| contenimento orizzontale                            | oltre al ribaltamento a sinistra: se non sta né di qua né di là, la bolla si ancora al margine della finestra (8px) e si stringe allo spazio (`--scostata`, variabili impostate dal componente)                                                   |
| verso                                               | a bolla aperta si misura l'altezza: se sopra (o sotto) non ci sta nella regione che scorre, si ribalta                                                                                                                                            |

Gli altri utilizzi (scheda articolo, righe documento, azioni di elenco, permessi utente) restano
come sono: nessuna API tolta, la bolla ha solo un id in più. Prove: `hover-tooltip.component.spec`
(7: pulsante e descrizione, nessun pulsante senza `icona`, Esc, tocco doppio, tre posizioni) ed
e2e `situazione-shopify` «aiuti «?»» — scrivania (mouse, Tab, Esc, una copia sola del testo) e
telefono con tocco (apre contenuta e non ritagliata, secondo tocco chiude, terzo riapre, tocco
altrove chiude, area premibile a 18px dal centro) — falsificata: senza il restringimento la bolla
esce a destra (159 → 511 su 390) e la prova è rossa. La regola è in `regole-stile-ui` §5.

### 8.4 Le verifiche del mandato — tutte con risposte SIMULATE

Tutto ciò che segue gira con l'API finta (mock delle rotte nelle e2e isolate, server finto
dell'anteprima, servizi finti nelle prove di componente). **Sull'applicazione reale con Shopify
vero non è stato possibile provare da qui**: la copia del proprietario gira su `develop` e le sue
credenziali non si usano; la prova reale (§8.5) resta da fare dopo il merge.

| Richiesto                                                                        | Dove è provato                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ritorno OAuth e messaggi per ogni esito                                          | pannello, «ritorno da Shopify e comandi che dicono il vero»: altra azienda (col dominio, indirizzo pulito), canale non previsto, identità non ricevuta, collegamento concorrente, collegato con aggiornamenti attivi / sospesi / avviso sulle notifiche / avviso di altro tipo; scenari `rifiuto-*` e `collegato-attivo` dell'anteprima            |
| sedi collegate, da decidere, lasciate fuori; conteggi; nessuna scelta automatica | `location-setup-status.util.spec` (5), scelte (6: omonima SUGGERITA e mai applicata; sola lettura), pannello («una lasciata fuori non è da decidere», «aprendo il pannello non parte nessuna sincronizzazione delle sedi», «Rileggi» rilegge senza creare), e2e `prima-connessione` («Vai al controllo» spento finché una location è senza scelta) |
| azioni coerenti con permessi e blocchi                                           | pannello (titolare vs solo giacenze vs combinazione clienti; purga spenta col motivo; Allinea rifiuta con ordini senza sede; pulsanti spenti durante un'operazione), problemi (azione per causa, rimando che NON esegue), e2e `impostazioni-shopify` (menu e pagina per permesso) e `situazione-shopify` (rimando senza chiamate)                  |
| esiti, caricamento ed errori dei comandi                                         | pannello (esito sulla riga «eseguita / non riuscita», import tutto fallito, saltati nominati, errore che resta), e2e «comando in corso» e «caricamento ed errore» (scheletro, «Riprova»)                                                                                                                                                           |
| aiuti e tendine con mouse, tastiera e tocco, anche con nomi lunghi               | e2e «aiuti «?»» (scrivania e telefono), «la tendina della scelta sta nello schermo… a 320, 360 e 390», «nomi LUNGHI» (tabella e card), `select-menu.component.spec` (3)                                                                                                                                                                            |
| regressioni sugli altri utilizzi dei componenti condivisi                        | suite frontend intera (**3.581** prove, 329 file) e suite e2e isolata intera (**120**, con `componenti-comuni-invariati`); lint 60 guardie; type-check                                                                                                                                                                                             |

### 8.5 L'elenco finale: risolto, verificato, residuo

**Risolto in questo ramo** (§6, §7, §8): atterraggio per stato, banner veri, quattro rifiuti
OAuth, «Prossimi passi» tolto, stato e conteggi delle sedi, tendina con l'omonima suggerita e mai
applicata, «Rileggi» e «Azzera» con i loro effetti; tendina contenuta e leggibile a 320/360/390;
cinque schede riorganizzate (fascia di stato, righe a quattro colonne, tabella delle cause, quattro
gruppi di Connessione, stepper senza comandi a percorso concluso); permesso prima della
registrazione; testi dei comandi allineati al codice; composizione mobile senza rientri; aiuti «?»
raggiungibili con mouse, tastiera e tocco; i quattro difetti di §7.5 e la sede nell'ancora.

**Verificato** (tutto simulato, §8.4): lint 60 guardie verdi, type-check pulito, 3.581 prove
frontend, 120 e2e isolate; a browser sull'anteprima: aiuti 29 controlli su 29 (scrivania,
390, 320), sbordi zero sulle cinque schede a 390 e 320 (la tabella dei permessi scorre nel suo
contenitore a 320, com'è previsto).

**Residuo** — dichiarato, fuori da questo ramo o da fare dal proprietario:

1. ⏸ **La prova sull'applicazione reale con Shopify vero** — ritorno OAuth con i quattro rifiuti
   (richiede un negozio che li produca), «Registra le notifiche mancanti» con e senza il permesso,
   «Rileggi le location» dopo aver rinominato una location nell'admin, «Azzera» con un errore vero:
   dalla copia del proprietario, dopo il merge.
2. ⏸ **Gli altri utilizzi di `app-hover-tooltip` con l'icona proiettata** (scheda articolo,
   campi rapidi variante) restano irraggiungibili da tastiera e screen reader, e il riepilogo
   Corrispettivi ha un tooltip senza trigger: da portare a `[icona]` nei rispettivi lavori
   (`regole-stile-ui` §5). Non toccati qui: fuori perimetro.
3. ⏸ **Sul telefono la tendina della scelta si apre SOTTO il trigger** (pannello assoluto, la
   pagina scorre): se il trigger sta al bordo inferiore le voci si raggiungono scorrendo. È il
   comportamento del componente condiviso su tutte le maschere; un ribaltamento verso l'alto anche
   in modalità assoluta sarebbe una modifica al componente da decidere a parte.
4. ⏸ La colonna «Sede VestiFlow» della tabella delle sedi taglia i nomi lunghi a colonna (regola
   del taglio, `title` col mouse): sul telefono la card li mostra interi.
5. ⏸ Pausa completa, «Rinnova autorizzazione» senza disconnettere, regole di abbinamento: fuori
   da questo ramo, come da mandato.

Commit, push, merge e deploy attendono il via del proprietario (vedi §9 per l'ultimo adeguamento).

## 9. L'ultimo adeguamento sul riferimento grafico — deciso dal proprietario il 14/09/2026, notte

_Il proprietario ha portato un'immagine di riferimento (una scheda «Sincronizzazione automatica»
con sezioni, tabella a cinque colonne e fatti a colonne): «rende abbastanza bene l'ordine che
cerco, ma senza le card: sezioni sulla superficie della pagina, separate da spazio e da una linea
sottile sotto il titolo». Prima il confronto con l'anteprima e gli scostamenti, poi le decisioni,
poi l'applicazione. «Questo chiude il giro grafico.»_

### 9.1 Le decisioni (testuali, 14/09/2026)

| #   | Decisione                                                                                                                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | stati ed esiti: **pastiglie piatte** (la regola del 01/09), distinte anche dal testo, non solo dal colore                                                                                                                                                                |
| 2   | spiegazioni: descrizione dei flussi e «Quando serve» nel «?»; nelle operazioni resta visibile «Modifica» (ambito ed effetti); blocchi, motivi e conseguenze importanti sempre visibili; aiuti con mouse, tastiera e tocco                                                |
| 3   | notifiche: nei fatti «8 su 10 · 2 mancanti»; l'avviso dice **quali funzioni** sono interessate in italiano; i nomi tecnici dei topic nel dettaglio richiudibile; col permesso mancante il percorso per l'autorizzazione, senza proporre una registrazione che fallirebbe |
| 4   | titoli: colore brand e filo come le anagrafiche, al token previsto (`--text-md`); gerarchia e separazione riconoscibili                                                                                                                                                  |
| 5   | stato del negozio: a destra del titolo quando c'è spazio, sotto sul telefono o con nomi lunghi, senza troncamenti                                                                                                                                                        |
| —   | via i contenitori a card delle sezioni, margini conservati; le tabelle conservano la loro superficie; riuso dei componenti indicati, estensioni condivise minime e provate; sul telefono aree touch da 44px                                                              |

### 9.2 Che cosa è cambiato, e con che cosa

| Scostamento (misurato prima)                                                        | Ora                                                                                                                                                                                                                                                                                | Riuso                                                                                    |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| tutta la scheda in UNA card bianca (`__card`: bordo, raggio 9px, padding 12/16)     | nessuna card: sezioni sulla superficie della pagina, titolo con filo tinto e `--space-6` fra una sezione e l'altra; la fase corrente del percorso e il corpo dei dettagli sono bianchi (il tenue sul grigio non si vedeva)                                                         | il filo delle anagrafiche                                                                |
| titoli di sezione 13px                                                              | `--text-md` (14px), colore brand: la misura che §3 prescrive                                                                                                                                                                                                                       | token esistente                                                                          |
| «Verifica ora» nella fascia; «Rileggi le location» sotto il titolo col suo «quando» | comandi a destra del titolo (`__section-azioni`): 28px sulla scrivania (`--control-h-button`), di serie 44 sul telefono; il «quando» di Rileggi nel «?» accanto al comando, che cosa fa e non fa in una riga visibile                                                              | `app-button` coi suoi punti di regolazione                                               |
| fascia di stato alta 191px (badge, 3 righe, date, 3 pulsanti)                       | `app-inline-banner` (tono, ruolo ARIA) con le frasi essenziali e il comando che risolve; nessun avviso quando tutto è attivo                                                                                                                                                       | `app-inline-banner`, esteso con lo slot proiettato `actions` (compatibile, provato)      |
| griglia a 3 colonne (direzione sotto il nome, descrizione visibile)                 | **cinque colonne** con intestazione da tabella (fondo, filo, 11px): Flusso+? · Direzione · Stato · Dettaglio · Azione; Operazione+? · Direzione · Modifica · Ultimo esito · Azione                                                                                                 | la griglia `__riga` con subgrid; i token dell'intestazione delle tabelle                 |
| fatti a una colonna (`dl` proprio) e una seconda grammatica nella Prima connessione | `app-detail-facts` (3 colonne da `lg`) per Negozio, Notifiche, avanzamento di Allinea e i quattro fatti della Prima connessione                                                                                                                                                    | `app-detail-facts` delle 7 pagine di Dettaglio, esteso con `note` (compatibile, provato) |
| «Le 10 notifiche attese» richiudibile, indirizzo di consegna nei fatti              | un solo «Dettagli tecnici delle notifiche»: indirizzo (+ nota) e i dieci topic con registrata/mancante                                                                                                                                                                             | il `details` esistente                                                                   |
| l'avviso nominava i topic (`fulfillment_orders/moved`, …)                           | «Mancano 2 notifiche su Shopify: quelle per **la sede assegnata agli ordini**. Manca il permesso «Sede degli ordini»: serve una nuova autorizzazione — Disconnetti, poi Connetti…»; senza permesso mancante: «Finché non sono registrate, questi eventi non arrivano» + «Registra» | `shopify-webhook-topic-labels.util` (nuovo, 10 topic → funzioni, con prova)              |
| stato del negozio sotto il titolo, a sinistra                                       | nell'intestazione della pagina, a destra del titolo da `md`, a capo quando non ci sta; il pannello tiene solo «Prima connessione in corso · fase»                                                                                                                                  | lo store condiviso, letto dalla pagina (nessuna seconda lettura)                         |

Non cambiato, per decisione: pastiglie piatte; le schede con i loro stati; «Modifica» delle
operazioni, i motivi dei blocchi, le conseguenze di Azzera / Cambia negozio / Disconnetti / purga,
la nota sul permesso mancante, «per aggiungerne uno: Disconnetti, poi Connetti»; «Disattiva
aggiornamenti automatici» resta col suo effetto accanto (è lungo e deve restare visibile).

### 9.3 Misure dopo (scatti `rif-*`, scenario «problemi-nomi-lunghi»)

| Scheda            | Scrivania (§7.4 → ora) | Telefono 390 (§7.4 → ora) |
| ----------------- | ---------------------- | ------------------------- |
| Prima connessione | 876 → 876              | 1.266 → 1.232             |
| Sincronizzazione  | 1.056 → 876            | 1.797 → 1.304             |
| Operazioni        | 876 → 876              | 1.283 → 1.039             |
| Problemi ed esiti | 1.683 → 1.621          | 3.217 → 3.049             |
| Connessione       | 1.269 → 1.208          | 2.553 → 2.562             |

Sbordi: nessuno a 390 e a 320 sulle cinque schede (la tabella dei permessi scorre nel suo
contenitore a 320, com'è previsto). Aiuti: 29 controlli su 29 a browser (scrivania, 390, 320).

### 9.4 Prove aggiornate

Pannello 60 (avviso con le funzioni, fatti «1 su 2 · 1 mancante», nomi nel dettaglio tecnico,
«Quando rileggere» come descrizione del «?», stato nell'intestazione della pagina), banner
+2 (slot `actions`), `detail-facts` (nuova, la nota), `shopify-webhook-topic-labels.util` (3);
e2e `situazione-shopify` (l'avviso è `role="alert"` con la funzione e senza «Registra» quando
manca il permesso; «8 su 10 · 2 mancanti»; i topic compaiono solo aprendo il dettaglio).

### 9.5 Due precisazioni per le prove reali (14/09/2026, chiusura del ramo)

**«Azzera le segnalazioni di errore» ha effetti anche DOPO il clic.** `clearErrors` cancella
l'errore salvato, riporta la connessione da «errore» a «Connesso» (`healStaleErrorStatus`) e rimette
«da allineare» prodotti e sedi in errore. Poiché l'invio delle quantità **rifiuta finché la
connessione non è «Connesso»** (`shopify-inventory-push.service.ts`), dopo «Azzera» gli invii
automatici fermi dallo stato di errore **riprendono da soli** al primo movimento, e prodotti e sedi
tornati «da allineare» **vengono ritentati** dagli invii successivi (quantità a ogni movimento,
articolo al salvataggio). Cioè può produrre scritture sul negozio anche minuti dopo, senza altri
clic: si prova solo con una decisione a parte. Il testo accanto al comando lo dice
(«verranno ritentati al prossimo invio»).

**L'indirizzo dei webhook dell'API locale non è consegnabile, e il pannello lo sa.** L'indirizzo
configurato viene da `SHOPIFY_WEBHOOK_URL` o, in mancanza, da `SHOPIFY_APP_URL` +
`/api/v1/shopify/webhooks` (`shopify-config.service.ts`). Verificato il 14/09/2026 sul processo in
ascolto sulla 3000 (`node dist/main`, senza `--env-file`, quindi `api/.env`): `SHOPIFY_APP_URL` è
`http://localhost:3000` → l'indirizzo non è `https`, `isShopifyDeliverableAddress` lo dichiara non
consegnabile, l'API risponde `webhookAddressComparable: false`, il pannello scrive «confronto non
possibile da questo ambiente» e **non offre «Registra le notifiche mancanti»** (spec «da un
ambiente non consegnabile NON compare»). ⛔ Non è quindi possibile, dalla copia locale, registrare
un indirizzo locale sul negozio. La registrazione e il ritorno OAuth si provano sull'istanza con URL
pubblico (collaudo su tunnel `https`, o Railway).

**Prove reali non eseguite in questo ramo**, dichiarate: le cinque schede coi dati veri, «Verifica
ora», «Rileggi le location» dopo una rinomina nell'admin (controllo minimo utile, dalla copia del
proprietario); i quattro rifiuti OAuth non riproducibili in modo semplice, «Registra le notifiche
mancanti», il ritorno OAuth con collegamento, «Azzera» con un errore vero (solo con decisione a
parte). Le prove eseguite sono tutte con risposte simulate (§8.4).
