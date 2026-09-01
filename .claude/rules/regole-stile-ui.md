# regole-stile-ui — VestiFlow Restyle Spec

Fonte di verità visiva per l'intera app. Ogni modifica UI deve rispettare questo documento. In caso di conflitto con altri file o mockup precedenti, vince questo.

Ultima revisione: agosto 2026.

---

## 1. Principi

- **VestiFlow è un gestionale**, non un sito vetrina. Densità informativa controllata, layout compatti ma leggibili, nessuna proporzione da marketing page.
- **Tema chiaro**. Le regole di questo documento descrivono il tema chiaro.
- **Mobile è cittadino di prima classe**. Le regole mobile non sono "adattamenti"; sono parte del sistema. Su schermi stretti le tabelle diventano card, la testata diventa comprimibile, le azioni principali (Chiudi, Salva) stanno in fondo al documento — nessuna barra fissa che sottrae spazio al contenuto.
- **Un solo modo di fare le cose**. Se un pattern esiste per un caso, va riusato negli stessi casi altrove. Card, tabelle, sezioni di form, riepiloghi totali: uno standard, non varianti.
- **Bordi disegnano la forma, ombre danno profondità sottile**. Uso limitato di ombre marcate; il grosso della gerarchia visiva sta nei bordi e negli sfondi.

---

## 2. Palette

Nessun colore va scritto direttamente in un componente: sempre `var(--token)`.

### Superfici

| Uso                                    | Valore    | Token                       |
| -------------------------------------- | --------- | --------------------------- |
| Sfondo pagina                          | `#f2f4f5` | `--color-bg`                |
| Superficie card / pannelli             | `#ffffff` | `--color-surface`           |
| Superficie tenue (row alterne, sunken) | `#f6f7f8` | `--color-surface-soft`      |
| Superficie tabella hover               | `#f8faf9` | `--color-surface-hover`     |
| Header tabella                         | `#e9edee` | `--color-table-header-bg`   |
| Testo header tabella                   | `#2f3d43` | `--color-table-header-fg`   |
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
| Numero grand total                     | `--text-grand-total` 17px / weight 700          | idem                                             |
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
| Pill di stato                              | 9999px | `--radius-pill` |

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

| Uso                              | Valore                        |
| -------------------------------- | ----------------------------- |
| Margine laterale contenitore     | 8px                           |
| **Passo fra le zone del telaio** | **8px** sotto `md` (era 20px) |
| **Passo fra due card**           | **6px** (`--space-15`)        |
| **Padding card — verticale**     | **8px**                       |
| **Padding card — orizzontale**   | **12px**                      |
| **Gap verticale barra comandi**  | **4px**                       |
| Ombra card                       | rimossa (`box-shadow: none`)  |

⭐ **Il respiro della card è ASIMMETRICO** — deciso il 30/08/2026. Verticale e orizzontale
non valgono uguale: su un telefono lo schermo è alto e stretto, quindi i pixel verticali si
moltiplicano per il numero di card mentre gli orizzontali si pagano una volta sola e
avvicinano il testo al bordo, dove si legge peggio.

⛔ **Qui c'era «padding interno card 14px su tutti i lati».** Erano già 12 nel codice, e la
misura ha mostrato dove finiva davvero lo spazio: **dalla fine del riepilogo al bordo dello
schermo c'erano 92px, di cui 44 di pulsante e 48 di aria.** Non erano i controlli: erano i
vuoti intorno.

```text
altezza di una card       81 px  →  71 px
25 card                 2,03k px → 1,78k px     250 px
dal riepilogo al bordo     92 px →    64 px      28 px
```

⚠️ **Sotto gli 8px verticali non si scende**: oltre lì lo spazio va cercato nel NUMERO di
contenuti a schermo, non nel loro respiro.
| Bordo card | 1px tenue (`--color-border`): la separazione la dà il bianco su bg pagina |

**Tablet (769–1024px)**: valori intermedi (margine ~12px, gap ~10px). La compressione spinta serve solo al phone.

Le card restano contenitori (superficie bianca + radius), ma occupano quasi tutta la larghezza del viewport invece di flottare al centro.

### Touch target minimo

**44px** ovunque sia un elemento tappabile su mobile. Su desktop si può scendere a 32–34px per bottoni densi e a 29–30px per input in griglia densa.

⚠️ **L'eccezione riguarda ciò che si PREME, non ciò che si compila** — deciso dal
proprietario il 30/08/2026, a gradini nella stessa giornata: i pulsanti di barra
(`--control-h-button`) da 44 a **32px**, i controlli di testata (`--control-h-field`) a
**38px**. WCAG 2.2 chiede 24×24 CSS px al livello AA; i 44 sono la raccomandazione di Apple
e il livello AAA — quindi il bersaglio resta sopra il minimo richiesto, e sono comunque
controlli **etichettati e distanziati**, non icone nude.

⛔ **Gli INPUT restano a 44** (`--field-height`), e la distinzione è quella che conta: un
campo si sbaglia mentre si scrive, un pulsante di barra si preme una volta e ha una parola
sopra che dice cosa fa. **Sotto i 32 non si scende senza scendere anche di font**, e il
font di quei pulsanti è già a 12px.

⚠️ **I numeri veri stanno nei token, con la loro storia**: qui c'era «38px» per i pulsanti
e «sotto i 38 non si scende», deciso poche ore prima e superato lo stesso giorno da chi
l'aveva deciso. La tabella qui sotto è ora verificata da `npm run check:regole-token`.

### Altezze dei controlli — token

L'altezza di un controllo è una decisione di **sistema**, non di singola maschera:
vive nei token e non va reimpostata nel foglio di un componente.

| Uso                              | Token                | Desktop  | Mobile   |
| -------------------------------- | -------------------- | -------- | -------- |
| Bottoni e select generici        | `--btn-min-height`   | 34px     | 44px     |
| Input generici                   | `--field-height`     | 34px     | 44px     |
| Controlli di testata documento   | `--control-h-field`  | **32px** | **38px** |
| Bottoni barra strumenti / azioni | `--control-h-button` | **28px** | **32px** |
| Campi di anagrafica              | `--control-h-entry`  | **26px** | **26px** |
| Input dentro le righe            | `--control-h-cell`   | 24px     | 24px     |
| Riga tabella                     | `--table-row-h`      | **25px** | —        |
| Intestazione tabella             | `--table-head-h`     | **26px** | —        |
| Casella di selezione riga        | `--check-size`       | 14px     | 14px     |

### ⭐ La densità da scrivania è scesa di tre gradini — 30/08/2026

Deciso dal proprietario in tre passaggi successivi, guardando la stessa schermata:
_«i pulsanti li farei ancora più piccoli verticalmente, meno padding»_.

```text
bottoni di barra      34 → 31 → 28 px
intestazione tabella       32 → 28 px
margini della shell    20/24 → 6/8 px
passo fra le zone         20 → 6 px
casella di selezione       16 → 14 px
```

⭐ **Il guadagno si misura sul contenitore delle righe**, che è il punto: da
**586 a 648px** a parità di finestra, cioè due righe e mezza in più.

⛔ **Sotto i 28px non si scende senza rivedere il font.** WCAG 2.2 AA chiede
24×24 CSS px: a 28 il bersaglio resta sopra il minimo con un margine onesto e
l'etichetta a 12px ci sta senza comprimersi. Più giù si tocca la leggibilità
prima dell'ergonomia.

⚠️ **Il padding verticale di quei pulsanti è ZERO**: l'altezza la dà interamente
il token, quindi «meno padding» si traduce nel token e non in una dichiarazione
di padding che non esiste.

⚠️ **La casella di selezione è un controllo, non una spaziatura.** Era dimensionata
con `--space-4` in un posto, `--space-4` in un altro e `1rem` nudo in un terzo:
tre modi di dire 16px, uno dei quali vietato dalla regola dei valori nudi. Ora è
`--check-size`, e il suo bersaglio reale resta la cella che la contiene.

Il passaggio ai valori mobili sotto il breakpoint `md` è centralizzato in
`_design-tokens.scss`: **non** si ripete nei componenti. ⚠️ **Non tutti arrivano a 44**: i
pulsanti di barra si fermano a 32px e i controlli di testata a 38 — vedi «Touch target
minimo» qui sopra per il perché. Il minimo tappabile è il valore mobile, non quello
universale — applicarlo anche su desktop rende l'intera interfaccia più larga della
densità scelta.

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
   | `select-menu`       | `--field-*` (sotto) piu' `--select-menu-max-width`, `--select-menu-panel-inset`, `--select-menu-panel-min-width`, `--select-menu-option-align`                        |
   | campi (`--field-*`) | `--field-h`, `--field-gap`, `--field-font-size`, `--field-pad-inline`, `--field-radius`, `--field-fg`, `--field-bg`, `--field-bg-hover`, `--field-border-color`       |
   | `back-button`       | `--back-button-h`, `--back-button-gap`, `--back-button-pad-inline`, `--back-button-radius`, `--back-button-font-size`, `--back-button-font-weight`                    |
   | `action-menu`       | `--action-menu-pad-inline`, `--action-menu-inline-size` (solo sul trigger nominato); l'altezza segue `--field-height`                                                 |
   | `app-badge`         | `--badge-h`, `--badge-inline-size`, `--badge-pad-block`, `--badge-pad-inline`, `--badge-font-size`, `--badge-font-weight`                                             |
   | `attachments-panel` | `--attachments-gap`, `--attachments-title-size`, `--attachments-item-pad`                                                                                             |
   | `barcode-scanner`   | `--barcode-scanner-w`                                                                                                                                                 |
   | `hover-tooltip`     | `--hover-tooltip-inset`                                                                                                                                               |
   | `money-input`       | `--money-input-inline-size`, `--money-input-min-inline-size`, `--money-input-max-inline-size`                                                                         |
   | `segmented`         | `--segmented-color`, `--segmented-font-weight`                                                                                                                        |
   | `table-skeleton`    | `--table-skeleton-cols`                                                                                                                                               |
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

### ⭐ IL CONTROLLO DI FILTRO È UNO SOLO — deciso il 01/09/2026

> **Ogni colonna ha la stessa tendina: l'elenco dei valori con le spunte, la ricerca
> che restringe anche le righe, il verso Includi/Escludi e «Tutti».**

_Proprietario, col riferimento Danea alla mano: «alcuni funzionano in un modo ed altri
hanno un altro funzionamento e non ha senso, andrebbe creato un unico pezzo da applicare
sulle colonne. Per esempio città contiene il sistema per selezionare o filtrare, ma altri
campi no, solo filtrare scrivendo»._

⛔ **Erano QUATTRO controlli diversi, e a sceglierli era la PRESENTAZIONE**: `display:
'code'` o `'truncate'` mandavano la colonna a «si filtra scrivendo», `numeric` a «due
caselle», il resto a «elenco». Undici colonne finivano nel primo gruppo per una decisione
che col filtro non c'entra niente.

| PRIMA il `kind` decideva                             | ORA decide                                                                                                           |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **come** si restringe → quattro filtri incompatibili | **che cosa il pannello offre in più**: i due campi data su una colonna data, i due estremi su un numero |

⭐ **A restringere sono le restrizioni presenti nel valore, e convivono**: le spunte, il
testo scritto, gli estremi. Si spunta «Milano» _e_ si scrive «via» _e_ si dà un intervallo,
e valgono tutte insieme.

#### La forma, che è quella di Danea

```text
[ Includi | Escludi ]                    Tutti
[ GG/MM/AAAA ] → [ GG/MM/AAAA ]                  (data)   oppure  [da] → [a]  (numero)
Cerca o scrivi per filtrare…
☐ 02/01/2026
☐ 04/01/2026
```

⛔ **QUI C'ERA UNA RIGA DI SCORCIATOIE** — «Anno corrente · Mese corrente · Mese scorso»,
come in Danea. **Tolte il 01/09/2026 dal proprietario**, che le ha viste a schermo: _«avere
nei filtri gli stessi filtri presenti nel periodo mi sembra ripetitivo»_.

⭐ **La ragione è che qui il Periodo esiste già**, in barra e sempre visibile (§ «I filtri
di un elenco stanno nelle sue COLONNE»): in Danea quella barra non c'è, e le scorciatoie
dentro il menu ne prendevano il posto. Copiare la forma senza la premessa avrebbe messo lo
stesso comando in due punti della stessa schermata.

⭐ **«Tutti» è il `(Tutto)` di Danea e SVUOTA**: qui «nessuna restrizione» è già «tutte le
righe». Spuntarle a una a una darebbe lo stesso risultato con venti clic e un filtro che
sembra acceso.

#### ⛔ Il trigger è una FRECCIA nel titolo, non una casella sotto

_Proprietario: «con questo sistema di ricerca nei filtri, ha senso che compare un'altra
casellina sotto all'intestazione della colonna?»._

No: era una casella a tutta larghezza per ogni colonna, che apriva una tendina in cui il
nome del filtro è già scritto. Costava **una fascia di intestazione su tutta la tabella**,
cioè righe di dati in meno.

⚠️ **Tolta la casella, il filtro attivo lo dice la freccia** — tinta piena. Senza, l'unico
segnale sarebbe l'elenco più corto, cioè nessun segnale.

⛔ **La fila titolo+freccia NON si fa sul `<th>`.** Provato e visto a schermo il
01/09/2026: un `th` con `display: flex` esce dal modello tabellare, e le colonne
collassano — intestazioni sparite, frecce a gradini. La fila è uno `<span>` **dentro** la
cella. E `tsc` era pulito.

⚠️ **Il pannello ha una larghezza SUA** (`--select-menu-panel-min-width`), non quella
della colonna: dentro un'intestazione da 90px il calendario diventa una griglia di numeri
sovrapposti, e una data si legge «12/06/:».

### I filtri di un elenco stanno nelle sue COLONNE _(29/08/2026)_

⭐ **I filtri di un elenco non si disegnano: sono le sue colonne** (`14` §0.2).
Il controllo di filtro vive nell'**intestazione della colonna** su scrivania e
come **voce del pannello** sotto `lg`, dove la testata non esiste.

Restano fuori dalle colonne, e sempre visibili in barra, solo **Periodo** e
**Ricerca**.

| Il pulsante «Filtri» |                                                              |
| -------------------- | ------------------------------------------------------------ |
| **acceso**           | ogni colonna visibile mostra il proprio controllo            |
| **spento**           | i controlli spariscono **e i filtri di colonna si azzerano** |

⚠️ **Lo spegnimento È l'azzeramento**, e non è una scorciatoia: un filtro attivo
il cui controllo non si vede è il difetto che Danea deve rimediare con una
striscia d'avviso. Periodo e Ricerca non seguono il pulsante.

⛔ **Colonna spenta dal selettore Colonne, filtro spento.** Il controllo vive
nella sua intestazione: senza intestazione non c'è dove metterlo, e restringere
l'elenco per una colonna invisibile è peggio che non poterlo fare.

⭐ Ma **ogni** colonna ha il suo filtro, anche quelle spente di serie: la
filtrabilità appartiene alla colonna, non alla sua visibilità corrente.

⚠️ **La veste mobile qui sotto non cambia**: «Filtri (n)» e il suo pannello
restano quello che erano. Cambia **cosa** ci finisce dentro — le colonne
filtrabili invece di un elenco dichiarato a mano dalla pagina.

#### ⭐ Il pannello filtri è del TELAIO, e il contenitore è UNO _(29/08/2026)_

Cinque pagine avevano un `app-slide-panel` proprio che **duplicava a mano** i
controlli della barra. Ora il pannello è uno solo, di `app-list-page`, e non è
una copia: è **lo stesso** `.list-page__filters`, che sotto `lg` diventa un
foglio laterale.

```text
scrivania    riga della barra strumenti
sotto lg     foglio laterale, aperto dal pulsante «Filtri (n)»
```

⛔ **Due `<ng-content>` con lo stesso selettore non risolvono il problema: lo
creano.** Misurato il 29/08/2026 — uno in barra, uno dentro un pannello, in rami
`@if` esclusivi: il contenuto non arriva in **nessuno dei due**, senza errori
e senza test rossi. Il contenuto proiettato si rende **una volta sola**.

⭐ Ed è la stessa regola di §9: «la stessa riga non esiste due volte». Le cinque
vesti duplicate erano già una violazione.

⚠️ **Ricerca e Periodo restano in barra a ogni larghezza** — sono i due che non
entrano nelle colonne. Periodo ha per questo uno slot proprio, `[period]`.

⛔ **Chiudere il pannello non azzera.** L'azzeramento nel pannello è un pulsante
suo, esplicito: chi apre i filtri, li imposta e preme «Vedi risultati»
perderebbe altrimenti quello che ha appena scelto. Su scrivania invece spegnere
«Filtri» **azzera davvero**, perché quel pulsante ha preso il posto di «Azzera
filtri».

#### ⛔ Un telaio con sole caselle nominate SCARTA il resto _(29/08/2026)_

Angular elimina dal DOM il contenuto proiettato che non trova uno slot. Non
sbaglia posizione: **non compare**, e il componente viene perfino costruito —
nessun errore, nessun test rosso.

Persi così due pannelli, e un terzo cancellato dal file dallo script di
migrazione. Le cose `position: fixed` — dialoghi, pannelli laterali — vanno
oggi in `[overlays]`, ⏸ casella provvisoria. La guardia è
`npm run check:list-page-slots`.

### ⛔ L'incapsulamento RADDOPPIA la specificità di `A > B` _(30/08/2026)_

> **Con `ViewEncapsulation.Emulated`, Angular aggiunge l'attributo di
> incapsulamento a ENTRAMBE le parti di un selettore discendente. I conti di
> specificità si fanno sul selettore COMPILATO, non su quello scritto.**

```text
scritto                          compilato                                  peso
.band > *                        .band[_ngc] > *[_ngc]                       3
.item--negative                  .item--negative[_ngc]                       2
```

⛔ **La regola del genitore vince**, anche se quella del figlio è più specifica
"a occhio" e viene dopo. Misurato: `flex: 0 0 auto` da `.band > *` batteva
`flex: 1 0 100%` su `.item--negative`, e la voce non prendeva la riga intera.

⚠️ **Non fallisce e sembra funzionare.** Le rettifiche andavano a capo lo
stesso — ma **per caso**, perché a 430px non ci stavano — e non essendo larghe
quanto la banda, il `space-between` non aveva niente da distribuire. A schermo
si vede solo che l'importo non si stacca a destra.

⭐ **Il rimedio è nominare il genitore**: `.band > .item--negative` pesa 4 e
vince. Non è verbosità: è l'unico modo di scrivere «questo figlio, dentro questa
banda» con un peso che regga.

⚠️ **È la stessa trappola già scritta più sotto** («La specificità batte
l'ordine», §6), in una forma che quel testo non copriva: lì il caso era
`.classe` contro `.classe elemento` dentro lo stesso foglio; qui è
l'incapsulamento che aggiunge peso a un selettore che sembrava leggero.

⛔ **E vale anche al contrario**, ed è il difetto gemello trovato lo stesso
giorno: `.list-page__data > *` del telaio **non raggiungeva** il contenuto
proiettato, perché l'attributo sul `*` è quello del TELAIO e il contenuto porta
quello della PAGINA. Stessa causa, due sintomi opposti — troppa specificità di
qua, nessuna corrispondenza di là.

### ⛔ `block-size` su una riga: MINIMO in tabella, FISSO su una card _(31/08/2026)_

> **La stessa dichiarazione cambia significato quando la riga cambia `display`.**

```text
<tr> in una tabella        block-size: 30px   →  MINIMO: la riga cresce col contenuto
display: block (la card)   block-size: 30px   →  ALTEZZA FISSA: il contenuto trabocca
```

⚠️ **E sotto `lg` la riga diventa `display: block`**, perché è lì che si trasforma
in card (`data-table-mobile-cards`). Un'altezza dichiarata per la tabella arriva
alla card e la blocca: le sue tre fasce escono dal riquadro e si sovrappongono
alla card successiva.

⛔ **Misurato dal proprietario a schermo il 31/08/2026**, un giorno dopo aver
introdotto `--table-row-h` sulle righe. Build verde, lint pulito, 3.012 test
verdi: **su scrivania non si manifesta affatto**, e nessun controllo automatico
distingue i due `display`.

⭐ **L'altezza di riga si dichiara dentro `media-up('lg')`**, e basta. L'altezza
della card la fa il suo contenuto: tre fasce di testo non stanno in una misura
decisa per una riga di tabella.

### ⛔ `align-items` sopravvive al cambio d'asse, e allinea dalla parte sbagliata _(30/08/2026)_

Trovato **due volte nello stesso pomeriggio**, a due piani diversi, e la seconda solo perché
la prima aveva insegnato a cercarlo.

> **Un `align-items` scritto per una FILA continua ad agire quando il contenitore diventa
> una COLONNA — ma su un asse diverso, e quindi con un effetto diverso.**

| Valore     | in fila (`row`)                   | in colonna (`column`)                                  |
| ---------- | --------------------------------- | ------------------------------------------------------ |
| `center`   | centra in verticale               | ⛔ **centra in ORIZZONTALE**                           |
| `baseline` | appoggia sulla linea di scrittura | ⛔ **si comporta come `flex-start`: tutto a sinistra** |

**Le due volte:**

- la **cella che ospita la card** ereditava `align-items: center` dal ripiego a
  etichetta:valore — corretto per una griglia a due colonne — e in colonna centrava
  orizzontalmente le tre fasce: la card si leggeva **centrata**;
- la **fascia totali sotto `lg`** aveva `align-items: baseline` dalla forma in fila, e in
  colonna schiacciava `dt` e `dd` a sinistra, **annullando il `text-align: end`**.

⭐ **In una colonna che deve occupare la riga si dichiara `align-items: stretch`**, sempre,
anche quando sembra il default: non lo è mai, se il contenitore lo eredita da altrove.

⚠️ **E `flex: 1` su un figlio non basta a rimediare**: un figlio non stirato non riceve
larghezza da distribuire, quindi non c'è niente da spingere all'estremo opposto. È la
ragione per cui, sulla card, il numero restava incollato al tipo invece di ancorarsi a
destra.

⛔ **Nessuno dei due falliva.** Build, lint e 2.986 test verdi; li ha visti il proprietario
a schermo, uno dopo l'altro.

### ⭐ La barra strumenti sta su UNA riga anche sul telefono _(30/08/2026)_

_«Stringere la casella e far diventare unica linea con gli altri tasti.»_

⛔ Qui la barra era `flex-direction: column` sotto `md`: **ogni controllo prendeva una
fascia intera**. Su un elenco senza ricerca — il Registro — erano due fasce da 44px per
tre pulsanti che ci stavano in una.

```text
[  Cerca…                                    ]   ← se c'è, riga sua
[ Ultimi 30 giorni ] ......... [Colonne] [Filtri]
```

⚠️ **La ricerca resta a piena larghezza**, e non è un'eccezione: è un campo di testo, e
stretto a un terzo di schermo non si scrive. Prende la riga sua e manda gli altri a capo —
lo fa `flex-wrap`, non una seconda regola.

⭐ **E il prefisso del chip si spegne dal CONTENITORE**, non con un `::ng-deep`:
`--select-menu-chip-label-display: none` toglie il «Periodo:» davanti al valore, ed è
quello che fa stare la casella in riga con gli altri.

⛔ **Non si spegne globalmente sotto `lg`**: dentro il pannello filtri il prefisso è
l'unica cosa che dice **di quale filtro** si tratti — lì «Shopify online» da solo non si
capisce. Lo decide chi ospita il controllo.

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

### ⛔ NESSUN TETTO DI RIGHE — deciso il 30/08/2026

> **Un elenco mostra TUTTE le righe del filtro attivo, a qualunque larghezza.**

_Il proprietario: «Non deve esserci nessun limite di visualizzazione. Se il cliente ha il
filtro di 30 giorni, deve sapere vedere il totale di quel periodo, anche se si tratta di
vedere mille ordini. **Questo vale ovunque.**»_

⛔ **Qui c'era «Elenco troncato: si limita la VISTA, mai il dato»**: su schermo compatto si
mostravano 25 righe e un comando «Mostra le altre N righe». La regola si difendeva
sostenendo che i totali arrivano dall'API e non si ricalcolano da ciò che è a schermo —
**e quello resta vero**: troncare non spostava un centesimo.

⭐ **Il difetto era un altro: chi guarda non può saperlo.** Un registro che mostra una
parte delle righe non è verificabile, e in un registro fiscale la verificabilità **è** la
funzione. La difesa era corretta e rispondeva alla domanda sbagliata.

#### Il problema che il tetto risolveva resta, e si risolve meglio

Il tetto esisteva perché il riepilogo sta in fondo: con un mese di vendite, arrivarci
significava scorrere centinaia di card.

⭐ **Sotto `lg` il PIEDE si ancora in fondo allo schermo** — totali e comandi insieme.
Non si scorre per vederli: sono sempre lì, e l'elenco può essere lungo quanto il periodo
richiede.

⭐ **E vale per OGNI elenco, non solo per il Registro** — indicato dal proprietario il
31/08/2026 guardando le Giacenze: _«dovrebbe essere fissa a tutti per avere sempre totali
e funzioni a portata di mano»_.

⛔ **Nasceva acceso solo dove lo si chiedeva**, e la ragione era che «dodici pagine su
tredici mettono nel piede solo il paginatore, e un paginatore ancorato non è qualcosa che
qualcuno abbia chiesto». **Quella premessa non vale più**: il paginatore non esiste più su
nessun elenco, e al suo posto il piede porta la riga totali e la barra comandi — cioè
esattamente le due cose che devono restare a portata di mano.

⚠️ **Il piede è STRUTTURALE, non appiccicato**: la zona dati cede, il piede occupa spazio
davvero. Uno `sticky` non riserva spazio a sé, e coprirebbe l'ultima card a meno di
compensarlo con un `padding` pari alla sua altezza — una misura da tenere allineata a mano.

#### ⛔ E la riga totali perde l'ancoraggio quando la tabella diventa a blocchi

Sotto `lg` la tabella è `display: block` (`data-table-mobile-cards`) e con lei il
`<tfoot>`: un `table-footer-group` che non è più tale **perde lo `sticky`, senza
fallire**. Va ridichiarato come blocco.

⚠️ **E il fondo passa dalla cella alla RIGA.** In tabella ogni `td` porta fondo e filo, e
insieme formano una banda continua; in flex fra una cella e l'altra c'è il `gap`, che
resterebbe **trasparente** — la banda si vedrebbe a strisce, con le card che scorrono sotto.

#### ⭐ Su una card i numeri portano il proprio NOME

In tabella il nome è l'intestazione di colonna. Sotto `lg` l'intestazione non c'è, e la riga
totali diventa una fila di numeri nudi — «59 voci 607 741 134», che non dice quale sia la
giacenza e quale il disponibile. L'etichetta la porta già `data-label` su ogni cella.

⚠️ Vale anche per il **totale della card**, dove il numero è ambiguo: su un importo no
(«25,00 €» si legge da sé), su una quantità sì — «Disp. −1», non «−1».

⚠️ **`sticky`, non `fixed`**: fisso coprirebbe l'ultima card e resterebbe attaccato anche
dove non serve. E il fondo è **opaco**, non velato — sotto scorrono card con numeri, e a
tinta velata i due testi si leggerebbero sovrapposti.

⚠️ **Il piede è UN contenitore, non due zone ancorate a parte**: ancorate una per una
servirebbe dare alla seconda uno scostamento pari all'altezza della prima, un numero da
tenere allineato a mano che si sfalsa appena il riepilogo va a capo. Su scrivania il
contenitore si dissolve con `display: contents`, e nulla cambia.

⛔ **Con mille righe questo diventa mille card nel DOM.** La virtualizzazione del motore
tabella smette di essere un'ottimizzazione e diventa un **prerequisito**
(`docs/DA-FARE.md`).

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

### I controlli automatici sui token

`npm run check:tokens` (dentro `npm run lint`) fa fallire la build su difetti che
non si vedono, non rompono nulla in compilazione e non fanno arrossare un test:

1. **Parità fra i temi.** Un token dichiarato in `theme-light` e non in
   `theme-dark` non ha valore quando il tema è scuro: la dichiarazione che lo usa
   diventa invalida e il browser la scarta. Il colore sparisce per metà degli
   utenti, in silenzio. È già successo — tredici token aggiunti al solo tema
   chiaro.
2. **Token fantasma.** Un `var(--x)` senza fallback su un nome che nessuno
   dichiara fa la stessa fine, e capita a ogni rinomina. Ne sono stati trovati
   undici, tutti preesistenti: `--color-text-primary`, `--space-sm`,
   `--focus-ring-color`, `--opacity-muted`…
3. ⭐ **Fantasma CON fallback** _(01/09/2026)_ — il buco da cui i primi due si
   facevano aggirare.

⛔ **Qui c'era scritto che il controllo «copre solo i `var()` nudi, quindi un
fantasma con fallback resta invisibile per costruzione».** Era vero, ed era la
descrizione di un buco, non di un limite accettabile: sotto ci sono passati
**sette** nomi inesistenti, in dodici punti, tutti muti.

```text
--color-warning-text    → var(--color-text)        l'avviso di stampa color testo normale
--color-error-text      → var(--color-text)        l'errore degli allegati, idem
--color-surface-subtle  → var(--color-surface)     cinque pannelli «tenui» resi bianchi
--motion-fast           → 120ms                    due durate fuori dal design system
--motion-duration-fast  → 180ms                    l'entrata del pannello laterale
--space-7               → 1.75rem                  un'altezza minima
--co-brand-soft         → var(--color-surface-soft) un fondo di marca che non esiste
```

⚠️ **L'elenco è completo, e conta i NOMI.** I punti di codice toccati sono dodici:
`--color-surface-subtle` da solo ne occupa cinque. Un elenco che si fermi ai primi
quattro senza dirlo si legge come esaustivo, ed è il modo in cui una misura giusta
diventa una misura sbagliata — bastano tre righe non scritte.

⭐ **Il fallback non degrada: ANNULLA il segnale.** Un errore reso color testo
normale è indistinguibile dal testo intorno, e il colore era l'unica cosa che lo
distingueva. È il difetto peggiore della famiglia proprio perché il fallback
regge e a schermo sembra una scelta.

⚠️ **Come si distingue un knob da un refuso**: un punto di regolazione è tale se
**qualcuno lo imposta** (un contenitore, uno `style` inline) **o se la tabella
qui sopra lo elenca**. Un nome che nessuno imposta e che nessuna regola nomina
non è un canale di configurazione: è un nome che chi l'ha scritto credeva
esistesse.

⭐ **Documentarlo è la via d'uscita voluta**: un knob nuovo si dichiara nella
tabella dei punti di regolazione, che è dove chi configura va a cercarlo. La
guardia costringe quindi a tenerla aggiornata, invece di limitarsi a vietare.

Non controlla i valori: quelli sono una scelta di design, e la fonte di verità è
questo documento — con una sola eccezione, `npm run check:regole-token`, che
verifica che le **misure citate qui** siano quelle vere dei token (vedi «Altezze
dei controlli»).

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

### La riga TOTALI di un elenco — _deciso 30/08/2026_

⚠️ **Non è il «Riepilogo di fondo pagina» qui sotto**, e confonderli porta a due cose
diverse nello stesso posto:

|                 | **Riga totali** (ogni elenco)                   | **Riepilogo** (report)                        |
| --------------- | ----------------------------------------------- | --------------------------------------------- |
| che cosa mostra | la **somma delle colonne visibili**             | metriche nominate, anche non di colonna       |
| esempio         | `17 voci · 1.157,26 € · 1.052,04 €`             | `RETTIFICHE (4) · ANNULLAMENTI 2 · VENDITE 8` |
| etichette       | nessuna: il nome è l'intestazione della colonna | ognuna ha la sua                              |
| allineamento    | **sotto la propria colonna**                    | a fascia, non incolonnato                     |

⭐ **La riga totali sta SOPRA la riga comandi**, e la rende il MOTORE TABELLA: è un
`<tfoot>` appiccicato in fondo alla vista, dentro lo stesso contenitore che scorre.

⛔ **Qui c'era «è l'ordine che il telaio già dà: zona dati → `[summary]` →
`[listActions]`»**, cioè una fascia fuori dalla tabella. Corretto il 30/08/2026
scrivendola: **una fascia fuori dalla tabella non si può incolonnare.** Dovrebbe rifarsi
le larghezze da sola, e sarebbero due misure per la stessa cosa — la seconda si
disallineerebbe al primo trascinamento di una maniglia, che il motore tiene **in memoria**
e nessun altro conosce.

⭐ Dentro la tabella l'incolonnamento è **gratuito e non si può sbagliare**: è la stessa
`<table>`, con le stesse colonne. E riusa la meccanica del **piede di sezione**, che
incolonna già allo stesso modo, invece di inventarne una seconda.

⚠️ **Appiccicata, non in coda alle righe**: in coda si raggiungerebbe solo scorrendo fino
in fondo — che è il difetto che questa stessa sezione vieta per il riepilogo, «lo
renderebbe irraggiungibile su una finestra bassa».

#### ⛔ E con POCHE righe `sticky` non basta: serve una riga di RIEMPIMENTO _(01/09/2026)_

_Il proprietario, su Fornitori: «vedo che la barra non resta fissa sotto a piè di
contenitore righe», poi «anche fornitori va sistemata la barra sotto come per gli altri»._

⛔ **`position: sticky` appiccica quando il contenuto ECCEDE il contenitore.** Con quattro
righe non c'è niente da cui staccarsi: il piede si posa sotto l'ultima riga e sotto di lui
resta il vuoto. Misurato in un browser vero: **288px di bianco** fra la riga totali e il
fondo.

⛔ **E non si corregge stirando la tabella.** Su un `display: table` l'altezza in eccesso si
distribuisce alle **righe**: misurato, quattro righe da **94,25px** — lo stesso difetto già
visto il 30/08 sulle Vendite online, dove `min-block-size: 100%` fu tolto per questo.

⭐ **L'avanzo deve avere DOVE andare**: una riga di riempimento in coda al corpo, che chiede
il 100% e se lo prende tutto. Le righe di dati restano alla loro altezza, il `tfoot` si
trova davvero in fondo, e quando invece le righe abbondano lo `sticky` continua a fare il
proprio mestiere.

⚠️ **Niente righe vuote a riempire lo schermo**, e non è una scorciatoia scartata: è una
riga **sola**, invisibile e senza bordi. Il riferimento Danea lascia lo spazio vuoto, non
finte righe.

⚠️ **È una riga vera nel DOM**, quindi finisce in ogni query che chiede `tbody tr`: porta
`aria-hidden` e chi conta le righe deve contare `tr.data-table__row`. Tre prove del tono di
riga sono diventate rosse il giorno stesso, con un `'nessuno'` di troppo in coda.

⛔ **Solo da `lg` in su**: sotto, la tabella è fatta di card e sarebbe una card vuota.

⚠️ **Il fondo è OPACO** e prende la tinta dell'**intestazione**: sotto scorrono righe di
numeri, e velato i due testi si leggerebbero sovrapposti. Un totale è **struttura**, non
una riga di dati — la stessa ragione per cui la riga di subtotale di gruppo non condivide
la tinta con una transazione.

⛔ **I valori arrivano GIÀ FORMATTATI e già determinati: il motore non somma.**
`regole-gestionale` è esplicita — «il riepilogo SOMMA, non ricalcola» — e un motore di
tabella che rifacesse l'IVA sarebbe un secondo motore economico. Chi somma le righe che ha
in mano usa `totaliDiElenco`, una funzione sola; chi riceve i totali dall'API (Corrispettivi)
non passa di lì, perché il suo risultato è più grande di quello che ha a schermo e sommare
le righe rese darebbe il totale della **vista**, non del periodo.

**Le due regole che la governano**

1. ⛔ **Non sparisce mai.** Senza selezione mostra i totali del risultato **filtrato**; con
   una selezione, quelli della **selezione**. Una fascia che compare e scompare sposta i
   comandi in verticale — lo stesso difetto della riga comandi che slitta, girato di
   novanta gradi.

2. ⭐ **Si somma ciò che è VISIBILE.** Colonna spenta dal selettore Colonne, totale assente.
   È anche il modo in cui un titolare che non vuole mostrare gli importi li toglie: una
   decisione sola invece di due che possono contraddirsi.

**Il conteggio è «N voci»**, a sinistra, e cambia da sé con la selezione. ⛔ Non serve un
secondo indicatore «3 selezionati» accanto ai comandi: direbbe la stessa cosa due volte, e
per dirla spostava i comandi.

⭐ **Su Corrispettivi vince il RIEPILOGO** — deciso dal proprietario il 30/08/2026: «in
corrispettivi ha senso, non complichiamoci la vita sui totali, servono».

È l'unico elenco dove le due famiglie si incontrano, e la ragione per cui vince la seconda
sta nel contenuto: **metà di quelle voci non sono colonne.** «Annullamenti 2» e «Rettifiche
(4) − 205,01 €» non stanno in nessuna intestazione della tabella — sono la riconciliazione
del registro, cioè il motivo per cui lo si guarda. Una riga di somme di colonne le
perderebbe.

⛔ Quindi Corrispettivi **non ha** la riga totali: ha il suo riepilogo, e basta.

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
- ⭐ **UNA sola fascia sul desktop** — deciso dal proprietario il 29/08/2026
  (`14` §27.0, §63). Conteggi a sinistra, importi a destra, sulla stessa riga:
  `N voci · metriche libere · NETTO · IVA · TOTALE`.

  ⛔ **Qui c’erano DUE fasce** — sopra i conteggi, sotto gli importi — con la
  motivazione che _«un conteggio e un importo rispondono a domande diverse:
  nella stessa fila si leggono come se fossero la stessa grandezza»_.
  L’argomento non era sbagliato, ma è stato pesato contro un altro e ha perso:
  **la seconda fascia costa una fascia di altezza a ogni schermata**, e in fondo
  a un elenco lungo lo spazio verticale vale più della separazione semantica.
  La distinzione resta leggibile dalla posizione e dalla taglia, non dalla riga.

  ⚠️ La fascia sta **fuori** dalla regione di scroll e **non si allinea alle
  colonne** (`14` §22.4): il subtotale di raggruppamento invece sì, perché è una
  riga dentro la tabella. Sono due cose diverse e non vanno uniformate.

- ⭐ **Etichetta SOPRA, valore SOTTO — a ogni larghezza** _(deciso il 30/08/2026, dopo
  averli provati affiancati)_: _«forse dobbiamo tornare ad occupare due righe per i
  totali, scritte sopra e valori sotto, altrimenti va sempre a capo»_.

  ⛔ **Qui c'era la forma AFFIANCATA**, decisa lo stesso giorno per portare la fascia da
  39px a 25px. La misura era giusta e incompleta: una voce in fila è larga
  `etichetta + gap + valore`, quasi il doppio di una impilata, e otto voci così
  chiedevano **918px** — che una finestra sotto i 1180 non ha.

  ```text
  in fila     25px di altezza · 918px di larghezza  →  va a capo, due righe ≈ 50px
  impilati    39px di altezza · 615px               →  UNA riga, sempre
  ```

  ⭐ **Una riga da 39px batte due righe da 25**, e non è solo aritmetica: la fascia a
  capo spezzava il gruppo degli importi a metà, lasciando «CORRISPETTIVO 614,01 €» da
  solo sotto — cioè staccava proprio la voce che chiude il registro da quelle che la
  compongono.

  ⭐ **E toglie la soglia dal problema**: la forma impilata sta in una riga a qualunque
  larghezza da `lg` in su, quindi non c'è più una soglia da indovinare né una larghezza
  a cui degrada. La «DECISIONE APERTA» sulla soglia, aperta la mattina, è chiusa così.

  ⚠️ **Vale anche sul telefono**, ed è arrivata dopo: lì i conteggi restavano affiancati
  mentre gli importi erano già impilati, e la stessa fascia mostrava due grammatiche una
  sopra l'altra. La forma è ora una sola alle due larghezze.

  ⭐ **Il numero di colonne lo decide lo spazio**: `auto-fit` con minimo
  `--summary-item-min-w` (94px, la larghezza in cui «CORRISPETTIVO» a 10px maiuscolo ci
  sta intero). Due colonne a 320px, tre a 390, quattro da 430.

  ⛔ **Il minimo non si stima a occhio**: tarato a 88px l'etichetta si spezzava a metà —
  «CORRISPETTIV / O» — e a 132 la fascia scendeva a due colonne su un telefono da 390,
  con metà larghezza sprecata. Va misurato sull'etichetta più lunga, nel suo contesto
  reale: una misura fatta su un clone fuori dal DOM dava 80px e sbagliava di cinque.

  ⛔ **Provate e scartate nella stessa giornata, e non vanno rifatte:**

  | Tentativo                                         | Perché è caduto                                                                                        |
  | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
  | voci **affiancate** (etichetta accanto al valore) | chiedono 918px: sotto i 1180 la fascia va a capo e stacca «CORRISPETTIVO» dalle voci che lo compongono |
  | `flex-wrap: nowrap` per impedire il capo a capo   | le `dt` sono `nowrap` per contratto: le voci si stringono sotto il contenuto e **traboccano**          |
  | spostare la soglia a mano (`@media min-width`)    | tarata su QUELLE voci con QUEGLI importi, si rompe al primo totale a cinque cifre                      |

  ⭐ Il `nowrap` è l'errore che sembra la soluzione ovvia, ed è stato fatto **due volte
  nello stesso giorno** — sulla fascia da scrivania e sulla banda dei conteggi del
  telefono. In entrambi i casi produce testo sovrapposto, non testo compresso:

  ```text
  ANNULLAMENTI 2IMPONIBILE 517,99 €IVA 96,02 €…
  ```

  ⭐ **Una riga illeggibile è peggio di due righe leggibili**: il difetto costava
  un'altezza di fascia, il rimedio costava la lettura dei totali.

  ⚠️ **Le voci si allineano sulla LINEA DI BASE**, non al centro: etichetta e valore di
  taglia diversa centrati «ballano» di un pixel lungo la fila.

  ⛔ **E sotto `lg` il `wrap` è obbligatorio per una seconda ragione**: lì le bande
  esistono e chiedono `flex: 1 1 100%` ciascuna. Con `nowrap` non possono impilarsi, si
  spartiscono la riga e collassano — misurato: sotto i 480px ogni etichetta e ogni importo
  finivano in una colonna larga **zero pixel**, tutto tagliato, e il piede passava da 103
  a 379px.

- ⚠️ **Il conteggio righe occupa la fascia intera**, in cima e a sinistra: in griglia
  finirebbe in una colonna a caso, e «12 righe» si leggerebbe incolonnato sotto Vendite
  come se fosse un'altra metrica.

  ⛔ **E l'attacco al riquadro vale solo da `lg` in su**: sotto, il telaio non mette
  spazio fra le zone, quindi il margine negativo che lo chiude farebbe **salire la fascia
  sopra l'ultima card**.

- **L'etichetta non va a capo** (`white-space: nowrap` sulle `dt`): spezzata, la voce
  diventerebbe alta due righe e alzerebbe l'intera fascia. Se un'etichetta più lunga non
  ci sta, è **la colonna** a doversi allargare — cioè `--summary-item-min-w` a essere
  tarato male.

  ⭐ `--summary-item-min-w` **governa la fascia a ogni larghezza**: era rimasto
  inutilizzato quando la banda usava colonne uguali, ed è tornato a fare il proprio
  mestiere con `auto-fit`.

**La tipografia** (invariata, e verificata)

- **La label (`dt`) riusa la ricetta dell'intestazione tabella**, un gradino sotto:
  `--text-3xs` (10px, l'estremo basso della fascia «label uppercase 9,5–10px» di §3),
  weight `--font-weight-bold`, `--color-table-header-fg`, uppercase,
  `letter-spacing: .045em`. Un'etichetta che riassume una tabella e un'etichetta
  di colonna della stessa tabella sono lo stesso ruolo — pesano uguale.
- **Il valore (`dd`) pesa un gradino SOTTO il corpo tabella**: `--text-xs`,
  weight `--font-weight-regular`. Riassume un dato già leggibile riga per riga
  sopra, non è un dato nuovo.
- **Un solo valore evidenziato**: `--text-md`, `--font-weight-bold`,
  `--color-primary`, e **nessuna tinta di fondo** — una cella colorata dentro
  il riquadro sarebbe il riquadro nel riquadro. A distinguerlo bastano taglia
  e peso, che restano unici in tutta la banda.

  ⚠️ **Era `--text-lg` (16px), sceso a `--text-md` (14px) il 30/08/2026**: è
  l'elemento più alto della riga, quindi ogni punto che perde lo perde tutta la
  fascia. **Sotto i 14 non si scende** — a 13px pareggia il corpo della tabella
  e smette di leggersi come «la risposta».

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

### La barra comandi di un elenco — _deciso 30/08/2026_

**Tutti i comandi in UNA riga in basso**, testata ridotta a Indietro + titolo + conteggio.
Non due posti — creare sopra, agire sotto — che era una divisione storica e non un criterio.

```text
Nuovo · Modifica · Duplica · Elimina · Stampa · Etichette · Excel · Esporta ▾
```

⛔ **La posizione dei comandi è FISSA**: niente entra o esce dalla riga a seconda della
selezione. Quello che cambia è se un comando è **acceso o spento**, e il perché si legge
sull'azione spenta (`14` §5.1).

⭐ **La forma di un comando comune sta nel catalogo**, non nella pagina: etichetta, icona,
variante e requisito una volta sola. La pagina passa il gestore. La guardia è
`npm run check:list-actions`.

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

#### ⭐ La variante PIATTA non è una pill senza fondo — 01/09/2026

> **Tolta la pastiglia, la taglia si EREDITA dal contesto e il peso resta a 500.**

_Proprietario, guardando la colonna «Stato» delle Giacenze: «risulta 1px più piccolo e un
peso di 600, diverso dal resto che è 400», poi «non solo quella, in tutti i riepiloghi va
sistemato», infine «cambiamo il peso a 500 — solo dei colorati»._

⛔ **Era una causa sola in dodici riepiloghi.** `app-badge` nasce pill, e su una pastiglia
colorata 11px e semibold sono giusti: quel testo è un'etichetta dentro una forma. Con
`[flat]` la forma sparisce e resta **testo in una cella** — dove una taglia e un peso propri
si leggono come un errore di composizione, perché la riga finisce per avere due grammature.

```text
prima   11px / 600     in una riga di corpo 12px / 400
dopo    12px / 500     misurato su Ordini fornitore
```

⭐ **500 e non 400**, ed è la parte deliberata: questi non sono dati qualunque, sono **gli
stati** — la colonna che si scorre per trovare le righe che chiedono attenzione. Il colore
fa il grosso; il mezzo gradino di peso lo accompagna per chi i colori non li distingue.

⚠️ **La pill vera non cambia**: `--flat` è l'unica variante toccata.

### Azioni documento (per device)

Il pattern di "salvataggio e uscita da un documento in edit" cambia con la larghezza schermo per ergonomia diversa (mouse su desktop, pollice su mobile).

**Desktop** — Footer sticky in basso alla pagina:

- Altezza **derivata, non fissa**: `--doc-actions-height` = altezza del bottone + due passi + i fili (oggi 52px). ⛔ Qui c'era «60–62px», un numero scritto a mano: fissarlo scollega il piede dai bottoni che contiene e **sfalsa lo scostamento della banda totali**, che si appoggia sopra leggendo la stessa variabile
- Background `rgba(255,255,255,.94)` + `backdrop-filter: blur(12px)`
- La banda note/totali che le sta sopra è invece **opaca**: è appiccicata in basso e su un documento corto passa sopra il piede della tabella. A tinta velata il testo sotto traspariva e si leggeva sovrapposto — coperto è coperto, e torna visibile scorrendo
- Bordo superiore `--color-border`, ombra `--shadow-footer`
- Contenuto: a sinistra info sintetica di stato (es. "Modifiche non salvate", "Documento salvato"); a destra i pulsanti azione (primary a destra estrema)
- Sequenza pulsanti, **da sinistra a destra**: **Chiudi** (ghost) · eventuali azioni specifiche del documento (secondary) · **Salva** (primary, all'estrema destra)

⛔ **Qui c'era «(destra a sinistra)»**, e letta cosi' metteva Chiudi all'estrema destra —
il contrario della riga sopra, che dice «primary a destra estrema». Due frasi della stessa
sezione che si smentivano.

⭐ Corretta il 25/08/2026 misurando il codice: **tutte e sette le maschere documentali**
mettono Chiudi a sinistra e Salva primary a destra. La regola si allinea a una convenzione
gia' unanime, non ne impone una nuova.

**Le etichette sono le stesse in ogni documento** _(08/2026)_. Il salvataggio dice **«Salva documento»** ovunque — non «Salva ordine», non «Salva registrazione», non «Salva»: chi passa da una maschera all'altra cerca lo stesso pulsante, e il tipo di documento è già scritto nel titolo della pagina. L'uscita dice **«Chiudi»**, su scrivania e nella coppia mobile.

⛔ **Qui c'era «Annulla» nella coppia mobile** — due nomi per lo stesso comando, a seconda della larghezza dello schermo. Superata dal proprietario il **24/08/2026**: _«se abbiamo deciso chiudi, allora utilizzeremo chiudi dappertutto e leveremo annulla. Ovunque deve essere così e non voglio tornare sull'argomento»_.

⚠️ **A trovare i disallineati è stata una macchina, non l'occhio.** Due maschere dicevano «Annulla» sulla barra e le si vedevano; altre tre — due coppie mobili e il Movimento di magazzino — no. Per questo la regola ha una guardia: `scripts/check-exit-label.mjs`, dentro `npm run lint`, che riconosce il comando dal **gestore** (`cancel()`) e non dalla posizione.

⚠️ Le «Annulla» dentro i **dialoghi** non c'entrano e restano: lì significano «torno indietro», non «esci dal documento». Il dialogo «modifiche non salvate» ha per contratto **Annulla · Esci senza salvare**, e il salvataggio resta il pulsante Salva — «Salva e chiudi» dentro quel dialogo non deve comparire.

⚠️ **L'unica eccezione, e la regola che la governa** _(17/08/2026)_. La frase dice «in ogni **documento**»: vale per ciò che un documento è. Il **Corrispettivo manuale** non lo è — non ha una riga in `documents`, non si stampa come documento, non entra nella matrice dei permessi documentali, e la specifica `10` §12 lo dichiara «registrazione economica autonoma». Lì il pulsante dice **«Salva corrispettivo»**.

> **Il criterio non è il gusto: è se l'entità sta in `documents`.** Chiamare «documento» una cosa che il modello non tratta come tale insegna all'operatore una parola che poi non ritrova da nessun'altra parte — né nel Registro, né nei permessi, né in guida. Una maschera che non è documentale nomina la propria entità; tutte le altre dicono «Salva documento», e questa eccezione non le riapre.

⭐ **Secondo caso, e affina la regola** _(25/08/2026)_. Il **Movimento di magazzino** registra
uno `StockMovement`, non un `Document`. Ma la sua entità non è «il movimento»: è il **carico**,
lo scarico, la rettifica, il trasferimento — il tipo è scelto a monte e il titolo lo dice già
(«Registra carico»). Il pulsante dice quindi **«Salva carico»**, **«Salva scarico»**, **«Salva
rettifica»**, **«Salva trasferimento»**.

> **Chi non è documentale nomina l'OPERAZIONE, non la tabella.** «Salva movimento» era
> corretto rispetto al modello e sbagliato rispetto a chi legge: nessuno pensa di «registrare
> un movimento», si carica o si scarica.

⚠️ Ha avuto due nomi sbagliati prima di questo, e vale la pena saperlo perché sono due errori
diversi: «Salva» sulla scrivania e «Salva movimento» sul telefono — **due parole per lo stesso
comando a seconda dello schermo** — poi «Salva movimento» ovunque, che nominava l'entità
giusta per il database e sbagliata per l'operatore.

⭐ **Terzo caso, e NON segue il criterio** _(dichiarato il 26/08/2026)_. **Vendita e Reso
al banco stanno in `documents`**, quindi il criterio qui sopra li manderebbe a «Salva
documento». Dicono invece **«Concludi vendita»** e **«Concludi reso»**.

⚠️ **Non è un’applicazione di questa regola: è una decisione di prodotto presa a parte**,
e va scritto perché senza questa riga chi legge §5, guarda quella maschera e conclude che
il pulsante è sbagliato. Cambiarla richiede una decisione nuova ed esplicita.

⛔ Il commento nel codice la chiamava «l’eccezione prevista da §5», e non lo era —
corretto lo stesso giorno. Una falsa citazione di regola è peggio di nessuna citazione:
chiude la domanda invece di lasciarla aperta.

**Mobile e tablet (≤ 1024px)** — Azioni in fondo al documento:

- I pulsanti **Chiudi** (secondary) e **Salva documento** (primary) vanno posizionati in fondo al documento, dopo il riepilogo totali, come coppia allineata a destra: Chiudi a sinistra di Salva documento
- Nessuna barra sticky in basso, nessun pulsante azione in topbar
- La topbar mobile mantiene la sua configurazione standard (hamburger, ricerca globale, chip sync, avatar)
- Il totale documento va in coda al documento come sezione finale (vedi §7)

### Barra azioni sticky mobile

Distinta dalle azioni documento: quella barra riguarda **salvare e uscire**, questa riguarda **inserire prodotti** mentre si compila. Convivono senza contraddirsi — Chiudi/Salva restano in fondo al documento e scorrono col contenuto.

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
- **Header**: h26 (`--table-head-h`), padding `0 --table-list-pad-inline` (8px), font
  **`--text-2xs` (11px)**
  uppercase weight bold, tracking `--tracking-caps`, testo **`--color-table-header-fg`**, bg
  `--color-table-header-bg`, filo inferiore **`--color-table-header-rule`**

⭐ **Undici pixel, confermati a schermo il 01/09/2026** — proprietario: «proviamo a mettere
le intestazioni delle colonne a 11px, attualmente è 10», poi «confermato 11px, metti
ovunque e registra il dato».

⚠️ **Erano già 11 nel mixin condiviso**: a scendere a 10 il 30/08 era stato il solo motore
tabella, insieme al resto della densità. Reggeva finché sotto ogni titolo c'era una riga di
filtri; da quando il filtro è **una freccia accanto al titolo**, l'intestazione è tornata a
essere una riga sola e i 10px si leggevano più piccoli di quanto quella riga meriti.

> ⛔ **Qui c'era «muted» per il testo e `--color-border-strong` per il filo, e §2 diceva
> un'altra cosa** — i due token dedicati. Erano due frasi dello stesso documento che non
> concordavano, e il codice si era diviso: il Registro seguiva §2, il motore §6. Il
> proprietario ha deciso il 20/08/2026 guardandole a confronto: **valgono i token dedicati di
> §2**, e questa riga è stata corretta.
>
> ⭐ E il testo dell'intestazione è stato **scurito** nello stesso passaggio — 7,5:1 → 9,5:1 sul
> fondo dell'intestazione — restando comunque un gradino sopra il testo del corpo, che altrimenti
> smetterebbe di distinguersi.

- **Righe**: h25 (`--table-row-h`), padding
  `calc(--space-05 + --border-width) --table-list-pad-inline --border-width` (3 × 8 × 1),
  font `--text-xs` (12px), bordo 1px `--color-border-cell`, **con divisore verticale** fra le
  colonne

### ⭐ La riga scende a 25px, e il padding è ASIMMETRICO — 01/09/2026

_Il proprietario: «riduci il padding interno delle righe, devono essere piu piccole in
altezza», «a tutti e tutti uguali», poi «proviamo 25 px»._

```text
altezza di riga    30 → 25 px      token `--table-row-h`
padding verticale   4 → 3 sopra, 1 sotto
```

⛔ **Il token da solo non toglie un pixel.** L'altezza utile è il **maggiore** fra il token
e il contenuto: con 4px sopra e sotto il contenuto ne chiedeva già 25. Token e padding si
muovono insieme, o non si muove niente.

⭐ **Sopra c'è un pixel in più che sotto, e non è una svista.** La cella è `border-box` e
porta il filo **solo in basso**: il riquadro in cui il testo si centra finisce un pixel
prima del fondo. Segnalato a schermo — «il testo è leggermente non centrato verticalmente,
forse a causa di quel margine 1 presente» — e misurato in un browser vero, sopra/sotto:

```text
2 e 2      4 / 6       ⛔ 2px di scarto, quello visto a schermo
3 e 2      4,5 / 5,5   ⛔ dimezzato, non chiuso
4 e 2      5,5 / 5,5   ⛔ centrato, ma la riga sale a 26px
3 e 1      5 / 5       ✅ centrato E la riga resta 25
```

⚠️ **Il pixel si SPOSTA, non si aggiunge**: uno in più sopra e uno in meno sotto lasciano
l'ingombro invariato. Aggiungerlo soltanto sopra ricomprava l'altezza appena guadagnata.

⛔ **E la casella di selezione NON prende quel pixel.** Il compenso serve a due cose
insieme — il filo, e il fatto che il riquadro dei glifi non è centrato nella propria riga di
testo. Una casella è **geometricamente simmetrica**: la seconda compensazione la spinge in
basso di un pixel, nella direzione opposta al difetto del testo. Segnalato subito dopo —
«tranne per la casellina di selezione» — e corretto col solo compenso del filo.

⚠️ **Si compensa col token del bordo, mai con un numero nudo**: se il filo diventasse più
spesso, il centramento seguirebbe da sé.

⛔ **Vale per gli ELENCHI, non per le righe dei documenti.** La dichiarazione sta in
`summary-grammar`, che le maschere di inserimento non includono: quelle hanno celle
editabili e un'altezza propria (`--control-h-cell`).

### ⭐ IL TAGLIO A COLONNA — deciso il 30/08/2026

> **Il testo di ogni cella sta su UNA riga e viene tagliato dalla colonna
> successiva.** Non va a capo, non si stringe: si taglia.

_Il proprietario, col riferimento Danea alla mano: «il nome va su una riga e viene
tagliato dalla colonna successiva. Non solo il nome ma tutti i dati»._

⛔ **Qui c'era «nessun divisore verticale» fra le colonne**, con la motivazione che «il
bianco separa da sé». Era vero **finché il testo non veniva tagliato**: da quando lo è, il
bianco non basta più a dire dove la colonna finisce e il testo continua. Il proprietario
li ha infatti chiesti **insieme** — «forse mettere anche la riga che separa le colonne» —
e sono una cosa sola.

Tre dichiarazioni che stanno insieme, e nessuna funziona senza le altre:

|                                            |                                                                                                                                               |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `table-layout: fixed`                      | ⛔ **il presupposto**: con `auto` una cella `nowrap` **allarga la propria colonna** invece di tagliare, e la tabella cresce finché non scorre |
| `white-space: nowrap` + `overflow: hidden` | il taglio vero                                                                                                                                |
| divisore verticale di colonna              | la linea su cui il taglio avviene                                                                                                             |

⚠️ **`text-overflow: clip`, non `ellipsis`**: in una colonna stretta tre puntini mangiano
tre caratteri utili, e il riferimento taglia netto. Il testo intero resta nel `title` della
cella.

⭐ **E rende costante l'ALTEZZA di riga**, che è il vero guadagno: prima un nome lungo
mandava la riga a due righe di testo, e bastava un articolo su dieci per far ballare
l'altezza di tutto l'elenco. È anche la precondizione della virtualizzazione, che senza
un'altezza nota non si può scrivere (`docs/DA-FARE.md`).

#### ⛔ Le larghezze NON si scrivono a mano in undici file

Con `fixed`, una colonna senza larghezza dichiarata **si prende una parte uguale alle
altre**: «Stagione» larga quanto «Nome». E undici modelli colonne non ne dichiarano una.

⭐ **La larghezza si DEDUCE dal tipo della colonna**, che il modello già dichiara —
numerica stretta, codice media, testo libero nessuna (respira e prende lo spazio che
avanza). Sta in `widthOf` del motore, in un posto solo. Chi ha una `defaultWidthPx` usa
quella, e l'operatore la cambia trascinando.

#### ⭐ La maniglia di larghezza SI VEDE

_«Bisognerebbe rendere visibile la linea di regolazione della larghezza colonna.»_

⛔ Era un bersaglio **trasparente** da 4px: lo si trovava solo passandoci sopra per caso.
Una funzione che non si annuncia non esiste per chi non sa già che c'è.

⚠️ **Bersaglio largo, filo sottile**: 8px per essere colpibile col mouse, 1px disegnato.
La linea indica dove si trascina — se fosse più grossa dei divisori veri, diventerebbe lei
il divisore. In hover e durante il trascinamento passa a 2px e prende `--color-focus`.

- Hover riga: bg `--color-surface-hover`
- Selezione riga: bg `--color-primary` al 6% + checkbox `--color-primary`
- Colonne numeriche: allineate a destra, `tabular-nums`, `white-space: nowrap`
- Testo lungo in cella: ellipsis oltre 24ch con `title` per full text

#### ⭐ «A destra» vuol dire TUTTE E TRE le fasce — deciso il 01/09/2026

> **In una colonna numerica stanno a destra il TITOLO, i VALORI e il TOTALE.**

_Proprietario, sugli Ordini fornitori: «gli importi si allineano a destra e i
totali ci vanno sotto allo stesso modo», e poi «anche l'allineamento interno lo
metterei a destra per gli importi»._

⛔ **Due difetti diversi, e nessuno dei due falliva.** Erano entrambi
`text-align` che non arrivava a destinazione:

| Dove              | Perché non arrivava                                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **riga totali**   | il selettore copriva `th`, `tbody td` e le righe — **non `tfoot td`**: la somma restava a sinistra sotto una colonna di importi   |
| **intestazione**  | il titolo sta in un contenitore **flex** (per ospitare il filtro accanto): `text-align` non muove i figli, e serve `margin-inline-start: auto` — vedi sotto perché non `justify-content` |

⭐ **L'incolonnamento è la funzione**, non l'estetica: una colonna di importi si
verifica confrontando le cifre incolonnate, e un totale o un titolo dall'altra
parte costringono l'occhio ad attraversare la colonna.

⚠️ **È la stessa trappola di `align-items` già scritta in §5**: una proprietà
dichiarata per un contesto continua a esistere quando quel contesto cambia, e
smette di fare quello che diceva senza dirlo.

#### ⛔ Ma NON con `justify-content`: decide da che parte si TAGLIA il titolo

⚠️ **Questa riga prescriveva `justify-content`**, ed era la prima stesura del
01/09/2026 — smentita dal proprietario un minuto dopo, guardando la schermata:
_«c'è un errore di battitura nella testata imponibile»_. Non c'era. L'etichetta è
«Imponibile», e allineata a destra il titolo troppo lungo per la sua colonna esce
dal lato **sinistro**: si legge «IPONIBILE», cioè un refuso invece di un
troncamento.

⭐ **Il margine automatico fa entrambe le cose giuste**: il titolo che ci sta
viene spinto a destra sopra i suoi numeri; quello che non ci sta occupa la cella
intera, parte da sinistra e si taglia in **coda**, come ovunque.

```scss
.data-table th.data-table__cell--numeric .data-table__head-label,
.data-table th.data-table__cell--numeric .data-table__sort {
  flex: 0 1 auto; // con `1 1 auto` il titolo occupa già tutto: nessun margine da distribuire
  margin-inline-start: auto;
}
```

⚠️ **Su TRE selettori, non uno**: il titolo può essere un `<button>` (colonna
ordinabile), uno `<span>` semplice, o stare accanto al chevron di un filtro.
Dichiarandone uno solo, la colonna si allinea o no a seconda che sia ordinabile —
imprevedibile per chi guarda.

#### ⛔ Una colonna numerica visibile ha il suo TOTALE

Segnalato lo stesso giorno: «qui mancano anche i totali». Imponibile e IVA erano
colonne accendibili dal selettore Colonne, allineate coi loro valori, e senza
somma — cioè non verificabili.

⚠️ **Non ogni colonna numerica si somma**, e la distinzione è il contenuto: un
**prezzo unitario** o una **percentuale di sconto** sommati fra articoli diversi
non producono un numero che significhi qualcosa. Si sommano le **grandezze
additive** — importi, imposte, quantità, conteggi.
- SKU / EAN: `--font-mono`, size 12px, colore `--color-focus` se cliccabile
- Sticky header sul bg dell'header (non su surface)

#### La pagina elenco si adatta alla finestra: cede solo l'ELENCO _(29/08/2026)_

> **Una pagina elenco non produce una barra di scorrimento propria.** Testata, filtri,
> riepilogo e barra azioni restano al loro posto e alla loro altezza; a cedere è solo la
> finestra sulle righe, e le righe non si abbassano mai — se ne vedono meno.

_Deciso dal proprietario il 29/08/2026, sul comportamento di Danea messo a confronto a tre
altezze di finestra._

```scss
.pagina {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-block-size: 0;
}
.pagina > * {
  flex: none;
} // testata, filtri, riepilogo, azioni
.pagina__elenco {
  flex: 1;
  min-block-size: 0;
} // l'unico che cede
```

⛔ **Mai `grid-template-rows` per assegnare il ruolo elastico.** Una traccia si dà al
**terzo figlio**, chiunque esso sia: basta un banner condizionale — e `@if` non crea un
elemento — perché tutto slitti di uno e la fascia che cresce finisca sull'avviso mentre
l'elenco perde la propria regione di scorrimento.

⚠️ **Non è teorico: era il difetto del Registro Corrispettivi**, cioè della pagina presa
a modello. Bastava filtrare per Sede con registrazioni senza sede. Corretto il 29/08/2026 —
e le pagine che dovevano copiarlo hanno molti più figli condizionali di lui: `product-list`
ne conta **undici** fra banner Shopify, feedback sync, chip bozze, riga colonne, scansione,
barra selezione ed errore duplicato.

⭐ **Chi cresce si dichiara per IDENTITÀ.** `> * { flex: none }` più una sola eccezione
nominata: la regola non si sposta quando il markup cambia.

#### E niente si comprime per far entrare: si vede di meno

⭐ È la stessa regola di «su mobile si riduce il NUMERO dei comandi, non la loro taglia»
(sotto), sull'asse verticale. Font, altezze di riga, pulsanti e bande **non si
rimpiccioliscono** quando lo spazio scarseggia: diminuisce la quantità di contenuto
visibile.

⛔ **`flex: none` va scritto esplicitamente su ciò che non deve cedere.** In una colonna
flessibile il default è `flex: 0 1 auto`, cioè _comprimibile_: `app-pagination` ha oggi
questo default e il suo filo si schiaccia **prima** che le righe cedano — il contrario
esatto del modello.

⚠️ **Il ritaglio estremo di Danea non si copia**: quando la finestra si riduce sotto le
bande fisse, a tagliare è il gestore finestre di Windows. In un browser non si può
togliere la barra strumenti: sotto una certa altezza la pagina scorre, e basta.

⛔ **E il riepilogo non sta DENTRO la regione elastica.** Metterlo lì, con un
`overflow: hidden` sul contenitore, lo renderebbe **irraggiungibile** su una finestra
bassa — la barra di scorrimento è un livello più sotto, sull'elenco. Su un registro si
perderebbe proprio «N voci · Imponibile · IVA · Totale», che è il dato che si va a
leggere. Resta **fratello** dell'elenco, con `flex: none`.

#### ⛔ `position: sticky` senza uno scrollport NON appiccica _(29/08/2026)_

> **Il contenitore di scorrimento di una tabella si dichiara col mixin**
> `table-scroll($selettore, $limite)` di `styles/_responsive-table.scss`. Mai a mano.

Il mixin emette **scorrimento e limite insieme**, e questo è tutto il punto: un wrapper
scritto a mano dimentica metà della coppia, e la metà che manca non fallisce.

| `$limite`           | Quando                                                        | Cosa emette                                 |
| ------------------- | ------------------------------------------------------------- | ------------------------------------------- |
| `tetto` _(default)_ | il contenitore non ha un genitore che gli dia altezza         | `max-block-size: var(--table-scroll-max-h)` |
| `riempi`            | sta già dentro una regione delimitata dalla catena di altezze | `block-size: 100%`                          |

⛔ **Scegliere `tetto` dentro una regione già delimitata produce due barre annidate**, e
l'intestazione si ancora a un bordo che esce dalla vista del genitore. È il caso del
Registro Corrispettivi dentro `.corrispettivi__panel-scroll`.

⚠️ **Il difetto era in QUATTRO posti**, misurato il 29/08/2026 — motore comune, Registro
Corrispettivi, elenco prodotti, vendite online. Le prime due si sono corrette una alla
volta, e la seconda l'ha trovata il proprietario **a schermo**: la correzione fatta sul
motore non raggiunge chi il motore non lo usa.

⭐ **Le tabelle senza wrapper sono sane, e vanno lasciate stare.** Clienti, Giacenze e
Situazione magazzino non hanno nessun contenitore proprio: si ancorano a
`.shell__content`, che è già uno scrollport vero perché la shell è `100dvh` con
`overflow: hidden`. **Funzionano da sempre.** Aggiungere loro un wrapper le romperebbe.

⚠️ **E la stampa va resettata.** I mixin di breakpoint emettono `@media (min-width: …)`
senza tipo di media, quindi restano attivi dentro `@media print`: su A4 orizzontale il
tetto sopravvive e **taglia tutto ciò che sta oltre il primo riquadro**. Il reset sta in
`styles.scss`, nel blocco `@media print`.

La guardia è `npm run check:sticky-scrollport`, dentro `npm run lint`: **cerca** ogni
intestazione appiccicata e fallisce su quelle non dichiarate, con tre categorie —
`mixin`, `shell`, `storica`.

---

##### Il difetto originale, e perché nessuno lo vedeva

> **L'intestazione di un elenco resta fissa e le righe scorrono sotto.** Non è una
> preferenza: senza tetto di righe a schermo (`14` §11.4) un elenco è lungo centinaia di
> schermate, e l'intestazione porta i **controlli di filtro** (`14` §0.2).

⚠️ **Il difetto è invisibile finché le righe sono poche**, ed è già in casa: misurato il
29/08/2026, `.data-table-scroll` dichiara `overflow-x: auto` e **nessun `max-block-size`**.
Lo scorrimento verticale vive in `.shell__content`, quindi il `sticky` del `<th>` si ancora
a un contenitore che non scorre mai — e non appiccica.

```scss
// ⛔ non basta: il contenitore non scorre in verticale, il sticky non ha a cosa ancorarsi
.tabella-scroll {
  overflow-x: auto;
}

// ✅ il contenitore diventa uno scrollport anche in verticale, e il sticky funziona
.tabella-scroll {
  overflow: auto;
  max-block-size: var(--table-scroll-max-h);
}
```

⭐ **Un `sticky` che non appiccica non fallisce: non fa niente.** Nessun errore, nessun
test rosso, nessuna guardia — si vede solo aprendo il browser e scorrendo. Va verificato a
schermo ogni volta che si tocca il contenitore di scorrimento di una tabella.

### ⭐ La grammatica dei riepiloghi — decisa il 20/08/2026

Sette voci confrontate una per una sui dati veri e scelte tutte nella forma del **Registro
Corrispettivi**, che `14` §F5 aveva indicato come riferimento di partenza:

| Voce                      | Valore                               |
| ------------------------- | ------------------------------------ |
| font del corpo            | `--text-xs` (12px)                   |
| padding delle celle       | `--space-1 --space-3` (4 × 12)       |
| altezza intestazione      | `--table-head-h` (26px), dichiarata  |
| divisori di colonna       | nessuno                              |
| larghezze                 | sul contenuto (`table-layout: auto`) |
| intestazioni              | MAIUSCOLE con `--tracking-caps`      |
| testo e filo intestazione | `--color-table-header-fg` / `-rule`  |

Vive nel mixin `summary-grammar($block)` di `styles/_responsive-table.scss`, incluso dal motore
tabella. ⛔ **Non è dentro `data-table-desktop`**: quel mixin lo usano anche le griglie di riga
dei documenti, che sono maschere di inserimento e non elenchi.

⭐ **Ogni altro ELENCO la può adottare** con una riga di `@include` — anagrafiche comprese — con
la verifica visiva di quella schermata.

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

### ⭐ Il TITOLO della card lo dichiara la colonna _(30/08/2026)_

> **In una card, la colonna che dice DI CHE RIGA SI TRATTA non è una riga
> «ETICHETTA: valore»: è il titolo.** Più grande, senza etichetta, in cima.

Si dichiara nel modello colonne, `cardTitle: true`, e il motore la riconosce.
Una sola per elenco: se più colonne la dichiarano vale la prima visibile — due
titoli non sono un titolo.

⛔ **Prima era un mixin CSS che prendeva una CLASSE** (`data-table-mobile-title`),
quindi funzionava solo per le tabelle scritte a mano: il motore non mette classi
per colonna. Migrando prodotti e clienti il titolo **è sparito in silenzio**, e
gli altri cinque elenchi sul motore non l'avevano mai avuto — non c'era modo di
dirglielo.

⚠️ **Se la colonna del titolo è spenta dal selettore Colonne, il titolo non c'è**,
e la card resta tutta a etichetta:valore. È il comportamento onesto: promuovere
un'altra colonna direbbe una cosa per un'altra.

⭐ **Chi ha una card PROGETTATA non lo usa**: il Registro Corrispettivi disegna la
propria (`appRowCard`), e lì il titolo è già parte del disegno.

### ✅ La grammatica della card è UNA, e sta in un foglio globale _(30/08/2026)_

⭐ **La forma a tre fasce descritta qui sotto non è più del solo Registro
Corrispettivi**: è `styles/_list-card.scss`, e la usano tutti gli elenchi.

_Deciso dal proprietario: «i riepiloghi dei documenti possiamo sistemarli e
unificarli come quelli dei corrispettivi»._

```text
.list-card__head      fascia 1 — identità: __when · __what, e __anchor a destra
.list-card__words     fascia 2 — solo parole
.list-card__figures   fascia 3 — solo numeri, con __total e __caret
```

⛔ **Sta in un foglio GLOBALE e non nel motore**, e la ragione è la stessa di
`_shared-directives.scss`: la card è **contenuto proiettato** (`appRowCard`), e
una regola dentro il motore porta l'attributo di incapsulamento del motore —
**non raggiunge** il contenuto proiettato, e non fallisce: non fa niente.

⚠️ **Ogni fascia è facoltativa**: un elenco senza importi omette la terza. Quello
che non si fa è spostare un importo fra le parole — è l'unico criterio che la
card ha.

#### ⛔ E la direttiva va IMPORTATA, o il template sparisce in silenzio

Un `<ng-template appRowCard>` in un componente che non importa
`DataTableRowCardDirective` non è un errore per Angular: l'attributo è sconosciuto
e viene **ignorato**. Il template compila, i test passano, e sotto `lg` la card non
c'è — si torna al ripiego a etichetta:valore senza che niente lo dica.

⚠️ **Misurato lo stesso giorno su cinque elenchi**: la card scritta, la direttiva
non importata, la build verde. La guardia è `npm run check:row-card`, e vale anche
per `appCell` e `appRowActions`, che si comportano allo stesso modo.

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

**Desktop.** Griglia orizzontale in card compatta, posizionata dopo la tabella righe: Imponibile righe · Sconto extra · Imponibile · IVA · Totale documento. Il **Grand total** è l'ultimo box, con piena tinta brand `--color-primary`, testo bianco, valore `--text-grand-total` (17px) weight 700. Valori intermedi weight 600, non tutti bold.

**Caselle dimensionate sul contenuto, non stirate** — e va preso alla lettera: spartire la banda in parti uguali fa sì che la stessa casella sia larga il doppio in un documento con tre voci e la metà in uno con otto, e in una maschera senza fascia note il riepilogo si stira per tutta la pagina. La misura minima di una casella è il suo contenuto, non zero: dove la cella ospita **due cose che si alternano** — il campo sconto e, finché lo sconto non c'è, il pulsante «+ Aggiungi sconto» — la larghezza fissa va sul **campo**, non sulla cella, o il pulsante sborda sopra la casella accanto.

**Mobile e tablet.** Sezione finale del documento (dopo le righe e le note), non sticky. Lista verticale con label a sinistra e valore a destra:

- Subtotale
- Sconto extra — **campo sempre visibile**, che mostra `0%` quando non c'è. Non un pulsante che lo riveli: il pulsante nasconde uno stato, e guardando il riepilogo non si saprebbe se lo sconto è zero o se il campo è chiuso. Un campo che mostra 0% dice entrambe le cose senza chiedere niente, e costa un clic in meno _(deciso 08/2026)_
- IVA
- **Totale documento** più marcato, 20px weight 700, valore in colore `--color-primary`

Il totale mobile è visibile solo scrollando fino in fondo; i pulsanti Chiudi / Salva documento seguono subito dopo, come coppia allineata a destra (vedi §5).

---

## 7-bis. Anatomia di un'ANAGRAFICA (fornitore, cliente, articolo)

⚠️ **Non è la maschera di un documento e non è una pagina di impostazioni.** È il posto
dove si trascrive un dato da un foglio che si ha davanti, spesso venti campi di fila, e si
giudica su una cosa sola: **quanto in fretta ci si passa dentro con la tastiera**.

_Deciso il 01/09/2026 rifacendo l'anagrafica fornitore, dopo che il proprietario ha
respinto tre versioni: «le celle sono enormi», «è tutto troppo grande, anche gli spazi sono
enormi», «i testi vanno allineati»._

### La misura di un campo è quella del suo dato

⛔ **Mai una griglia a colonne uguali.** Misurato prima della correzione, a 1440px: CAP e
Provincia larghi **589px** — per cinque cifre e due lettere — e la scheda alta **1792px**,
cioè due schermate.

⛔ **Qui c'era una FILA che andava a capo da sola** (`flex-wrap` più `--campo-w`), e il
proprietario ne ha visto il difetto: «in base allo schermo si adatta meglio o peggio». Era
vero — col solo `flex-basis`, il punto in cui la riga si spezza dipende dalla finestra: a
1230px «Paese» restava solo su una riga sua, staccato da «Prov.» che gli sta accanto in
ogni indirizzo. La stessa maschera aveva una disposizione diversa a ogni larghezza, e non
c'è muscolo che la impari.

⭐ **È una GRIGLIA a dodici colonne, e ogni campo dichiara due cose**: quante colonne
occupa (`--span`, la **posizione**) e, dove il dato è corto, fin dove può allargarsi
(`--campo-max`, la **misura**).

```html
<div class="campo" style="--span: 2; --span-sm: 1; --campo-max: var(--field-w-sm)">
  <!-- CAP -->
</div>
```

```scss
.griglia {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr)); // due colonne anche sul telefono
  @include bp.media-up('md') {
    grid-template-columns: repeat(12, minmax(0, 1fr));
  }
}
.campo {
  grid-column: span var(--span-sm, 2);
  max-inline-size: var(--campo-max, none);
  @include bp.media-up('md') {
    grid-column: span var(--span, 3);
  }
}
```

⚠️ **Lo `--span` si sceglie VICINO al tetto, non largo.** Un campo con `--campo-max` che
occupa più colonne del necessario lascia il resto della propria colonna **vuoto**, e il
buco cade in mezzo alla riga: misurato il 01/09/2026, «Città» a `--span: 6` col tetto a
224px apriva 148px di vuoto fra Città e Prov. Lo spazio che avanza deve finire **in coda
alla riga**, dove il bordo frastagliato è la forma giusta.

⚠️ **E una riga che deve restare intera somma DODICI**: se ne somma dieci, il primo campo
della riga dopo sale a riempire il buco. Sulla scheda cliente questo spezzava i tre campi
fiscali — la P. IVA in cima a destra, gli altri due sotto.

⭐ **La grammatica sta in un posto solo**: `styles/_anagrafica.scss`, mixin
`anagrafica-fields($blocco)`, incluso dalla scheda fornitore e da quella cliente. Non è un
componente condiviso — i campi delle due schede sono diversi, e fonderli in un componente
con venti `input()` per accendere e spegnere campi è l'anti-pattern che
`regole-architettura` vieta. A ripetersi è la grammatica, non il contenuto.

| Token          | Misura | Per                                    |
| -------------- | ------ | -------------------------------------- |
| `--field-w-xs` | 80px   | Provincia, Paese                       |
| `--field-w-sm` | 128px  | CAP, sconto, percentuali               |
| `--field-w-md` | 176px  | P. IVA, codice fiscale, Codice IVA     |
| `--field-w-lg` | 224px  | città, referente, tendine di pagamento |
| `--field-w-xl` | 352px  | ragione sociale, indirizzo, email      |

⛔ **`flex-grow` è il difetto che torna in piccolo.** Con `flex: 1` i campi si rispartiscono
la riga in parti uguali: misurato, «Città» a **1002px** e «Sito web» a **1194px**. A crescere
restano le sole aree di testo. **Il bordo destro frastagliato è la forma giusta**, ed è
quella del riferimento Danea.

### Altezza, tipografia, allineamento

- **Controlli a `--control-h-entry` (26px)**, sul telefono come sulla scrivania — la
  decisione è nel token, con la ragione e il limite WCAG. ⚠️ Erano 28, scesi a 26 il
  01/09/2026 su richiesta del proprietario: «per recuperare spazio potremmo scendere la
  cella a 26px». **Sotto i 26 non si scende**: il minimo AA è 24×24.
- **Etichetta a `--text-2xs`, muted, 2px sopra il campo**: pesa quanto due terzi del
  controllo che descrive, e su dieci righe vale una riga intera.
- ⚠️ **Il corpo dell'input NON scende sotto i 16px sul telefono**: iOS ingrandisce la pagina
  da solo a ogni fuoco. La densità tipografica sta dentro `media-up('md')`, **annidata nella
  regola base** — scritta come blocco a parte viene scavalcata, e non se ne accorge nessuno
  (`check:media-scavalcate` l'ha trovata il giorno stesso).
- ⭐ **Le sezioni sono `app-form-section` `[flat]`** — titolo con un filo sotto, nessuna
  scatola per ciascuna: tutte sulla stessa colonna, così etichette e campi si incolonnano
  con il titolo di sezione.

### ⭐ La scheda è UNA card, e ogni sezione porta un filo di brand _(01/09/2026)_

_Il proprietario: «l'unica cosa che non mi piace è avere una intera pagina con sfondo
grigio e caselle bianche. Bisognerebbe dare un tocco di bellezza, distinzione visiva e
magari utilizzare qualche riga col verde per rendere la pagina elegante e intuitiva.»_

⛔ **Qui le sezioni piatte stavano sul fondo pagina**: venticinque caselle bianche
appoggiate al grigio, senza niente che dicesse dove finisce una sezione e comincia l'altra.
La densità era risolta, la **lettura** no.

|                       |                                                                       |
| --------------------- | --------------------------------------------------------------------- |
| **la scheda intera**  | superficie bianca, bordo, `--radius-lg`, `--shadow-card`              |
| **il titolo sezione** | barretta verticale `--border-width-accent` in `--color-primary`       |
| **il filo sotto**     | `--color-border` **tinto** di brand al 22%, non verde pieno           |
| **lo stacco**         | 6px fra sezioni: con la card e gli accenti è quanto basta a separarle |

⚠️ **Il verde è quello del BRAND (`--color-primary`), non della sidebar.** §2 riserva
`--color-nav-*` alla navigazione — «non è un secondo brand, è la palette della
navigazione» — e prenderlo come accento generico è la porta da cui rientra il disordine
cromatico. Il brand è della stessa famiglia scura e fa lo stesso lavoro.

⚠️ **A piena tinta il filo sotto ogni titolo sarebbe cinque righe verdi in una schermata**,
e l'accento smetterebbe di accentare: il colore lo porta la barretta, il filo lo accompagna.

⭐ **E il conto dello spazio torna**: card, accenti e stacchi costano, i 26px del campo li
restituiscono. Misurato a 1440 su venticinque campi — **955px prima, 945 dopo**.

- ⭐ **Indietro e titolo sulla stessa riga**: impilati costano una fascia prima del primo
  campo.
- ⭐ **Indietro e titolo sulla stessa riga**: impilati costano una fascia prima del primo
  campo.

### L'ordine dei campi è quello in cui si BATTE il dato

⭐ Non quello del modello: si copia da un'intestazione di fattura o da un biglietto da
visita — **ragione sociale → dati fiscali → indirizzo → contatti** — e le condizioni
commerciali vengono dopo, perché si decidono invece di trascriverle. Dentro l'indirizzo:
**CAP prima di Città, Città prima di Provincia**, come si legge un indirizzo italiano.

⚠️ **Il giro del Tab è l'ordine del DOM**: nessun `tabindex` positivo, nessun riordino in
CSS. Chi sposta un campo sposta anche la tabulazione, ed è voluto.

### I controlli di digitazione sono AVVISI, non errori

⛔ **Non bloccano il salvataggio**: `regole-gestionale` riserva il blocco a SKU, codice
articolo e barcode — ciò che romperebbe database, sync o identità. Una partita IVA con la
cifra di controllo sbagliata è quasi sempre un refuso, ma ogni tanto è il dato che il
fornitore ha davvero mandato.

- **Colore `--color-warning`, mai `--color-danger`**: il rosso significa «hai provato a
  salvare e questo è sbagliato». Usarlo qui rende i due stati indistinguibili.
- **Compaiono all'uscita dal campo**, non mentre si scrive: al primo carattere ogni partita
  IVA è «non valida», e un avviso che lampeggia a ogni tasto si impara a ignorare.
- Gli algoritmi (checksum P. IVA e codice fiscale) stanno in `domain/fiscal/` e sono
  **copiati** da `docs/06b` §B, non riscritti.

---

### Note documento

- Label 10px uppercase
- Textarea min-height ~44px, max ~90px, resize verticale
- Font 12.5px, line-height 1.35

### Azioni documento

Vedi §5 "Azioni documento (per device)": desktop usa footer sticky in basso; mobile e tablet mostrano Chiudi/Salva documento in fondo al documento dopo il riepilogo totali.

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

- Altezza `--topbar-height` (60px), allineata alla fascia brand della sidebar
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

| Nome            | Range       | Comportamento chiave                                                                           |
| --------------- | ----------- | ---------------------------------------------------------------------------------------------- |
| Phone stretto   | ≤ 400px     | Testata form in 1 colonna, padding ridotti al minimo                                           |
| Phone           | 401–480px   | Card mobile compatte, metriche essenziali                                                      |
| Mobile / Tablet | 481–1024px  | Card view sostituisce tabelle, testata comprimibile, azioni Chiudi/Salva in fondo al documento |
| Desktop         | 1025–1799px | Layout standard, tabelle piene, sidebar persistente                                            |
| Desktop largo   | ≥ 1800px    | `max-width` contenuto a 1720px, no stiramento                                                  |

⛔ **Mai un valore px dentro un `@media`**: si usano i mixin `bp.media-up()` / `bp.media-down()` di `styles/_breakpoints.scss`. ⚠️ **Non sono custom property e non possono esserlo** — `@media (min-width: var(--x))` non aggancia niente, in silenzio: sono variabili SCSS, e stanno in quel file, non in `_design-tokens.scss`.

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

⚠️ **Le due soglie vanno RIVISTE quando la scelta manuale esiste** _(deciso dal
proprietario il 18/08/2026)_, e la ragione è che le due decisioni si sono prese in
ordine inverso.

I 1400px del dito sono tarati per **non sbagliare mai** su un tablet: la soglia è
l'unico rimedio, quindi deve coprire anche il caso più largo, e per farlo manda alle
card anche schermi dove la tabella starebbe benissimo. **Con una valvola manuale quel
compito cambia**: la soglia non deve più essere l’unica risposta giusta per tutti, deve
essere quella giusta per **la maggioranza**, e le eccezioni le prende l’impostazione.

Una soglia prudente senza valvola è cautela; **la stessa soglia con la valvola è un
default che sbaglia più spesso del necessario**, e ogni volta costa all’operatore un giro
nelle Impostazioni.

**Quindi le due cose si progettano insieme, non una dopo l’altra**, e i numeri qui sopra
restano da confermare — non sono un dato acquisito.

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
