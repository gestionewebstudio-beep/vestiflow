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

| Uso                                    | Valore    | Token                     |
| -------------------------------------- | --------- | ------------------------- |
| Sfondo pagina                          | `#eef0f2` | `--color-bg`              |
| Superficie card / pannelli             | `#ffffff` | `--color-surface`         |
| Superficie tenue (row alterne, sunken) | `#f6f7f8` | `--color-surface-soft`    |
| Superficie tabella hover               | `#f8faf9` | `--color-surface-hover`   |
| Header tabella                         | `#e9edee` | `--color-table-header-bg` |

### Bordi e divisori

| Uso                                               | Valore    | Token                         |
| ------------------------------------------------- | --------- | ----------------------------- |
| Bordo base                                        | `#d7dddd` | `--color-border`              |
| Bordo forte (input focus off, separatori sezioni) | `#b6c0c1` | `--color-border-strong`       |
| Divisori cella tabella                            | `#e4ebe8` | `--color-border-cell`         |
| Divisori gruppi colonne tabella (2px)             | `#b9c7c0` | `--color-table-group-divider` |

### Testo

| Uso                                       | Valore    | Token                  |
| ----------------------------------------- | --------- | ---------------------- |
| Testo primario                            | `#20282b` | `--color-text`         |
| Testo muted (label uppercase, hint, meta) | `#657075` | `--color-text-muted`   |
| Testo subtle (placeholder, disabled)      | `#8a9498` | `--color-text-subtle`  |
| Testo su superfici scure                  | `#ffffff` | `--color-text-inverse` |

### Brand e interazione

| Uso                                         | Valore                                                                           | Token                      |
| ------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------- |
| Brand primario (CTA, header attivi, avatar) | `#25343b`                                                                        | `--color-primary`          |
| Brand hover                                 | `#18262d`                                                                        | `--color-primary-hover`    |
| Brand tinta chiara (subtle)                 | `#edf2f4`                                                                        | `--color-primary-subtle`   |
| Focus (bordo campo + anello)                | `#4f7e8d`                                                                        | `--color-focus`            |
| Focus ring alpha                            | `rgba(79,126,141,.12)`                                                           | `--color-focus-ring-alpha` |
| Link accento                                | usa `--color-primary` o `--color-focus` — non introdurre un colore link separato | —                          |

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

| Uso                                    | Desktop                                         | Mobile                         |
| -------------------------------------- | ----------------------------------------------- | ------------------------------ |
| H1 titolo pagina                       | 20px / weight 760 / letter-spacing -.025em      | 18px / weight 760              |
| H2 titolo sezione                      | 14px / weight 700                               | 13px / weight 700              |
| Testo base UI                          | 13px                                            | 13px                           |
| Testo cella tabella                    | 12.5px                                          | — (le tabelle diventano card)  |
| Label uppercase (form, tabella)        | 9.5–10px / weight 760 / tracking .045em / muted | 9.5px / weight 760             |
| Testo card mobile — nome prodotto      | —                                               | 14.5px / weight 700            |
| Testo card mobile — sub info           | —                                               | 11px / weight 400 / muted      |
| Testo header summary compresso — small | —                                               | 11px / weight 600 / muted      |
| Input desktop                          | 12.5px                                          | —                              |
| Input mobile                           | —                                               | **≥16px** (regola iOS no-zoom) |
| Numero grand total                     | 22–24px / weight 700 desktop                    | 20px / weight 700              |
| Metric chip mobile (Qtà/Prezzo/Totale) | —                                               | 9px label / 12.5px valore      |
| Bottoni                                | 13px / weight 600                               | 13px / weight 600              |
| kbd (scorciatoie tastiera)             | 10.5px monospace                                | —                              |

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
- Card mobile aperta / hover: leggero rialzo, ombra `0 6px 18px rgba(20,42,34,.08)`

Regola: nessuna ombra su bottoni, input, celle. Ombre solo su contenitori (card, pannelli, overlay).

### Touch target minimo

**44px** ovunque sia un elemento tappabile su mobile. Su desktop si può scendere a 32–34px per bottoni densi e a 29–30px per input in griglia densa.

---

## 5. Componenti condivisi

Ogni componente vive in `src/app/shared/`. Nessuno stile equivalente va replicato nei componenti feature.

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

In stato aperto: griglia dei campi come da testata desktop, ma con campi in colonna singola e h ≥44px.

### Righe (desktop = tabella, mobile = card)

Vedi §6.

### Riga "Documento collegato" (preventivo, ordine origine)

- Full-width, occupa tutta la riga tabella (`colspan`)
- Accento laterale sinistro: `border-left: 3px solid var(--color-info)` desktop
- Background riga: `var(--color-surface-soft)`
- Contenuto: icona sorgente + tipo documento (pill) + titolo + data + meta (importo, ecc.)

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
