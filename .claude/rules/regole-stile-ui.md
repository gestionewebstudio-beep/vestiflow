# regole-stile-ui — VestiFlow Restyle Spec

Fonte di verità visiva per l'intera app. Ogni modifica UI deve rispettare questo documento. In caso di conflitto con altri file o mockup precedenti, vince questo.

Ultima revisione: agosto 2026.

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

| Uso                               | Valore                 | Token                    |
| --------------------------------- | ---------------------- | ------------------------ |
| OK / successo / stock disponibile | `#2d7557`              | `--color-ok`             |
| OK tinta chiara                   | `#edf6f1`              | `--color-ok-subtle`      |
| Warning / allerta stock / ambra   | `#9a640c`              | `--color-warning`        |
| Warning tinta chiara              | `#fff6e7`              | `--color-warning-subtle` |
| Danger / errore / eliminazione    | `#b33a32`              | `--color-danger`         |
| Danger tinta chiara               | `#fff0ee`              | `--color-danger-subtle`  |
| Info / neutro attivo              | `#2d6685`              | `--color-info`           |
| Info tinta chiara                 | `#eef6fa`              | `--color-info-subtle`    |
| Campo obbligatorio ancora vuoto   | `rgb(157 69 16 / .63)` | `--color-field-waiting`  |

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
   | `action-menu`       | `--action-menu-pad-inline`, `--action-menu-inline-size` (solo sul trigger nominato); l'altezza segue `--field-height`                                                 |
   | `attachments-panel` | `--attachments-gap`, `--attachments-title-size`, `--attachments-item-pad`                                                                                             |
   | `barcode-scanner`   | `--barcode-scanner-w`                                                                                                                                                 |
   | `hover-tooltip`     | `--hover-tooltip-inset`                                                                                                                                               |
   | celle di riga       | `--doc-code-cell-fg`, `--doc-product-cell-weight`, `--doc-select-cell-toggle-w`                                                                                       |
   | pannello riga       | `--doc-suggestions-z`, `--doc-suggestions-offset`, `--doc-suggestions-inset`, `--doc-suggestions-max-h`, `--doc-suggestions-item-min-h`                               |

   **`app-button` ha l'host `display: contents`**: e' il `<button>` interno a
   stare nel flusso del contenitore. `flex` e `grid-column` vanno quindi
   dichiarati come `--button-flex` / `--button-grid-column`, non sull'elemento
   `<app-button>` — li' non avrebbero effetto.

3. **Il default del componente stesso** — quando ciò che il chiamante vuole non
   è una sua preferenza ma **il design giusto**. In quel caso non si configura
   nulla: si cambia il componente. Se una maschera ridefinisce un componente
   condiviso in 15 regole, non sta personalizzando — sta dicendo che il default
   è sbagliato.

### Filtri e barre strumenti dense — configurazione di contenitore

Una riga di filtri o di azioni non è un campo isolato in mezzo alla pagina: è
un ruolo diverso da un controllo autonomo, e si dichiara con la tecnica del
punto 2 sopra — custom property sul CONTENITORE, mai sul singolo `select-menu`
o `app-button` dentro.

```scss
.mia-toolbar {
  --field-height: var(--control-h-field); // 32px — select, date, campi
  --field-font-size: var(--text-xs); // 12px
  --button-font-size: var(--text-xs); // stesso passo per i bottoni dentro
}
```

`_document-form.scss` lo applica a `.doc-form__header`; `corrispettivi-report`
allo stesso modo su `.corrispettivi__filters`. Per una barra di sole azioni
(niente filtri) la coppia è `--control-h-button` (31px) invece di
`--control-h-field` — vedi `.doc-form__actions` / `.corrispettivi__header-actions`.

**Due proprietà, non una.** `select-menu` legge `--field-font-size`;
`app-button` legge `--button-font-size` — due nomi diversi per lo stesso
ruolo. Dichiararne una sola lascia la famiglia di controlli dell'altra alla
taglia vecchia mentre il resto della riga è già sceso: misurato su
`app-table-column-picker` (un `app-button` dentro una riga filtri con solo
`--field-font-size` impostata), restava a 13px da solo mentre i `select-menu`
accanto erano già a 12px.

### Su mobile si riduce il NUMERO dei comandi, non la loro taglia _(18/08/2026)_

Il minimo tappabile di 44px non si tocca: i token lo impongono da soli sotto
`md`, e stringere i controlli per far entrare tutto è la strada sbagliata.
Quello che si riduce è **quanti comandi stanno a vista**.

Misurato sul Registro Corrispettivi: cinque pulsanti di testata più sei chip
filtro occupavano **cinque fasce da 44px** prima del primo dato, su uno schermo
da 390px. Ridotte a due, senza togliere una sola funzione.

| Cosa                              | Sotto `lg`                                                                | Come                                                  |
| --------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------- |
| **Filtri** (più di due)           | un pulsante **«Filtri (n)»** col conteggio, che apre un `app-slide-panel` | mixin `list-page-mobile-filters` in `_list-page.scss` |
| **Azioni di export / secondarie** | un menu **nominato** («Esporta»)                                          | `app-action-menu` con `triggerLabel`                  |
| **CTA primaria**                  | sale nella riga del titolo, con etichetta corta                           | il nome per esteso resta in `ariaLabel`               |

**Le due vesti chiamano gli stessi metodi.** Non esiste un comportamento «del
menu» separato da quello dei pulsanti, né uno stato «del pannello filtri» da
riallineare: i controlli dentro il pannello scrivono sugli stessi signal dei
gemelli in barra.

⚠️ **La soglia è UNA e vale per tutte le coppie.** Se la veste compatta e
quella estesa commutassero a larghezze diverse, in mezzo comparirebbero
entrambe — è il difetto che §9 chiama «la stessa riga non esiste due volte».

**Un comando mobile-only sta nel DOM dove serve a lui.** «Esporta» è spento
sopra `lg`, quindi la sua posizione nel markup conta solo dove si vede: sta
nella fila di Filtri e Colonne, non nella testata insieme ai pulsanti che
sostituisce.

**L'etichetta corta si accorcia solo se il contesto la completa.** «Nuovo»
funziona sotto un titolo «Corrispettivi»; da solo, in un elenco di comandi
letto da uno screen reader, no — per questo `app-button` ha `ariaLabel`.

### Elenco troncato: si limita la VISTA, mai il dato _(18/08/2026)_

Su schermo compatto un elenco lungo rende irraggiungibile ciò che gli sta
sotto — in un report, il riepilogo. Si mostra un primo blocco di righe e si
offre un comando per il resto.

- **Solo su schermo compatto** (`ViewportService.compact()`), mai su desktop:
  lì la tabella è densa e scorrere costa un gesto, non un minuto.
- **Il comando dice QUANTE righe restano** — «Mostra le altre 47 righe» — non
  «Mostra altre righe»: senza il numero non si capisce se ne mancano tre o
  trecento.
- ⚠️ **Totali, subtotali e conteggi NON si ricalcolano da ciò che è a schermo.**
  Arrivano dall'API e valgono l'intero periodo. È la condizione che rende il
  troncamento ammissibile in un registro fiscale — e va **verificata**, non
  data per scontata: se un totale fosse una somma delle righe renderizzate,
  troncare l'elenco falserebbe il registro.
- **Serve un test che inchiodi il confine**: su schermo non compatto nessun
  troncamento, e tutte le righe consegnate restano a schermo.

### `select-menu` — tre modalità di larghezza, e non sono intercambiabili

Il trigger di `select-menu` di default ha larghezza fissa
(`--select-menu-width`, 224px). Tre `input()` la cambiano, e ognuno porta una
semantica diversa oltre alla misura — scegliere quello sbagliato aggiunge un
comportamento che quel campo non deve avere, non solo una larghezza diversa.

| Modalità              | Larghezza                                                | Porta anche                                                     | Quando                                                                                                             |
| --------------------- | -------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| _(default)_           | fissa                                                    | —                                                               | il valore può essere lungo e imprevedibile, o la griglia deve restare stabile                                      |
| `[filterChip]="true"` | a contenuto, variabile                                   | stato attivo/cancellabile (×)                                   | un filtro genuinamente OPZIONALE, assente di default — l'utente lo accende                                         |
| `[fitContent]="true"` | a contenuto ma STABILE (pre-misurata su `sizerLabels()`) | —                                                               | un controllo che ha SEMPRE un valore (Periodo, Raggruppa): non deve «saltare» larghezza cambiando opzione          |
| `[labelOnly]="true"`  | a contenuto                                              | il trigger mostra SOLO il nome del filtro, mai il valore scelto | la stabilità della barra conta più che vedere il valore nel trigger (Origine, Tipo, Sede in una riga filtri densa) |

`filterChip` su un controllo che ha sempre un valore aggiunge una × che
cancella un filtro che non può restare vuoto: è l'errore che sembra innocuo
finché qualcuno non la preme.

### `segmented` — variante `flat` e slot `panelLead`

`[flat]="true"` toglie sfondo e bordo della pista e usa le altezze/font della
barra densa (`--control-h-button` / `--text-xs`): la scorciatoia smette di
sembrare un controllo a sé e si legge come parte del filtro che la ospita.

Per una scorciatoia legata a UN filtro solo (non a tutta la barra),
`select-menu` espone lo slot proiettato `panelLead` dentro il proprio pannello
a tendina — vuoto per default, non occupa spazio se nessuno lo riempie:

```html
<app-select-menu ...>
  <app-segmented panelLead [flat]="true" ...></app-segmented>
</app-select-menu>
```

Riferimento: Ambito (Fisico/Online/Manuale) dentro il pannello di Origine, in
`corrispettivi-report`.

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

### I due controlli automatici sui token

`npm run check:tokens` (dentro `npm run lint`) fa fallire la build su due difetti
che non si vedono, non rompono nulla in compilazione e non fanno arrossare un test:

1. **Parità fra i temi.** Un token dichiarato in `theme-light` e non in
   `theme-dark` non ha valore quando il tema è scuro: la dichiarazione che lo usa
   diventa invalida e il browser la scarta. Il colore sparisce per metà degli
   utenti, in silenzio. È già successo — tredici token aggiunti al solo tema
   chiaro.
2. **Token fantasma.** Un `var(--x)` senza fallback su un nome che nessuno
   dichiara fa la stessa fine, e capita a ogni rinomina. Ne sono stati trovati
   undici, tutti preesistenti: `--color-text-primary`, `--space-sm`,
   `--focus-ring-color`, `--opacity-muted`…

Non controlla i valori: quelli sono una scelta di design, e la fonte di verità è
questo documento.

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

⚠️ **Un mixin che serve a chi non vuole tutto il resto va estratto.**
`list-page-mobile-filters` (il pulsante «Filtri (n)», il suo contatore e il
pannello) stava dentro `list-page`, e chi aveva un layout proprio — il Registro
Corrispettivi — per usarlo si sarebbe tirato dietro header, toolbar, ricerca e
campi che non gli servono. Estrarlo non ha cambiato una riga per le quattro
pagine che già lo usavano: `list-page` continua a includerlo.

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

### Riepilogo di fondo pagina (report / elenchi) — _rivisto 18/08/2026_

Distinto dal «Riepilogo totali» di un documento (§7): quello chiude un
documento che si sta scrivendo, questo riassume un elenco filtrato che si sta
consultando (es. Corrispettivi). Riferimento: `corrispettivi-summary`.

⚠️ **Questa sezione è stata riscritta**: la prima stesura (mattina del 18/08)
prescriveva «niente card, un solo filo sopra» e le voci allineate a sinistra.
Provata a schermo, non reggeva — la cronaca sta sotto, perché le alternative
scartate sono la parte utile.

**La struttura**

- **UN riquadro**, non uno per voce: `--color-surface`, bordo `--color-border`,
  `--radius-lg`. Un riepilogo è una riconciliazione — numeri che stanno insieme
  e si sommano — e va dichiarato un blocco solo.
- **Le voci si separano con un filo verticale** (`border-inline-end`, tolto
  sull'ultima), mai con un riquadro ciascuna. Il `gap` orizzontale resta `0`:
  lo spazio lo dà il padding della voce, o il filo cade in mezzo a un vuoto
  doppio.
- **Due fasce, divise da un filo orizzontale**: sopra i **conteggi** (quante
  rettifiche, quanti annullamenti, quante vendite), sotto gli **importi**
  (imponibile, IVA, totale vendite, e per ultimo il totale che risponde alla
  domanda della pagina). Un conteggio e un importo rispondono a domande
  diverse: nella stessa fila si leggono come se fossero la stessa grandezza.
- **Le colonne se le conta la griglia**: `repeat(auto-fit, minmax(var(--summary-item-min-w), 1fr))`
  su ogni fascia. Con le fasce separate una da tre voci occupa tre colonne e
  una da quattro ne occupa quattro, **a qualunque larghezza e senza una sola
  media query**. Il componente di riferimento aveva tre blocchi responsive: ora
  ne ha zero.
- **`--summary-item-min-w` si misura sull'etichetta più lunga**, non si sceglie
  a occhio: larghezza del testo a `--text-2xs` uppercase con tracking `.045em`,
  più il padding orizzontale della voce. Le `dt` portano `white-space: nowrap`
  apposta — se un'etichetta più lunga non ci stesse, il difetto deve vedersi
  subito invece di nascondersi in un a capo silenzioso.

**La tipografia** (invariata, e verificata)

- **La label (`dt`) riusa la ricetta dell'intestazione tabella**: `--text-2xs`,
  weight `--font-weight-bold`, `--color-table-header-fg`, uppercase,
  `letter-spacing: .045em`. Un'etichetta che riassume una tabella e un'etichetta
  di colonna della stessa tabella sono lo stesso ruolo — pesano uguale.
- **Il valore (`dd`) pesa un gradino SOTTO il corpo tabella**: `--text-xs`,
  weight `--font-weight-regular`. Riassume un dato già leggibile riga per riga
  sopra, non è un dato nuovo.
- **Un solo valore evidenziato**: `--text-lg`, `--font-weight-bold`,
  `--color-primary`, e **nessuna tinta di fondo** — una cella colorata dentro
  il riquadro sarebbe il riquadro nel riquadro. A distinguerlo bastano taglia
  e peso, che restano unici in tutta la banda.
- **Il negativo si legge dal colore, non dal peso**: `--color-danger` sul solo
  `dd`, come le righe di reso in tabella.

**Allineamento: a destra, etichetta compresa, alle due larghezze**

È la convenzione contabile — cifre a destra, unità sotto unità, somma
verificabile a occhio.

⚠️ **Funziona solo grazie al riquadro unico**, e la ragione va ricordata: nella
variante a scatole separate le etichette di lunghezza diversa lasciavano un
bordo sinistro frastagliato e la banda sembrava sfilacciata. Con i fili interni
la linea verticale c'è comunque, quindi il testo può andare a destra senza che
niente si sfilacci. Chi tornasse alle scatole separate si riporterebbe dietro
il difetto.

**Le due strade scartate, e perché**

| Provata                                 | Perché non regge                                                                                                                                                                                                                                   |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Lista verticale** (una riga per voce) | ~190px su un telefono, cioè un quarto di schermo — e in fondo a una pagina lunga, dove ci si arriva dopo aver scorso tutto. La regola §7 la prescrive per i **documenti**, che hanno quattro voci: applicarla a un report da otto è stato l'errore |
| **Un riquadro per voce** (otto scatole) | isola troppo: otto scatole affiancate si leggono come otto dati indipendenti, mentre un riepilogo è fatto di numeri che si sommano fra loro                                                                                                        |

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
- La banda note/totali che le sta sopra è invece **opaca**: è appiccicata in basso e su un documento corto passa sopra il piede della tabella. A tinta velata il testo sotto traspariva e si leggeva sovrapposto — coperto è coperto, e torna visibile scorrendo
- Bordo superiore `--color-border`, ombra `--shadow-footer`
- Contenuto: a sinistra info sintetica di stato (es. "Modifiche non salvate", "Documento salvato"); a destra i pulsanti azione (primary a destra estrema)
- Sequenza pulsanti (destra a sinistra): **Chiudi** (ghost) · **Salva bozza** o simile (secondary) · **Salva/Concludi** (primary)

**Le etichette sono le stesse in ogni documento** _(08/2026)_. Il salvataggio dice **«Salva documento»** ovunque — non «Salva ordine», non «Salva registrazione», non «Salva»: chi passa da una maschera all'altra cerca lo stesso pulsante, e il tipo di documento è già scritto nel titolo della pagina. L'uscita dice **«Chiudi»** su desktop e **«Annulla»** nella coppia mobile.

⚠️ **L'unica eccezione, e la regola che la governa** _(17/08/2026)_. La frase dice «in ogni **documento**»: vale per ciò che un documento è. Il **Corrispettivo manuale** non lo è — non ha una riga in `documents`, non si stampa come documento, non entra nella matrice dei permessi documentali, e la specifica `10` §12 lo dichiara «registrazione economica autonoma». Lì il pulsante dice **«Salva corrispettivo»**.

> **Il criterio non è il gusto: è se l'entità sta in `documents`.** Chiamare «documento» una cosa che il modello non tratta come tale insegna all'operatore una parola che poi non ritrova da nessun'altra parte — né nel Registro, né nei permessi, né in guida. Una maschera che non è documentale nomina la propria entità; tutte le altre dicono «Salva documento», e questa eccezione non le riapre.

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

### Cella a ricerca-e-selezione (`app-document-line-select-cell`) _(08/2026)_

La cella di riga documento dove il valore si **sceglie da un elenco breve di
voci con un codice**: Codice IVA, unità di misura. Sostituisce `app-select-menu`
dentro le righe, e solo lì — le altre 179 istanze del menu restano dove sono.

È un `<input>` vero, non un `<button>` con l'etichetta dentro, e da qui discende
tutto il resto: porta l'`id` che riceve, quindi il giro del fuoco la raggiunge
come ogni altro campo, e all'ingresso il valore si può evidenziare.

- **Entri** → valore selezionato, pronto da sovrascrivere.
- **Digiti** → l'elenco si apre e filtra, **prima per prefisso del codice**, poi
  per il resto. La voce in cima è quella che Invio sceglie senza guardare: un
  ordinamento sbagliato lì scrive un valore sbagliato sulla riga.
- **Invio** prende la voce evidenziata e resta; **Tab** risolve e va al campo
  dopo; **←/→ escono al primo colpo**, senza il secondo tempo del cursore.
- **Testo libero** acceso o spento (`freeText`): U.M. sì, IVA no. Sull'insieme
  chiuso un valore inventato non entra e la cella torna a quello di prima.
- **«» Altro…»** in coda fissa, **fuori** dall'elenco filtrato e fuori dalla
  `listbox`: è un comando, non un valore, e arriva da un `output`. Il pannello
  che apre sta **una volta per maschera**, mai dentro la cella.
- Su **card** si passa `inColumnCycle="false"`: lì le colonne non esistono e il
  Tab resta al browser. L'elenco si comporta uguale, e la scelta si prende
  toccando.

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

### Campo in attesa — `--color-field-waiting` _(08/2026)_

Un campo **obbligatorio, ancora vuoto, che tiene fermo il resto della schermata** si segna con una tinta propria: bordo del controllo in `--color-field-waiting` (terracotta smorzata), impostato dal contenitore via `--field-border-color`.

**Non è `--color-danger`, e la distinzione è il punto.** Il rosso in una maschera vuol dire «hai provato a salvare e questo è sbagliato». Usarlo anche per «non l'hai ancora compilato» rende i due stati indistinguibili proprio dove servirebbe distinguerli: dopo un salvataggio rifiutato il campo sarebbe rosso come un minuto prima. Aprire un documento nuovo non è un errore dell'operatore.

**Il colore sta sul CONTROLLO, non sulla cella.** Una cella di testata è alta — etichetta, campo, e spesso un comando sotto («+ Nuovo cliente») —: un filo sul suo bordo inferiore finisce lontano dal campo e si legge come una riga di separazione. Il canale è `--field-border-color`, che i campi condivisi espongono apposta: il contenitore lo imposta su di sé, il campo dentro lo legge. Mai `::ng-deep`.

**Sfondo: no.** Tingere la cella intera la fa sembrare in errore, che è la lettura da evitare.

### L'errore sotto un campo non ripete il segnaposto _(08/2026)_

Un campo a selezione che dice «Seleziona un fornitore…» e, sotto, un messaggio «Seleziona un fornitore.» sono la stessa frase due volte a quaranta pixel di distanza. Il messaggio dice **«Campo obbligatorio.»**

**Il messaggio non si toglie del tutto**, e non è pignoleria: al rifiuto il segnaposto cambia **solo tinta**, dice le stesse parole di prima. Chi non distingue i colori non vedrebbe accadere nulla. Due parole diverse sotto il campo sono l'unico segnale d'errore che non sia il colore.

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

### Riga di subtotale / gruppo in tabella

Riferimento: `corrispettivi-orders-table` (raggruppamento per giorno).

- **È una riga della tabella, non una card fuori da essa**: cade nelle stesse
  colonne economiche delle righe che chiude — un subtotale si verifica
  incolonnandolo sopra ciò che lo compone, non affiancandolo in un riquadro.
- **Sfondo di STRUTTURA**: `--color-table-header-bg` (lo stesso
  dell'intestazione), mai `--color-surface-soft` — quel tono è già preso da
  righe di transazione singola (es. un reso). Un subtotale e una transazione
  non condividono la stessa tinta, o il primo si legge come un'altra riga di
  evento invece che come struttura.
- **Tre livelli di peso, non due**: la riga intera parte da
  `--font-weight-semibold` (si distingue dal dettaglio sopra, a peso normale);
  il SOLO valore che risponde alla domanda del gruppo (es. il Totale) sale a
  `--font-weight-bold` + `--color-primary`. Pesare tutte le celle del
  subtotale allo stesso modo confonde «chiude il gruppo» con «è la risposta
  del gruppo».

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

### La card di un ELENCO si progetta, non si impila _(18/08/2026)_

Quanto sopra vale per le righe di un documento. Per un **elenco di
registrazioni** (report, registro) il ripiego `data-label` — ogni cella diventa
una riga «etichetta … valore» — non basta: con otto colonne dà otto righe tutte
dello stesso peso, dove niente è primario e la card è più alta dello schermo.

Riferimento: `corrispettivi-orders-table`.

**Il criterio, e va dichiarato: a sinistra le parole, a destra i numeri.**

```text
17 ago 2026  Vendita                              N. 3     ← quando · cosa · quale
Corrispettivo manuale · Magazzino test 3                   ← solo parole
                   Imp. 20,49 €  IVA 4,51 €  25,00 €  ›    ← solo numeri
```

- **Fascia 1 — identità**: due voci brevi, e **non va mai a capo**. Ciò che è
  descrizione (l'origine, la sede) sta sotto: tenerlo qui fa scaricare il
  numero su una riga sua, che alza la card senza dire niente.
- **Un'ancora a destra per fascia**: il numero in alto, il totale in basso.
  Fuori dal gruppo che va a capo, così scorrendo l'elenco stanno sempre nello
  stesso punto e l'occhio li trova senza cercarli.
- **Fascia 3 allineata a destra**: gli importi si incolonnano sotto il totale
  che compongono, come nella tabella desktop. La card non inventa un ordine suo.
- **Il tipo si legge dall'accento laterale** (`border-inline-start`,
  `--border-width-accent`, tinta smorzata con `color-mix`), non da un pallino:
  è il vocabolario già in uso per la riga «Documento collegato» (§7) e per la
  voce attiva in sidebar. **Tinta smorzata** perché qui ogni riga ha un tipo —
  il colore accompagna, non segnala un'eccezione.
- **Segnali ridondanti si tolgono**: se una rettifica è già dichiarata
  dall'accento rosso, dalla parola rossa e dagli importi rossi, lo sfondo tenue
  della riga desktop non aggiunge nulla e disegna un riquadro dentro il riquadro.
- **Lo spazio di un elemento condizionale si riserva sempre.** Il chevron manca
  sulle righe che non si aprono: se sparisse anche il suo ingombro, i totali di
  quelle card slitterebbero e la colonna degli importi non sarebbe più dritta.
  `visibility: hidden`, non `display: none`.

⚠️ **Due vesti significano gli stessi dati due volte nel DOM**, e questo è un
difetto di accessibilità che non si vede: uno screen reader annuncerebbe ogni
riga due volte. La divisione dei ruoli è obbligatoria —

- la **cella card** è una veste: porta `aria-hidden="true"`;
- le **celle vere** sono i dati: sotto `lg` si nascondono all'occhio con la
  ricetta `.sr-only` (`clip-path`), **mai con `display: none`**, che le
  toglierebbe anche all'albero accessibile.

Serve un test che lo tenga fermo: è invisibile a chi guarda, e nessun controllo
di layout lo trova.

### Due trappole tecniche che costano un giro di correzioni _(18/08/2026)_

**1. La specificità batte l'ordine.** In un blocco mobile, `.mio-blocco__card`
(una classe) **perde** contro `.mio-blocco__row td` (classe + elemento) scritto
sopra per il desktop: `padding: 0` e `border: 0` non vengono applicati, e nella
card compaiono un padding di troppo e un filo in basso che sembrano un riquadro
interno. Il selettore mobile deve portare anche l'elemento:
`.mio-blocco__row td.mio-blocco__card`.

**2. `margin-inline-start: auto` su un `app-button` non fa niente.** L'host ha
`display: contents` (vedi §5): nel flusso ci sta il `<button>` interno, non
l'host, quindi un margine dichiarato lì non esiste. Per spingere un pulsante a
destra si allarga il fratello (`flex: 1` sul titolo), o si usa
`--button-flex` / `--button-grid-column`.

**La soglia è il mixin `bp.media-down('lg')`** (1024px), non `md` (768px):
sbagliare lascia scoperta la fascia 768–1024px, dove una tabella desktop
stretta forza `overflow-wrap: anywhere` a spezzare le parole a metà pur di non
mostrare la barra orizzontale — misurato su `corrispettivi-orders-table`
(«Rimbors-o», «Non-determinata»). Per le tabelle di RIGHE DOCUMENTO vale invece
il piano a due soglie di §9 («la vista a card di un documento…», deciso ma non
ancora eseguito): le due cose non vanno confuse — un elenco/report usa la
soglia singola qui sopra, una maschera documento userà le due soglie legate al
tipo di puntatore quando quel lavoro sarà fatto.

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
- **Campo obbligatorio ancora vuoto**: bordo del controllo in `--color-field-waiting` finché le righe restano ferme (vedi §5). Sparisce appena compilato, e cede al colore del fuoco quando si entra nel campo

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

**A testata incompleta le righe non si mostrano** _(08/2026)_. Finché mancano i campi obbligatori che le governano — cliente e location, fornitore e magazzino, il solo fornitore — al posto della tabella (e delle card) c'è **uno stato vuoto**: icona, titolo che dice **cosa manca**, una riga su come si riempirà. Il campo che le tiene ferme si segna in testata (vedi «Campo in attesa», §5).

**Non si spegne, non si sbiadisce.** Una tabella intera a metà tinta occupa mezzo schermo per non poter essere usata, e l'opacità crea un gruppo di composizione che fa trasparire ciò che le sta sotto. Se una cosa non è utilizzabile non si veste di grigio: non c'è.

Vale su **tutte** le viste: desktop e mobile mostrano lo stesso stato vuoto, con lo stesso testo.

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

**Desktop.** Griglia orizzontale in card compatta, posizionata dopo la tabella righe: Imponibile righe · Sconto extra · Imponibile · IVA · Totale documento. Il **Grand total** è l'ultimo box, con piena tinta brand `--color-primary`, testo bianco, valore 22–24px weight 700. Valori intermedi weight 600, non tutti bold.

**Caselle dimensionate sul contenuto, non stirate** — e va preso alla lettera: spartire la banda in parti uguali fa sì che la stessa casella sia larga il doppio in un documento con tre voci e la metà in uno con otto, e in una maschera senza fascia note il riepilogo si stira per tutta la pagina. La misura minima di una casella è il suo contenuto, non zero: dove la cella ospita **due cose che si alternano** — il campo sconto e, finché lo sconto non c'è, il pulsante «+ Aggiungi sconto» — la larghezza fissa va sul **campo**, non sulla cella, o il pulsante sborda sopra la casella accanto.

**Mobile e tablet.** Sezione finale del documento (dopo le righe e le note), non sticky. Lista verticale con label a sinistra e valore a destra:

- Subtotale
- Sconto extra — **campo sempre visibile**, che mostra `0%` quando non c'è. Non un pulsante che lo riveli: il pulsante nasconde uno stato, e guardando il riepilogo non si saprebbe se lo sconto è zero o se il campo è chiuso. Un campo che mostra 0% dice entrambe le cose senza chiedere niente, e costa un clic in meno _(deciso 08/2026)_
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

- Larghezza 196px su desktop (`--sidebar-width`; ridotta da 232px il 18/08/2026 dopo prova visiva)
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

### La vista a card di un documento non è la vista stretta: è la vista del dito _(deciso 11/08/2026, da eseguire)_

Il confine unico a `lg` misura la cosa sbagliata. La tabella non vive nella
finestra: vive nell'area contenuto, **232px più stretta** finché la sidebar è
aperta — e a 1024px di finestra le restano ~790px per nove-quattordici colonne.
Ma il problema vero non è lo spazio: è che la tabella si regge su tre cose che
un tablet non ha — il **passaggio del mouse** (con cui si rileggono le
intestazioni tagliate, §6), il **puntatore fine** (la maniglia di
ridimensionamento è larga pochi pixel) e il **Tab**. Un tablet dalla parte della
tabella non è scomodo: è privato degli attrezzi.

E nessuna linea fissa sulla larghezza chiude la questione, perché separa i pixel
e non i dispositivi: alzandola a 1280 resta fuori l'iPad Pro in orizzontale
(1366), alzandola ancora se ne trova un altro sopra.

**Due soglie, non una:**

| Puntatore primario | Card sotto | Perché                                                           |
| ------------------ | ---------- | ---------------------------------------------------------------- |
| **fine** (mouse)   | **820px**  | col mouse la tabella resta usabile e scorre; sotto, non basta    |
| **grosso** (dito)  | **1400px** | appena sopra l'iPad Pro 12.9 in orizzontale, il tablet più largo |

I 2-in-1 si sistemano da soli: tastiera agganciata → puntatore fine → tabella;
staccata → dito → card.

**Più la scelta manuale**, che è la valvola e non il default: l'operatore può
imporre la vista e quel dispositivo se la ricorda. Serve ai casi che nessuna
soglia prende — il monitor touch grande, chi sul portatile preferisce le card.
Il predefinito deve restare giusto per il dispositivo: un comando manuale rimedia
alle eccezioni, non a un default che sbaglia di sistema.

**Vincoli per chi esegue:**

- le due condizioni si scrivono **una volta sola**, in un mixin di
  `styles/_breakpoints.scss`. Se ognuno le riderivasse, la vista doppia
  tornerebbe alla prima soglia scritta a mano;
- si muovono **entrambe le direzioni insieme** — i blocchi che accendono il
  mobile e quelli che accendono il desktop, ~14 fogli. Muoverne una sola accende
  **tutte e due le viste** nella fascia di mezzo, che è ciò che la specifica
  righe documento §4.11 vieta: «la stessa riga non esiste due volte»;
- si muove **tutta la vista documento**, non le sole righe: a `lg` commutano
  anche la testata comprimibile e gli attrezzi mobili, e spostare solo la tabella
  darebbe tabella desktop dentro una testata mobile;
- la **sidebar resta sulla larghezza**: è della shell, e un cassetto a 900px è
  giusto con qualunque puntatore.
