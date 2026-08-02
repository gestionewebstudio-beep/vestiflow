# regole-stile-ui — VestiFlow Restyle Spec

Fonte di verità visiva per l'intera app. Ogni modifica UI deve rispettare questo documento. In caso di conflitto con altri file o mockup precedenti, vince questo.

Ultima revisione: luglio 2026.

---

## 1. Principi

- **VestiFlow è un gestionale**, non un sito vetrina. Densità informativa controllata, layout compatti ma leggibili, nessuna proporzione da marketing page.
- **Tema chiaro**. Le regole di questo documento descrivono il tema chiaro.
- **Mobile è cittadino di prima classe**. Le regole mobile non sono "adattamenti"; sono parte del sistema. Su schermi stretti le tabelle diventano card, la testata diventa comprimibile, le azioni principali (Annulla, Salva) stanno in fondo al documento — nessuna barra fissa che sottrae spazio al contenuto.
- **Un solo modo di fare le cose**. Se un pattern esiste per un caso, va riusato negli stessi casi altrove. Card, tabelle, sezioni di form, riepiloghi totali: uno standard, non varianti.
- **Bordi disegnano la forma, ombre danno profondità sottile**. Uso limitato di ombre marcate; il grosso della gerarchia visiva sta nei bordi e negli sfondi.

---

## 2. Palette

Nessun colore va scritto direttamente in un componente: sempre `var(--token)`.

### Superfici

| Uso                                    | Valore    | Token                       |
| -------------------------------------- | --------- | --------------------------- |
| Sfondo pagina                          | `#eef0f2` | `--color-bg`                |
| Superficie card / pannelli             | `#ffffff` | `--color-surface`           |
| Superficie tenue (row alterne, sunken) | `#f6f7f8` | `--color-surface-soft`      |
| Superficie tabella hover               | `#f8faf9` | `--color-surface-hover`     |
| Header tabella                         | `#e9edee` | `--color-table-header-bg`   |
| Testo header tabella                   | `#3f4c51` | `--color-table-header-fg`   |
| Filo sotto l'header tabella            | `#aebfb7` | `--color-table-header-rule` |

### Bordi e divisori

| Uso                                               | Valore    | Token                         |
| ------------------------------------------------- | --------- | ----------------------------- |
| Bordo base                                        | `#d7dddd` | `--color-border`              |
| Bordo forte (input focus off, separatori sezioni) | `#b6c0c1` | `--color-border-strong`       |
| Divisori cella tabella                            | `#e4ebe8` | `--color-border-cell`         |
| Divisori gruppi colonne tabella (2px)             | `#b9c7c0` | `--color-table-group-divider` |

### Testo

| Uso                                  | Valore    | Token                  |
| ------------------------------------ | --------- | ---------------------- |
| Testo primario                       | `#20282b` | `--color-text`         |
| Testo muted (hint, meta)             | `#657075` | `--color-text-muted`   |
| Label uppercase di campo             | `#59665f` | `--color-field-label`  |
| Testo subtle (placeholder, disabled) | `#8a9498` | `--color-text-subtle`  |
| Testo su superfici scure             | `#ffffff` | `--color-text-inverse` |

### Brand e interazione

| Uso                                         | Valore                 | Token                      |
| ------------------------------------------- | ---------------------- | -------------------------- |
| Brand primario (CTA, header attivi, avatar) | `#25343b`              | `--color-primary`          |
| Brand hover                                 | `#18262d`              | `--color-primary-hover`    |
| Brand tinta chiara (subtle)                 | `#edf2f4`              | `--color-primary-subtle`   |
| Focus (bordo campo + anello)                | `#4f7e8d`              | `--color-focus`            |
| Focus ring alpha                            | `rgba(79,126,141,.12)` | `--color-focus-ring-alpha` |
| Link accento                                | `#3d6875`              | `--color-link`             |

### Navigation (shell)

Colori dedicati **esclusivamente** alla sidebar. Non usare questi token altrove: non è un secondo brand, è la palette della navigazione. Sono tonalmente distinti dal brand (verde-scuro vs grigio-blu) perché stanno in aree separate della schermata e la distinzione visiva è voluta.

| Uso                                 | Valore                                               | Token                     |
| ----------------------------------- | ---------------------------------------------------- | ------------------------- |
| Sidebar bg                          | `#15211F`                                            | `--color-nav-bg`          |
| Voce attiva bg                      | `#1E3933`                                            | `--color-nav-selected-bg` |
| Testo sidebar (voci normali)        | `#d8e2df`                                            | `--color-nav-fg`          |
| Testo sidebar muted (sezioni, meta) | `#8f9c96`                                            | `--color-nav-fg-muted`    |
| Testo/icona voce attiva             | `#ffffff`                                            | `--color-nav-selected-fg` |
| Indicatore laterale voce attiva     | usa `--color-nav-selected-fg` (2px inset a sinistra) | —                         |
| Divisori interni sidebar            | `rgba(255,255,255,.08)`                              | `--color-nav-divider`     |

### Stati

| Uso                               | Valore    | Token                    |
| --------------------------------- | --------- | ------------------------ |
| OK / successo / stock disponibile | `#2d7557` | `--color-ok`             |
| OK tinta chiara                   | `#edf6f1` | `--color-ok-subtle`      |
| Warning / allerta stock / ambra   | `#9a640c` | `--color-warning`        |
| Warning tinta chiara              | `#fff6e7` | `--color-warning-subtle` |
| Danger / errore / eliminazione    | `#b33a32` | `--color-danger`         |
| Danger tinta chiara               | `#fff0ee` | `--color-danger-subtle`  |
| Info / neutro attivo              | `#2d6685` | `--color-info`           |
| Info tinta chiara                 | `#eef6fa` | `--color-info-subtle`    |

### Brand Shopify (distinto dall'ok generico)

| Uso                            | Valore                | Token                    |
| ------------------------------ | --------------------- | ------------------------ |
| Shopify / sync / canale online | `#0e7446`             | `--color-shopify`        |
| Shopify tinta chiara           | derivare al 12% alpha | `--color-shopify-subtle` |

Regola: `--color-ok` per stati positivi generici; `--color-shopify` **solo** per elementi legati al canale Shopify (chip sync, badge origine dato, indicatori di canale). Non si sostituiscono.

---

## 3. Tipografia

### Font

- Primario: **Inter** (già in `@fontsource-variable/inter`), token `--font-sans`
- Monospace: `ui-monospace, SFMono-Regular, Menlo, monospace` (per SKU, EAN, codici), token `--font-mono`

### Pesi

Inter è variable font: i pesi sono puntuali, non a step fissi. I valori specifici richiesti da ogni elemento sono nella tabella sotto. Ordini di grandezza:

- **400** — testo base, contenuto
- **600** — bottoni, valori numerici, enfasi leggera
- **650** — nome prodotto cella tabella (enfasi contenuta)
- **700** — titoli sezione, nome prodotto card, totali
- **760** — H1 titolo pagina, label uppercase
- **800** — avatar iniziali (contesto minuscolo, alta leggibilità richiesta)

### Scala dimensioni

| Uso                                    | Desktop                                         | Mobile                                           |
| -------------------------------------- | ----------------------------------------------- | ------------------------------------------------ |
| H1 titolo pagina                       | 20px / weight 760 / letter-spacing -.025em      | 18px / weight 760                                |
| H2 titolo sezione                      | 14px / weight 700                               | 13px / weight 700                                |
| Testo base UI                          | 13px                                            | 13px                                             |
| Testo cella tabella                    | 12.5px                                          | — (le tabelle diventano card)                    |
| Label uppercase (form, tabella)        | 9.5–10px / weight 760 / tracking .045em / muted | 9.5px / weight 760                               |
| Label campi testata documento          | come sopra (uppercase)                          | 12px / weight 760 / case normale, senza tracking |
| Testo card mobile — nome prodotto      | —                                               | 14.5px / weight 700                              |
| Testo card mobile — sub info           | —                                               | 11px / weight 400 / muted                        |
| Testo header summary compresso — small | —                                               | 11px / weight 600 / muted                        |
| Input desktop                          | 12.5px                                          | —                                                |
| Input mobile                           | —                                               | **≥16px** (regola iOS no-zoom)                   |
| Numero grand total                     | 22–24px / weight 700 desktop                    | 20px / weight 700                                |
| Metric chip mobile (Qtà/Prezzo/Totale) | —                                               | 9px label / 12.5px valore                        |
| Bottoni                                | 13px / weight 600                               | 13px / weight 600                                |
| kbd (scorciatoie tastiera)             | 10.5px monospace                                | —                                                |

Regola universale: **numeri con `font-variant-numeric: tabular-nums`** in ogni cella prezzo/quantità/totale.

---

## 4. Layout: spaziatura, radius, ombre

### Scala spaziatura (base 4px)

`0 · 2 · 4 · 6 · 8 · 10 · 12 · 14 · 16 · 20 · 24`

Nomi token: `--space-0` … `--space-24`.

### Radius

| Uso                                        | Valore | Token           |
| ------------------------------------------ | ------ | --------------- |
| Input, cella editabile, bottone secondario | 5–7px  | `--radius-sm`   |
| Bottone primario, chip, badge              | 6–8px  | `--radius-md`   |
| Card, pannello                             | 9–12px | `--radius-lg`   |
| Pill di stato                              | 999px  | `--radius-pill` |

### Ombre

- Card: `0 1px 2px rgba(18,42,33,.04), 0 4px 14px rgba(18,42,33,.035)` — token `--shadow-card`
- Topbar sticky: `0 2px 8px rgba(15,36,28,.05)` — token `--shadow-topbar`
- Footer azioni desktop: `0 -5px 18px rgba(15,36,28,.055)` — token `--shadow-footer` (solo desktop, vedi §5)
- Menu / dropdown: `0 12px 35px rgba(18,40,32,.16)` — token `--shadow-menu`
- Card aperta / hover: leggero rialzo, ombra `0 6px 18px rgba(20,42,34,.08)` — da tablet in su. Su phone le card non hanno ombra (vedi «Spaziature mobile»): a staccarle basta il bordo tenue sul grigio della pagina

Regola: nessuna ombra su bottoni, input, celle. Ombre solo su contenitori (card, pannelli, overlay).

### Spaziature mobile

Su phone il contenuto vale più dell'aria ai lati: su uno schermo da 375px i margini generosi costano 30–40px orizzontali di contenuto utile.

**Phone (≤ 768px)**

| Uso                              | Valore                                                                    |
| -------------------------------- | ------------------------------------------------------------------------- |
| Margine laterale contenitore     | 8px                                                                       |
| Gap verticale tra card e sezioni | 8px                                                                       |
| Padding interno card             | 14px su tutti i lati                                                      |
| Ombra card                       | rimossa (`box-shadow: none`)                                              |
| Bordo card                       | 1px tenue (`--color-border`): la separazione la dà il bianco su bg pagina |

**Tablet (769–1024px)**: valori intermedi (margine ~12px, gap ~10px). La compressione spinta serve solo al phone.

Le card restano contenitori (superficie bianca + radius), ma occupano quasi tutta la larghezza del viewport invece di flottare al centro.

### Touch target minimo

**44px** ovunque sia un elemento tappabile su mobile. Su desktop si può scendere a 32–34px per bottoni densi e a 29–30px per input in griglia densa.

### Altezze dei controlli — token

L'altezza di un controllo è una decisione di **sistema**, non di singola maschera:
vive nei token e non va reimpostata nel foglio di un componente.

| Uso                              | Token                | Desktop | Mobile |
| -------------------------------- | -------------------- | ------- | ------ |
| Bottoni e select generici        | `--btn-min-height`   | 34px    | 44px   |
| Input generici                   | `--field-height`     | 34px    | 44px   |
| Controlli di testata documento   | `--control-h-field`  | 29px    | 44px   |
| Bottoni barra strumenti / azioni | `--control-h-button` | 31px    | 44px   |
| Input dentro le righe            | `--control-h-cell`   | 24px    | 24px   |
| Riga tabella                     | `--table-row-h`      | 30px    | —      |
| Intestazione tabella             | `--table-head-h`     | 32px    | —      |

Il passaggio a 44px sotto il breakpoint `md` è centralizzato in
`_design-tokens.scss`: **non** si ripete nei componenti. Il minimo tappabile è il
valore mobile, non quello universale — applicarlo anche su desktop rende l'intera
interfaccia più larga della densità scelta.

---

## 5. Componenti condivisi

Ogni componente vive in `src/app/shared/`. Nessuno stile equivalente va replicato nei componenti feature.

### Come si configura un componente condiviso — in ordine di preferenza

Un componente condiviso non si «corregge» dall'esterno: si **configura**. In ordine,
dal più corretto al più invasivo:

1. **`input()` del componente** — quando è una variante di comportamento o di
   forma che ha un nome nel dominio: `variant`, `layout`, `fullWidth`, `compact`.
   Se la variante ha senso per più di un chiamante, è un `input()`.
2. **Custom property** — quando è una misura che un contenitore vuole cambiare
   per tutti i figli che ospita (una barra strumenti densa, il piede di un
   pannello). Le custom property attraversano il confine del componente **per
   costruzione**: sono il canale previsto dal linguaggio.

   I componenti condivisi espongono i propri punti di regolazione con un
   fallback: `min-block-size: var(--button-h, var(--field-height))`. Il
   contenitore imposta `--button-h` su di sé, non tocca il figlio.

   `select-menu` e `date-input` condividono il prefisso `--field-*` apposta: sono
   la stessa superficie di campo, e chi ne configura una si aspetta che l'altra
   segua senza dover imparare un secondo vocabolario.

   | Componente          | Punti di regolazione                                                                                                                                                  |
   | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `app-button`        | `--button-h`, `--button-font-size`, `--button-font-weight`, `--button-radius`, `--button-pad-inline`, `--button-inline-size`, `--button-flex`, `--button-grid-column` |
   |                     | colori: `--button-fg/-bg/-border`, `--button-bg-hover`; varianti `--button-danger-*`, `--button-ghost-*`                                                              |
   | `date-input`        | `--field-*` (sotto) piu' `--date-input-toggle-w`, `--date-input-toggle-pad`, `--date-input-icon-display`, `--date-input-panel-inset/-w/-min-w/-max-w`                 |
   | `select-menu`       | `--field-*` (sotto) piu' `--select-menu-width`, `--select-menu-max-width`, `--select-menu-panel-inset`                                                                |
   | campi (`--field-*`) | `--field-h`, `--field-gap`, `--field-font-size`, `--field-pad-inline`, `--field-radius`, `--field-fg`, `--field-bg`, `--field-bg-hover`, `--field-border-color`       |
   | `back-button`       | `--back-button-h`, `--back-button-gap`, `--back-button-pad-inline`, `--back-button-radius`, `--back-button-font-size`, `--back-button-font-weight`                    |
   | `attachments-panel` | `--attachments-gap`, `--attachments-title-size`, `--attachments-item-pad`                                                                                             |
   | `barcode-scanner`   | `--barcode-scanner-w`                                                                                                                                                 |
   | `hover-tooltip`     | `--hover-tooltip-inset`                                                                                                                                               |
   | celle di riga       | `--doc-code-cell-fg`, `--doc-product-cell-weight`                                                                                                                     |

   **`app-button` ha l'host `display: contents`**: e' il `<button>` interno a
   stare nel flusso del contenitore. `flex` e `grid-column` vanno quindi
   dichiarati come `--button-flex` / `--button-grid-column`, non sull'elemento
   `<app-button>` — li' non avrebbero effetto.

3. **Il default del componente stesso** — quando ciò che il chiamante vuole non
   è una sua preferenza ma **il design giusto**. In quel caso non si configura
   nulla: si cambia il componente. Se una maschera ridefinisce un componente
   condiviso in 15 regole, non sta personalizzando — sta dicendo che il default
   è sbagliato.

### `::ng-deep` — quando è ammesso

`::ng-deep` è **deprecato** e va evitato: dipende dai nomi di classe interni di
un altro componente, quindi smette di funzionare **in silenzio** se quello li
rinomina — nessun errore, nessun test rosso, lo stile torna al default.

**Nell'app non ce n'e' nessuno.** Erano 65; sono zero. Aggiungerne uno è quindi
sempre una regressione, e c'è sempre un'alternativa fra le tre sopra.

Il caso che sembra un'eccezione — un overlay che la CDK monta fuori dall'albero
del componente, come `.cdk-drag-preview` — **non è risolvibile con `::ng-deep`**:
la parte di selettore che precede `::ng-deep` porta comunque l'attributo di
incapsulamento, quindi `.mia-pagina ::ng-deep .cdk-drag-preview` compila in
`.mia-pagina[_ngcontent-x] .cdk-drag-preview` e non aggancia un elemento che sta
nel `<body>`. Quelle regole vanno in un foglio **globale** (`src/styles/`), che
è dove vive tutto ciò che il framework monta fuori dal componente. Nel progetto
l'anteprima di riga sta in `styles/_document-form.scss`.

Un `::ng-deep` è un difetto di API del componente condiviso: la correzione è
aggiungere il punto di regolazione che manca, non scavalcarlo.

### Il livello globale — cosa ci sta e cosa no

`src/styles/` non è una discarica: ci sta soltanto ciò che **non può** stare in
un componente, o che verrebbe compilato più volte se ci stesse.

| File                                                                                     | Contenuto                                                                |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `_design-tokens.scss`                                                                    | i valori. Unica fonte di verità visiva.                                  |
| `_document-form.scss`                                                                    | l'anatomia della maschera documento, condivisa da sei schermate          |
| `_document-form-footer.scss`                                                             | la banda finale (note, totali, azioni) della stessa maschera             |
| `_shared-directives.scss`                                                                | l'aspetto delle classi applicate dalle direttive di `shared/directives/` |
| `_breakpoints.scss` · `_responsive-table.scss` · `_list-page.scss` · `_detail-page.scss` | librerie di mixin: non emettono CSS finché qualcuno non le include       |

Le due ragioni per promuovere al livello globale, e non ce ne sono altre:

1. **Una direttiva non può avere un `styleUrl`.** La classe che applica all'host
   resterebbe senza vestito, e ogni feature che la usa se lo ricucirebbe addosso.
2. **Lo stesso foglio in `styleUrls` di più componenti viene compilato una volta
   per ciascuno.** `_document-form.scss` era il foglio dell'arrivo merce e cinque
   componenti lo referenziavano: cinque copie della stessa CSS nel bundle.

Un pattern usato da più schermate ma che sta in **un solo** componente non sale:
diventa un componente condiviso in `shared/` o `domain/`, che è il livello dove
markup e stile restano insieme.

### Card

- Background `--color-surface`
- Bordo `1px solid --color-border`
- Radius `--radius-lg`
- Ombra `--shadow-card`
- Padding interno: `--space-16` mobile, `--space-12` a `--space-14` desktop denso

### Bottoni

Altezze:

- Desktop denso: 31–34px
- Desktop standard: 34–36px
- Mobile: **44px**

Varianti:

- **Primary**: bg `--color-primary`, testo bianco, weight 600
- **Secondary**: bg `--color-surface`, bordo `--color-border-strong`, testo `--color-text`
- **Ghost**: transparent, testo `--color-primary`, hover bg `--color-primary-subtle`
- **Danger**: hover bg `--color-danger-subtle`, testo `--color-danger`, bordo tinta

Regola: **una sola primary CTA per vista**. Le azioni secondarie sono secondary o ghost.

### Input

- Altezza: 27–29px desktop denso; 32–34px desktop standard; **≥44px mobile con font ≥16px**
- Bordo `1px solid --color-border`, hover `--color-border-strong`, focus `--color-focus` + ring `0 0 0 3px --color-focus-ring-alpha`
- Radius `--radius-sm`
- Padding orizzontale: `--space-8`

### Pill di stato

- Formato: `fg pieno + bg 12% alpha + bordo 25% alpha` dello stesso colore
- Padding `3px 8px`, radius `--radius-pill`, weight 700, size 11px

### Azioni documento (per device)

Il pattern di "salvataggio e uscita da un documento in edit" cambia con la larghezza schermo per ergonomia diversa (mouse su desktop, pollice su mobile).

**Desktop** — Footer sticky in basso alla pagina:

- Altezza 60–62px
- Background `rgba(255,255,255,.94)` + `backdrop-filter: blur(12px)`
- Bordo superiore `--color-border`, ombra `--shadow-footer`
- Contenuto: a sinistra info sintetica di stato (es. "Modifiche non salvate", "Documento salvato"); a destra i pulsanti azione (primary a destra estrema)
- Sequenza pulsanti (destra a sinistra): **Chiudi** (ghost) · **Salva bozza** o simile (secondary) · **Salva/Concludi** (primary)

**Mobile e tablet (≤ 1024px)** — Azioni in fondo al documento:

- I pulsanti **Annulla** (secondary) e **Salva ordine** (primary) vanno posizionati in fondo al documento, dopo il riepilogo totali, come coppia allineata a destra: Annulla a sinistra di Salva ordine
- Nessuna barra sticky in basso, nessun pulsante azione in topbar
- La topbar mobile mantiene la sua configurazione standard (hamburger, ricerca globale, chip sync, avatar)
- Il totale documento va in coda al documento come sezione finale (vedi §7)

### Barra azioni sticky mobile

Distinta dalle azioni documento: quella barra riguarda **salvare e uscire**, questa riguarda **inserire prodotti** mentre si compila. Convivono senza contraddirsi — Annulla/Salva restano in fondo al documento e scorrono col contenuto.

- Compare **solo su mobile** e **solo durante l'edit** di un documento (Ordine cliente: `/app/sales/new` e `/app/sales/:id`); mai su desktop né su altre schermate
- Altezza 44px, full-width, `position: fixed` con `bottom: 0`: la barra tocca il bordo inferiore utile dello schermo, senza spazio decorativo sotto. Il documento compensa con un `padding-block-end` pari all'ingombro, così l'ultima riga non finisce nascosta
- `env(safe-area-inset-bottom)` solo per non finire sotto la home bar di iOS/Android, mai come spaziatura estetica
- Background `--color-surface`, bordo superiore `--color-border`, ombra `--shadow-card` per staccarsi dal contenuto che scorre sotto
- Due bottoni affiancati, stessa larghezza (`flex: 1`), gap 8px, padding orizzontale 12px:
  - **Scansiona** (secondary) a sinistra — icona fotocamera, apre lo scanner
  - **Aggiungi prodotto** (primary) a destra — apre la modale selezione prodotti
- Le azioni rare (es. «Nuovo prodotto», che crea un articolo da zero) non stanno qui: vivono come ghost compatto sopra la lista righe

### Modale selezione prodotti

Componente condiviso, usato dal pulsante «Aggiungi prodotto».

- **Mobile**: pannello full-screen che sale dal basso. **Desktop**: dialog centrato, larghezza contenuta. Stesso markup, cambia solo il CSS
- **Header sticky**: titolo «Seleziona prodotti» a sinistra, X a destra. Nel secondo livello il titolo diventa il nome del prodotto, con freccia indietro
- **Ricerca**: input «Cerca prodotti…» che filtra per nome, SKU o EAN
- **Primo livello — prodotti**: miniatura (placeholder se assente) + nome + prezzo indicativo. Tap apre il secondo livello
- **Secondo livello — varianti**: sostituisce la lista nella stessa modale. Ogni riga ha checkbox + descrizione variante (es. «M · Rosso») + prezzo + disponibilità colorata. Selezione multipla
- **Footer sticky**: «Aggiungi» primary a piena larghezza, disabilitato finché non c'è almeno una variante selezionata
- **All'aggiunta**: una riga documento per ogni variante selezionata, quantità 1, modificabile poi sulla card
- **Prodotto con una sola variante**: il tap sul primo livello lo aggiunge subito, senza secondo livello (non c'è nulla da scegliere)

### Messaggio in linea (`app-inline-banner`)

Errore di fetch, esito di un'azione, avviso non bloccante: un solo componente,
`tone` fra `error · warning · success · info · neutral`, `dismissLabel`
opzionale. **Il ruolo ARIA segue il tono**, non è una scelta di chi chiama:
`error` e `warning` interrompono la lettura (`role="alert"`), gli altri
aspettano la pausa (`role="status"`).

Non va usato per l'errore di un singolo campo: quello sta sotto il campo, come
testo, ed è un'altra cosa (vedi «Error state» sotto).

### Stati vuoti / caricamento / errore

- Empty state: icona in medaglione tondo 48×48px su `--color-surface-soft`, titolo H2, descrizione muted, CTA se ha senso
- Loading: skeleton per liste, tabelle, card. Spinner solo per attese brevi
- Error: banner inline sopra il contenuto, testo `--color-danger`, bg `--color-danger-subtle`

---

## 6. Tabella (desktop) e card view (mobile)

Le tabelle sono l'elemento centrale del gestionale.

### Tabella desktop

- `table-layout: fixed`, `width: 100%`, colonne in `%`
- **Header**: h32, padding 4×6, font 9.5px uppercase weight 760, tracking .045em, muted, bg `--color-table-header-bg`, bordo inferiore `--color-border-strong`
- **Righe**: h30, padding 2×5, font 12.5px, bordo 1px `--color-border-cell`
- Hover riga: bg `--color-surface-hover`
- Selezione riga: bg `--color-primary` al 6% + checkbox `--color-primary`
- Colonne numeriche: allineate a destra, `tabular-nums`, `white-space: nowrap`
- Testo lungo in cella: ellipsis oltre 24ch con `title` per full text
- SKU / EAN: `--font-mono`, size 12px, colore `--color-focus` se cliccabile
- Sticky header sul bg dell'header (non su surface)

### Gruppi di colonne

Su tabelle documentali (righe ordine, arrivi, ecc.) le colonne si raggruppano per famiglia con background differenziato molto tenue:

- Stock / disponibilità
- Vendita / prezzo
- IVA / imposte
- Calcoli / totali

Separatori verticali forti tra gruppi: `border-right: 2px solid var(--color-table-group-divider)`. Dentro un gruppo, i divisori restano leggeri.

Le tinte dei gruppi sono token globali: ogni tabella documentale usa gli stessi,
mai una tinta propria per maschera.

| Gruppo           | Fondo intestazione       | Testo                    | Divisore                   | Fondo cella          |
| ---------------- | ------------------------ | ------------------------ | -------------------------- | -------------------- |
| Stock            | `--table-group-stock-bg` | `--table-group-stock-fg` | `--table-group-stock-rule` | `--table-cell-stock` |
| Vendita          | `--table-group-sale-bg`  | `--table-group-sale-fg`  | `--table-group-sale-rule`  | —                    |
| Calcoli / totali | `--table-group-calc-bg`  | `--table-group-calc-fg`  | `--table-group-calc-rule`  | `--table-cell-calc`  |

Hover di riga per gruppo: `--table-row-hover-stock`, `--table-row-hover-calc`;
totale di riga `--table-cell-total`.

### Card view mobile (tabella su schermi ≤1024px)

Su schermi stretti la tabella si trasforma. Ogni riga diventa una card con:

**Head (sempre visibile, `padding: 9px 10px`):**

- Nome prodotto (14.5px weight 700, ellipsis)
- Sub info sotto (11px muted: codice, SKU, sintesi)
- Tre **metric chip** a destra: **Qtà · Prezzo · Totale**
  - Ogni chip: min-width 55px, padding 4×6, bg `--color-surface-soft`, radius `--radius-sm`
  - Label piccolo uppercase (9px muted) + valore (12.5px)
  - L'ultimo chip (Totale) più marcato: bg `--color-primary-subtle`, testo `--color-primary`, weight 700
- Chevron a destra: `--color-text-muted`, ruota 180° quando aperta

**Body (visibile quando espansa, background `--color-surface-soft`):**

- Grid 2 colonne, gap `--space-8`
- Suddiviso in **gruppi funzionali** con titoli piccoli uppercase separati da divisori:
  - Articolo (codice, SKU, EAN, nome, cerca prodotto)
  - Magazzino (disponibile, impegnata, unità di misura, impegna magazzino)
  - Vendita (costo, prezzo, sconto, prezzo scontato, IVA)
- Ogni campo: label uppercase 9px + input h35–38 font 12.5px (nel body espanso il font può scendere sotto 16px perché non è la vista primaria, mentre nelle azioni sempre visibili resta ≥16px)

**Regola importante:** i valori primari (nome, codice, quantità, prezzo, totale) restano leggibili sulla card chiusa. Espandere serve solo per informazioni secondarie o edit di campi meno frequenti.

---

## 7. Anatomia form documento (Ordine cliente, Arrivo merce, DDT, ecc.)

I documenti hanno tutti la stessa anatomia. Le differenze sono contenutistiche (nomi campi, colonne righe), non strutturali.

### Testata (desktop)

Card unica con griglia campi bordati. Ogni campo:

- Padding cella `6px 11px`
- Label uppercase 10px weight 760 sopra il campo, muted
- Input **senza bordo proprio**, h 27–29, dentro la cella
- Focus: la cella intera prende bordo `--color-focus` inset + bg `--color-primary-subtle`
- Divisori: bordo destro `--color-border` tra le celle; l'ultima colonna della riga non ha bordo destro

Griglia esempio Ordine cliente: `Cliente · Location · Data · Stato · Riferimento` prima riga; `Consegna · Pagamento · Note` seconda riga (secondaria, bg `--color-surface-soft`).

### Testata (mobile)

**Comprimibile**. In stato chiuso mostra solo un riepilogo:

- Icona identità documento (30×30, bg `--color-primary-subtle`)
- Nome contesto principale (es. nome cliente, 13px)
- Sotto: sintesi seconda riga (11px muted, es. "Magazzino test 3 · 25/07/2026 · Confermato")
- Link "Modifica" o "Espandi" a destra + chevron

In stato aperto: griglia dei campi come da testata desktop, ma con campi in colonna singola e h 44px — il minimo touch, non di più: cinque campi devono stare in una schermata, non in uno scroll.

Spaziature della testata su mobile: padding verticale della cella 4px, orizzontale 8px. I campi restano distinti grazie al filo che li separa, non all'aria intorno.

**Input senza box, con feedback minimo di editabilità.** Dentro un contenitore che ha già il suo bordo, incorniciare anche ogni campo crea una doppia parete e ruba larghezza. Quindi su mobile:

- Il controllo non ha bordo proprio né sfondo: si appoggia alla superficie della testata (vale anche per select e date picker, che seguono `--color-input-border`)
- A dire che il campo è editabile basta il filo tenue sotto la cella; al focus quel filo prende `--color-focus`
- Il chevron dei select resta: è l'indizio che il campo si apre
- Padding interno generoso: il campo resta comodo da premere anche senza cornice
- Label del campo in **case normale** (vedi §3), non uppercase: a quella dimensione il maiuscoletto si legge peggio e stona col testo dell'input

### Righe (desktop = tabella, mobile = card)

Vedi §6.

### Riga "Documento collegato" (preventivo, ordine origine)

- Full-width, occupa tutta la riga tabella (`colspan`)
- Accento laterale sinistro: `border-left: 3px solid var(--color-info)` desktop
- Background riga: `var(--color-surface-soft)`
- Contenuto: icona sorgente + tipo documento (pill) + titolo + data + meta (importo, ecc.)
- Tinte proprie, **ardesia e non azzurro**: è un riferimento, non un avviso.
  `--color-doc-ref-bg/-fg/-accent/-line/-title/-muted` e, per la pill,
  `--color-doc-ref-chip-bg/-fg/-line`. Mapparla su `--color-info` la trasforma
  in una banda blu in mezzo alle righe.

### Riepilogo totali

**Desktop.** Griglia orizzontale in card compatta, posizionata dopo la tabella righe: Imponibile righe · Sconto extra · Imponibile · IVA · Totale documento. Il **Grand total** è l'ultimo box, con piena tinta brand `--color-primary`, testo bianco, valore 22–24px weight 700. Valori intermedi weight 600, non tutti bold. Caselle dimensionate sul contenuto, non stirate.

**Mobile e tablet.** Sezione finale del documento (dopo le righe e le note), non sticky. Lista verticale con label a sinistra e valore a destra:

- Subtotale
- Sconto extra (con link "Aggiungi sconto" se non valorizzato)
- IVA
- **Totale documento** più marcato, 20px weight 700, valore in colore `--color-primary`

Il totale mobile è visibile solo scrollando fino in fondo; i pulsanti Annulla / Salva ordine seguono subito dopo, come coppia allineata a destra (vedi §5).

### Note documento

- Label 10px uppercase
- Textarea min-height ~44px, max ~90px, resize verticale
- Font 12.5px, line-height 1.35

### Azioni documento

Vedi §5 "Azioni documento (per device)": desktop usa footer sticky in basso; mobile e tablet mostrano Annulla/Salva ordine in fondo al documento dopo il riepilogo totali.

---

## 8. Shell applicativa

### Sidebar

- Larghezza 232px su desktop
- Background `--color-nav-bg` (verde-scuro, dedicata alla shell)
- Bordo destro sottile `1px solid rgba(255,255,255,.06)`
- Padding contenuto: `16px 12px`
- Logo VestiFlow in cima con divisore sotto (`--color-nav-divider`)
- Voci: icona 15–16px + label, colore `--color-nav-fg`
- Voce hover: bg leggermente più chiara del bg (senza uscire dalla famiglia)
- Voce attiva:
  - background `--color-nav-selected-bg`
  - testo e icona `--color-nav-selected-fg` (bianco)
  - indicatore laterale sinistro `inset 2px 0 0 var(--color-nav-selected-fg)`
- Sezioni interne (headers "Vendite", "Magazzino", ecc.): testo `--color-nav-fg-muted`, uppercase 10px weight 700
- Badge contatori (es. "Ordini fornitore 6"): pill 11px weight 600, colore chiaro su bg leggermente più scuro del selected
- Su mobile: collassata in drawer, aperta da hamburger in topbar

### Topbar

- Altezza 52–56px
- Background `rgba(255,255,255,.96)` + backdrop-blur
- Bordo inferiore `--color-border`
- Contenuti da sinistra a destra:
  - Su mobile: hamburger drawer sidebar
  - **Ricerca globale** (vedi sotto)
  - Chip stato sync Shopify (pill `--color-shopify` con dot)
  - Selettore location / negozio attivo
  - Toggle tema
  - Avatar utente 32–34px

### Ricerca globale ⌘K

Barra di ricerca al centro-sinistra della topbar, width ~350px su desktop, restringibile su tablet.

Comportamento:

- Placeholder tipo "Cerca prodotti, ordini, clienti…"
- Comando tastiera: `⌘K` su Mac, `Ctrl+K` su Windows — indicato con kbd inline
- Al click / comando apre una palette modale al centro dello schermo:
  - Input grande, focus automatico
  - Sotto, risultati raggruppati per categoria (Prodotti, Ordini, Clienti, Documenti, Azioni rapide)
  - Navigazione tastiera: ↑↓ per selezionare, Invio per aprire, Esc per chiudere
- Ogni risultato: icona categoria + titolo + meta (SKU, data, ecc.)

Su mobile: la barra diventa un'icona lente; il tap apre la palette full-screen.

---

## 9. Responsive breakpoints

| Nome            | Range       | Comportamento chiave                                                                            |
| --------------- | ----------- | ----------------------------------------------------------------------------------------------- |
| Phone stretto   | ≤ 400px     | Testata form in 1 colonna, padding ridotti al minimo                                            |
| Phone           | 401–480px   | Card mobile compatte, metriche essenziali                                                       |
| Mobile / Tablet | 481–1024px  | Card view sostituisce tabelle, testata comprimibile, azioni Annulla/Salva in fondo al documento |
| Desktop         | 1025–1799px | Layout standard, tabelle piene, sidebar persistente                                             |
| Desktop largo   | ≥ 1800px    | `max-width` contenuto a 1720px, no stiramento                                                   |

Token breakpoint: solo variabili CSS, mai valori px in `@media`.
