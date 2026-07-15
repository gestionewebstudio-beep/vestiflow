# VestiFlow — Restyle "Tech Moderno" (dark-first)

Specifica di handoff per implementare il restyle mostrato in `VestiFlow Restyle.dc.html` (dark: 1a Dashboard, 1b Prodotti, 1c Arrivo merce, 1d Token sheet · light: 2a–2c). Vale per **tutta l'app**: le schermate mockup definiscono il sistema, tutte le altre pagine seguono le stesse regole.

## Principi

- **Dark è il tema principale** (`:root` = dark). Il light attuale diventa l'override `[data-theme='light']` — si inverte la logica attuale in `src/styles/_design-tokens.scss`.
- **Un solo accento**: `#6C7BFF` (indigo vivace) per CTA primaria, focus ring, link, selezione, nav attiva. Sostituisce sia la CTA charcoal che il blu Polaris (`--color-primary` e `--color-interactive` convergono).
- **Verde `#3DDC97`** riservato a Shopify/sync/successo (continuità con `--color-brand`).
- **Densità invariata**: base 13px, righe tabella ~36px, input 34px. Nessun cambio a `--text-*`.
- Bordi > ombre. Ombre solo per dropdown/overlay.
- SKU, EAN e numeri: `JetBrains Mono` (già previsto come `--font-mono`) + `tabular-nums`.
- Contrasto testo minimo 4.5:1; focus visibile con ring accento 3px al 18% alpha.

## Override token (dark, nuovo `:root`)

Mappa 1:1 sulle variabili esistenti di `_design-tokens.scss` — nessun rename necessario:

```scss
:root {
  color-scheme: dark;

  // Superfici
  --color-bg: #0b0c0f;
  --color-surface: #14161b;
  --color-surface-raised: #1a1d24;
  --color-surface-sunken: #0f1116; // usato anche come bg input
  --color-surface-hover: #171a20;

  --color-border: #262a33;
  --color-border-strong: #333a47;

  // Testo
  --color-text: #e9ecf2;
  --color-text-muted: #9ba3b0;
  --color-text-subtle: #667085;
  --color-text-inverse: #0b0c0f;

  // CTA + interattivo (unificati sull'accento)
  --color-primary: #6c7bff;
  --color-primary-hover: #8591ff;
  --color-primary-active: #5b6af2;
  --color-primary-fg: #ffffff;
  --color-primary-subtle: rgba(108, 123, 255, 0.14);

  --color-interactive: #6c7bff;
  --color-interactive-hover: #8591ff;
  --color-interactive-active: #aab3ff;
  --color-interactive-subtle: rgba(108, 123, 255, 0.14);

  --color-focus-ring: #6c7bff;
  --color-link: #8591ff;
  --color-link-hover: #aab3ff;

  // Brand Shopify / successo
  --color-brand: #3ddc97;
  --color-brand-hover: #63e5ab;
  --color-brand-subtle: rgba(61, 220, 151, 0.12);

  --color-danger: #ff5c5c;
  --color-danger-hover: #ff7a7a;
  --color-danger-fg: #ffffff;

  --color-backdrop: rgba(0, 0, 0, 0.72);

  // Nav
  --color-nav-bg: #0e1014;
  --color-nav-hover: #14161b;
  --color-nav-selected-bg: rgba(108, 123, 255, 0.14);
  --color-nav-selected-text: #e9ecf2;

  // Stati (fg / bg / border: tinta al 12% / 25% alpha)
  --status-ok-fg: #3ddc97;
  --status-ok-bg: rgba(61, 220, 151, 0.12);
  --status-ok-border: rgba(61, 220, 151, 0.25);
  --status-low-fg: #ffb02e;
  --status-low-bg: rgba(255, 176, 46, 0.12);
  --status-low-border: rgba(255, 176, 46, 0.25);
  --status-empty-fg: #ff5c5c;
  --status-empty-bg: rgba(255, 92, 92, 0.12);
  --status-empty-border: rgba(255, 92, 92, 0.25);
  --status-success-*: come ok;
  --status-warning-*: come low;
  --status-error-*: come empty;
  --status-info-fg: #4cc3ff;
  --status-info-bg: rgba(76, 195, 255, 0.12);
  --status-info-border: rgba(76, 195, 255, 0.25);
  --status-neutral-fg: #9ba3b0;
  --status-neutral-bg: rgba(155, 163, 176, 0.12);
  --status-neutral-border: rgba(155, 163, 176, 0.25);
}
```

Spacing, radius, z-index, typography scale, breakpoints: **invariati**.
Radius effettivi usati nel mockup: 8px controlli/righe, 10px card, 14px nessuno in-app (solo frame mockup).

## Pattern di componente (dal mockup)

### Shell

- Sidebar 232px, bg `--color-nav-bg`, logo lockup in testa (icon-topbar.png 28px + wordmark 15/700).
- Voce attiva: bg `--color-nav-selected-bg` + indicatore `inset 2px 0 0 var(--color-primary)` + icona colorata accento.
- Badge contatore nav (es. "Ordini fornitore 6"): pill 11/600 accento su subtle.
- Topbar 52px: **ricerca globale ⌘K** al posto del titolo (nuovo pattern), poi chip stato sync Shopify (pill verde con dot), selettore location, toggle tema, avatar 32px.

### Bottoni (34px, dense; 36px nei footer azione)

- Primario: bg accento, testo bianco, 13/600.
- Secondario: bg `--color-surface`, bordo `--color-border-strong`.
- Ghost: solo testo accento. Distruttivo: tinta rossa 12% + bordo 35%.

### Badge di stato

Pill: 11/600, fg pieno + bg 12% + bordo 25% dello stesso colore. Mai testo scuro su tinta.

### Tabelle

- Header: 11/600 uppercase, letterspacing 0.05em, `--color-text-subtle`, bg `#101217`, border-bottom `--color-border`.
- Righe: 13px, padding-block 9px, divider `#1f232c`, hover `--color-surface-hover`.
- Selezione riga: bg accento 6% + checkbox accento.
- Giacenza colorata per soglia: rosso ≤ soglia critica, ambra sotto soglia, default altrimenti.
- SKU/EAN: mono 12, colore link accento per SKU cliccabile.

### Form (Arrivo merce, 1c)

- Testata come card unica a griglia 4 colonne, label 11/600 uppercase sopra il campo.
- Campo in focus: bordo accento + ring `0 0 0 3px rgba(108,123,255,0.18)`.
- Riga di inserimento attiva: bg accento 7% + indicatore laterale accento, input inline 30px.
- Hint tastiera (Invio/Tab) in una fascia sotto la tabella, kbd in mono.
- Riquadro totali allineato a destra (min 300px): Righe/pezzi, Imponibile, IVA, Totale 15/700.
- Footer azioni sticky in basso: Annulla (ghost) / Salva bozza (secondario) / Conferma carico (primario), con nota "Le giacenze si aggiornano alla conferma" e autosave badge in header ("Salvato automaticamente · hh:mm").

### Dashboard (1a)

- Selettore periodo segmented (Oggi / 7gg / 30gg / Stagione) in alto a destra.
- KPI card: label 11 uppercase, valore 24/700 tabular, delta verde/rosso con freccia; la card "azionabile" (Vendite da evadere) ha bordo accento.
- Grafico barre affiancate Negozio (accento) / Shopify (verde) con legenda a quadratini.
- "Varianti sotto soglia" come lista compatta (nome + SKU·variante mono, badge "n / soglia m").

## Note implementative

- Font: Inter già presente via `@fontsource-variable/inter`; aggiungere JetBrains Mono (fontsource) per `--font-mono`.
- Icone: restano PrimeIcons (`pi pi-*`), dimensione 13–14px nelle voci nav e nei bottoni.
- Il toggle tema esistente resta: invertire solo default e override in `_design-tokens.scss`.
- Aggiornare `--color-backdrop`, skeleton e chart.js palette (accento + verde) di conseguenza.
- Accessibilità: mantenere `--btn-min-height: 2.75rem` per i touch target mobile; le altezze 34px valgono solo desktop denso (≥ lg).

## Override token — LIGHT (`[data-theme='light']`)

Schermate 2a–2c del mockup. Stessi componenti, soli token invertiti:

```scss
[data-theme='light'] {
  color-scheme: light;
  --color-bg: #eef0f4;
  --color-surface: #ffffff;
  --color-surface-raised: #eef0f4;
  --color-surface-sunken: #ffffff;
  --color-surface-hover: #f3f5f9;
  --color-border: #e2e6ee;
  --color-border-strong: #cbd2df; // input: #d3d9e3
  --color-text: #171a21;
  --color-text-muted: #5b6472;
  --color-text-subtle: #6b7486;
  --color-text-inverse: #ffffff;
  --color-primary: #5560ee; // accento più profondo per contrasto su bianco
  --color-primary-hover: #6c7bff;
  --color-primary-fg: #ffffff;
  --color-interactive: #5560ee;
  --color-link: #4d58e6;
  --color-link-hover: #3742c9;
  --color-nav-bg: #f7f8fa;
  --color-nav-hover: #ffffff;
  --color-nav-selected-bg: rgba(108, 123, 255, 0.14);
  --color-brand: #0e9d68;
  --color-danger: #d92d2d;
  --status-ok-fg: #0e9d68;
  --status-ok-bg: rgba(14, 157, 104, 0.1);
  --status-ok-border: rgba(14, 157, 104, 0.3);
  --status-low-fg: #b26a00;
  --status-low-bg: rgba(178, 106, 0, 0.1);
  --status-low-border: rgba(178, 106, 0, 0.3);
  --status-empty-fg: #d92d2d;
  --status-empty-bg: rgba(217, 45, 45, 0.08);
  --status-empty-border: rgba(217, 45, 45, 0.28);
  --status-info-fg: #0b7fc2;
  --status-info-bg: rgba(11, 127, 194, 0.1);
  --status-info-border: rgba(11, 127, 194, 0.28);
  --status-neutral-fg: #5b6472;
  --status-neutral-bg: rgba(91, 100, 114, 0.1);
  --status-neutral-border: rgba(91, 100, 114, 0.28);
  // Table header bg: #f7f8fa · divider righe: #e8ebf1 · selezione riga: rgba(108,123,255,0.06)
}
```

## Copertura: tutto il progetto

Il grosso del restyle è **centralizzato nei token**: l'architettura esistente ("i componenti usano SOLO var(--token)") fa sì che riscrivere `_design-tokens.scss` propaghi il tema ovunque. Oltre ai token, applicare i pattern di questa spec a:

1. **`src/styles/_design-tokens.scss`** — sostituire i blocchi `:root` (→ dark) e `:root[data-theme='dark']` (→ `[data-theme='light']`) con gli override di questa spec. Aggiornare anche `--vestiflow-lockup-bg`, `--badge-vestiflow-*`, `--shadow-*` (dark: alpha nera più alta; light: rgba(15,23,42,…)).
2. **`src/styles.scss`** — nessun cambio strutturale; verificare focus-ring e link.
3. **Shell** (`src/app/layout/` + topbar/sidebar in `src/app/shared/`):
   - Sidebar: logo lockup in testa, voce attiva con bg subtle + indicatore inset 2px accento + icona accento, badge contatori pill.
   - Topbar: ricerca globale ⌘K al centro-sinistra (nuovo componente, può essere solo UI in prima battuta), chip sync Shopify a pill con dot, selettore location, toggle tema, avatar tondo accento.
4. **Componenti condivisi** (`src/app/shared/`): app-button (34px dense, varianti come da spec), app-badge (pill fg pieno + bg 12% + bordo 25%), select-menu, date-input, pagination (pill numerate), table-skeleton, empty/error-state, confirm-dialog (surface raised, bordo, shadow-lg), toast.
5. **Tutte le liste** (`_list-page.scss` + prodotti, documenti, vendite, clienti, fornitori, ordini, magazzino): header tabella 11/600 uppercase su bg sunken, hover riga, selezione riga accento 6%, SKU/EAN in mono, giacenze colorate per soglia, filtri a chip inline (filtro attivo = tinta accento con ×).
6. **Tutti i form documentali** (`goods-receipt`, `purchase-invoice`, `sales-document`, `transfer`, `stock-operation`, `movement`, `supplier-order`): testata a card unica griglia 4 col, riga attiva evidenziata, hint tastiera, totali a destra, footer azioni sticky, badge autosave in header.
7. **Dettagli** (`_detail-page.scss`): breadcrumb come in 1c, panel su surface con bordo.
8. **Dashboard e report**: KPI card, segmented period, palette chart.js = accento #6C7BFF + verde #3DDC97 (light: #5560EE + #0E9D68), gridlines = --color-border.
9. **Login/auth**: card centrata su --color-bg, logo, input e CTA come da token; nessun layout nuovo.
10. **Vendita in negozio (registratore), settings, admin, guida**: solo token + pattern sopra, nessun redesign funzionale.

**Regola generale**: nessun redesign di flussi o layout oltre a quanto mostrato; è un re-skin sistematico + i nuovi pattern di shell (ricerca ⌘K, chip sync, footer sticky, badge autosave).

**Criteri di accettazione**

- Nessun valore colore hardcoded fuori da `_design-tokens.scss` (già regola del repo).
- Dark default al primo avvio; toggle e preferenza utente continuano a funzionare (logica invertita).
- Contrasto AA (4.5:1) per testo normale in entrambi i temi; focus visibile ovunque.
- Test e2e esistenti verdi (a11y.spec incluso); Lighthouse a11y ≥ attuale.
- Etichette/stampa (`@media print` e label print) restano su sfondo bianco: le pagine di stampa forzano `[data-theme='light']`.

## Polish v2 (approvato — luglio 2026)

Evoluzione della spec sopra, stessa identità Tech Moderno. Dove questa sezione
diverge dalle regole precedenti, vince questa sezione.

- **Titoli pagina**: `--text-2xl` (24px) bold + `--tracking-tight`. I titoli di
  panel/sezione restano `--text-lg`/`--text-xl`.
- **KPI (stat-card)**: valore `--text-kpi` (28px, nuovo token) bold + tabular-nums.
- **Ombre sulle card**: panel e card su surface prendono `--shadow-xs` (il
  principio "bordi > ombre" resta: l'ombra è profondità sottile, il bordo
  disegna la forma). Le card **cliccabili** (hub documenti e simili) al hover
  fanno lift: `translate 0 -2px` + `--shadow-md` + icona/freccia accento.
- **Motion**: ingresso pagina fade+rise 240ms (`--transition-page`, nuovo token,
  keyframes `shell-content-enter` in `styles.scss`); bottoni con press
  `translate 0 1px` su :active; primary hover con alone `--color-focus-ring-alpha`.
  `prefers-reduced-motion` resta gestito globalmente.
- **Scrollbar a tema**: sottili (`--space-2`), thumb `--color-border-strong`,
  track trasparente; regole standard + `::-webkit-scrollbar` in `styles.scss`.
- **Empty state**: icona in medaglione `--space-12` tondo su
  `--color-surface-muted` con bordo.
- **Shell**: padding contenuto responsive `--space-3` / `--space-4` (sm) /
  `--space-5 --space-6` (lg); nav della sidebar scrollabile con brand e logout
  sempre visibili; il selettore location in topbar si comprime sotto md.
- **Pagine auth**: brand lockup (logo 32px + wordmark `--text-xl` bold) sopra la
  card, su bg pagina.
- **Stampa**: le pagine print restano escluse dal polish (nessuna ombra/motion).

## Restyle v3 — "Chiaro professionale" (approvato — luglio 2026)

Decisione del proprietario: **il tema principale diventa LIGHT**. Il dark resta
completo e selezionabile dal toggle (nessun token rimosso). Dove questa sezione
diverge dalle precedenti, vince questa.

- **`:root` = tema chiaro** (i valori dell'ex override `[data-theme='light']`,
  schermate 2a–2c del mockup); il dark vive nel mixin `theme-dark` applicato da
  `[data-theme='dark']`.
- **ThemeService**: `DEFAULT_MODE = 'light'` al primo avvio; preferenza salvata
  e modalita' system invariate.
- **Asset che assumevano dark**: logo sidebar/login invertiti solo sotto
  `[data-theme='dark']`; meta `theme-color` e manifest PWA su `#eef0f4`.
- **Ritmo verticale**: le pagine list/detail passano a gap `--space-6`.
- **Larghezza campi per contenuto**: nuovi token `--field-w-xs|sm|md|lg|xl`
  (80/128/176/224/352px) — un campo e' largo quanto il dato che ospita, mai
  quanto la pagina.
- La stampa resta forzata su tema chiaro (`:root[data-theme='dark']` incluso).
- Tutte le regole del Polish v2 (titoli 24px, KPI 28px, ombre, motion,
  scrollbar, empty state) valgono su entrambi i temi.

## Restyle v4 — "Verde bosco" (approvato — luglio 2026)

Fonte di verita' visiva: il mockup del proprietario
`esempio_vestiflow_arrivo_merce_v6   -  Claude dopo file di GPT.html` (root del
repo). Dove questa sezione diverge dalle precedenti, vince questa.

- **Accento**: verde bosco `#1f6f5f` (hover `#18584c`, piu' scuro — non piu'
  chiaro) al posto dell'indigo; su dark diventa menta `#4eb59c` con testo scuro.
- **Palette light**: bg `#f4f6f7`, superfici bianche, bordi/grigi verde-tinted
  (`#dde4e1`/`#c8d2ce`), testo `#18211e`/`#52605b`/`#7f8b87`; stati con tinte
  "soft" piene (successo `#eaf7f0`, warning `#fff5e5`, danger `#fff1ef`).
- **Sidebar SCURA (`#13211e`) in entrambi i temi** — pattern del riferimento.
  Nuovi token dedicati `--color-nav-fg|fg-hover|section|border|badge-bg|accent`;
  voce attiva: tinta `rgb(78 181 156/.14)` + indicatore inset `#4eb59c`.
- **Brand mark**: tile con gradiente `--brand-gradient`
  (`135deg, #55bca3 → #1f6f5f`) e "V" bianca, in sidebar e pagine auth.
- **Tabelle "da foglio di lavoro"**: separatori verticali di colonna
  (`--color-table-col-divider`), header 11/700 normal-case (niente uppercase)
  su banda `#f0f4f2` con bordo forte sotto, righe compatte (padding-block 8px).
- **Topbar**: superficie traslucida (94% surface) con `backdrop-filter: blur`.
- **Ombre**: morbide stratificate (`0 1px 2px` + `0 10px 30px`).
- Dark: variante verde-tinted completa (superfici `#0d1412`–`#1a2521`).

### Pattern di dettaglio pagina (v4)

- **Back link**: ogni `X__back` e' un chip bordato su surface (regola globale in
  `styles.scss`, selettore `[class$='__back']`); nelle testate operative
  compatte diventa quadrato icon-only accanto al titolo (`__head-row`:
  freccia + h1 20px + badge stato + riferimento sulla stessa riga).
- **Testata documento a celle unite**: la griglia campi e' un'unica card con
  bordi interni tra le celle; label 11/600 sottile sopra, input NUDO dentro
  (niente bordo proprio, i select/date perdono il chrome via token cascata);
  `:focus-within` = cella tinta `--color-primary-subtle` + linea accento 2px
  sul bordo inferiore. Ultima colonna della riga senza bordo destro.
- **Celle tabella editabili "nude"**: bordo trasparente a riposo, bordo
  `--color-border` + surface al hover, focus = bordo accento + anello 2px.
  Valori calcolati/readonly in `--color-text-muted`.
- **Tabelle liste = card** (mixin `data-table-desktop`): `border-collapse:
separate` + spacing 0, bordo `--color-border`, raggio `--radius-lg` sugli
  angoli (via prime/ultime celle), surface come sfondo. Colonne numeriche:
  destra + tabular-nums + nowrap. Celle testuali lunghe: ellipsis oltre
  `--table-cell-max` (24ch) con `title` per il testo completo; codici in
  `--font-mono`. **Niente `table-layout: fixed` con colonne dinamiche**
  (column picker): layout auto + vincoli per cella — fixed solo dove esistono
  davvero le classi `__col--*` nel template. Sticky header su
  `--color-table-header-bg` (mai surface). Su mobile la veste card della
  tabella si azzera: le card sono le righe.
- **Barra azioni**: sticky flottante staccata dal fondo (`inset-block-end`
  8px), surface 95% + `backdrop-filter: blur`, bordo + `--radius-lg` +
  `--shadow-md`.
- Rimandati (in attesa che l'altra sessione liberi i template dell'arrivo
  merce): scansione inline nella riga strumenti righe, lista mobile a
  fisarmonica, dock mobile fisso, selettore azienda in topbar.

## Restyle v5 — "Antracite" dal logo (approvato — luglio 2026)

Il logo VestiFlow e' monocromo (tile `#181818` + monogramma bianco): i colori
del tema derivano da li'. Sostituisce l'accento "Verde bosco" del v4; il resto
delle regole v4 (celle unite, tabelle card, larghezze campi, pattern operativi)
resta invariato.

- **Accento = antracite**: light `#1c1c1e` (hover `#333338`) per CTA, focus,
  link, selezioni; dark = mono invertito, bottoni quasi bianchi `#ececef` con
  testo scuro.
- **Superfici light**: neutre pure (bg `#f4f4f5`, bordi `#e4e4e7`), niente
  tinte verdi.
- **Dark "grafite morbida"**: bg `#232529`, superfici `#2b2d33`–`#33353c` —
  scuro riposante, MAI nero pece; ombre con alpha contenute.
- **Sidebar antracite** (`#16161a` light / `#1e2025` dark) come il tile del
  logo; voce attiva bianca su tinta `rgb(255 255 255/.1)`.
- **Colori semantici invariati**: successo/scorte verdi, warning ambra, errori
  rossi, info blu — sono funzionali, non brand. Il verde `--color-brand` resta
  riservato a Shopify/sync.
- Logo reale (`icon-topbar.png`) nel brand di sidebar e pagine auth; invertito
  dove il fondo e' scuro.

## Come dirlo a Claude Code

1. Copia questo file nel repo come `docs/RESTYLE-SPEC.md` (o nella root).
2. Aggiungi in `CLAUDE.md` del repo una riga: `Il restyle UI segue docs/RESTYLE-SPEC.md — ogni modifica visiva deve rispettarlo.`
3. Prompt suggerito per la prima sessione:

> Leggi docs/RESTYLE-SPEC.md. Implementa il restyle "Tech Moderno" dell'intera app in questo ordine, con un commit per fase:
>
> 1. Riscrivi src/styles/\_design-tokens.scss: il blocco :root diventa il tema DARK della spec, il light diventa [data-theme='light']; inverti la logica del theme toggle di conseguenza. Aggiungi JetBrains Mono via fontsource per --font-mono.
> 2. Aggiorna i componenti condivisi (button, badge, select, pagination, dialog, toast, skeleton) ai pattern della spec.
> 3. Aggiorna la shell: sidebar (voce attiva con indicatore accento, logo in testa, badge contatori), topbar (ricerca ⌘K placeholder, chip sync Shopify, avatar).
> 4. Applica i pattern tabella a tutte le liste e i pattern form ai form documentali (footer sticky, riga attiva, totali).
> 5. Dashboard: KPI card, segmented period, palette chart.js da spec.
> 6. Verifica i criteri di accettazione della spec (niente colori hardcoded, AA, e2e verdi, print in light).
>    Non cambiare flussi, rotte o comportamento: è un re-skin sistematico.

4. Fasi successive: chiedi una pagina alla volta ("adegua la pagina X alla spec") se qualcosa resta indietro — la spec è la fonte di verità.
