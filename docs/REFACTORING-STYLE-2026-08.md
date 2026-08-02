# Allineamento dell'architettura di stile — agosto 2026

Branch `refactor/design-system`. Il punto di partenza: l'Ordine cliente sembrava
un'altra applicazione rispetto al resto del gestionale, e il proprietario ha
chiarito che era il contrario di quel che sembrava — non una pagina fuori
standard, ma **il prototipo su cui aveva scelto l'identità visiva**. Il resto
dell'app doveva convergere verso di lui, non lui verso il resto.

---

## Cosa c'era davvero

L'indagine ha trovato tre cause, tutte a monte del sintomo.

### 1. Il livello globale descriveva una palette, il codice ne implementava un'altra

`regole-stile-ui.md` documentava già la palette dell'Ordine cliente come fonte di
verità. In `_design-tokens.scss` **3 token su 33 corrispondevano**. Ogni schermata
prendeva quindi i valori sbagliati, e l'unica pagina giusta doveva riscriverseli
in casa: erano le ~40 variabili `--co-*`, un secondo sistema di design dentro una
pagina.

### 2. `--btn-min-height: 44px` era il valore mobile applicato ovunque

44px è il minimo tappabile su mobile. Era il default su desktop, in 45 fogli di
stile. Da lì l'impressione di «tutto troppo largo», e da lì i 65 `::ng-deep`
dell'Ordine cliente: per stare nel proprio mockup doveva rimpicciolire a mano i
componenti condivisi, uno per uno.

### 3. La maschera documento era scritta tre volte

Sei schermate — arrivo merce, DDT e fatture di vendita, operazioni di magazzino,
trasferimenti, ordine fornitore, ordine cliente — sono la stessa maschera con
contenuti diversi. Il markup lo diceva già: tutte aprivano con la stessa
struttura e usavano gli stessi elementi BEM.

`goods-receipt-form.component.scss` era di fatto il foglio condiviso: **cinque
componenti lo referenziavano in `styleUrls`**, e Angular lo compilava una volta
per ciascuno — cinque copie della stessa CSS nel bundle, sotto il nome di una
sola delle sei maschere. L'ordine fornitore aveva la terza copia, con un blocco
proprio (`po-form`) e un ritmo più largo.

---

## Cosa è cambiato

### I token globali sono il design scelto

Da 3/33 corretti a 31/33. Le decisioni dell'Ordine cliente — palette slate/teal,
altezze dei controlli, bande di gruppo dell'intestazione tabella, tinte della
vista card mobile — sono ora token globali con gli **stessi valori**: la pagina
di riferimento non cambia di un pixel, il resto dell'app può finalmente
attingerci. Il tema scuro è stato riderivato nella stessa famiglia cromatica.

Le altezze dei controlli hanno un token per ruolo (`--control-h-field`,
`--control-h-button`, `--control-h-cell`, `--control-h-touch`) e il salto a 44px
su mobile avviene in **un punto solo**, non in 45 fogli.

### L'anatomia della maschera documento è un livello

`src/styles/_document-form.scss` (+ `_document-form-footer.scss`), **emesso una
volta**. Il blocco si chiama `doc-form`, non `gr-form`: il nome dichiara la
funzione, non la schermata dove è nato. Stessa cosa per le due celle di riga
condivise, ora `doc-code-cell` e `doc-product-cell`.

L'ordine fornitore è stato agganciato alla base confrontando le regole una per
una: 31 erano identiche, di altre 13 serviva solo una manciata di proprietà.
Da 519 righe a 227, tutte sull'ordine fornitore e nessun'altra maschera.

### I componenti condivisi si configurano, non si perforano

Un contenitore che vuole un bottone più basso dichiara `--button-h` su di sé. Il
componente resta padrone del proprio markup.

**`::ng-deep` in tutta l'app: 0.** Erano 65.

Fra quelli sciolti, quattro non potevano funzionare:
`.co-form ::ng-deep .cdk-drag-preview` compila in
`.co-form[_ngcontent-x] .cdk-drag-preview`, e la CDK appende l'anteprima al
`<body>`. Ora vive nel foglio globale, dove l'elemento sta davvero.

`select-menu` e `date-input` condividono il vocabolario `--field-*`: sono la
stessa superficie di campo, e chi ne configura una si aspetta che l'altra segua.

### `app-inline-banner`

Lo stesso messaggio in linea — errore di fetch, esito di un'azione, avviso — era
riscritto in una dozzina di schermate con nomi diversi (`__alert`, `__banner`,
`__action-feedback`) e le stesse sette dichiarazioni. Ora è un componente
condiviso, con il **ruolo ARIA derivato dal tono**: `error` e `warning`
interrompono la lettura, gli altri aspettano la pausa. Nove componenti migrati.

### Pulizia dimostrabile

39 dichiarazioni **irraggiungibili** rimosse dai fogli mobile dell'Ordine
cliente: stesso selettore, stesso contesto `@media`, stessa proprietà,
sovrascritte da un foglio successivo. Erano il costo di aver aggiunto un livello
«che vince sulla cascata» invece di smontare quello sotto.

---

### Il pannello Shopify diventa un componente

Impostazioni era una pagina da 1099 righe di TypeScript in cui il 64% era
l'integrazione Shopify — mentre TikTok, la stessa cosa fatta due mesi dopo, era
gia' un componente autonomo nella cartella accanto. Ora sono gemelli:
`shopify-integration-panel` si inietta i propri service e non riceve stato dalla
pagina.

Il nodo era che due parti della schermata guardano la stessa connessione: il
pannello la mostra e la modifica, la sezione Location la usa per decidere quali
sedi mostrare. Chiederla due volte al server le farebbe divergere. Sopra
entrambi c'e' ora `ShopifyConnectionStore` (`domain/channels/shopify/state/`),
unica fonte: un `reload()` dopo una sync aggiorna tutt'e due, e il cancello
`available` — Shopify nel profilo del tenant **e** permesso di gestirlo — sta
prima della rete, cosi' senza permesso l'API non viene nemmeno chiamata.

Restano due input dal padre, ed entrambi hanno una ragione: `locationSetupStatus`
e `mustChooseLocations` dipendono dal piano del tenant, che e' della pagina.

| File                      | Prima | Dopo |
| ------------------------- | ----- | ---- |
| `settings.component.ts`   | 1099  | 421  |
| `settings.component.html` | 646   | 193  |
| `settings.component.scss` | 569   | 207  |

### La forma dell'Ordine cliente sale alla base

63 regole desktop che l'Ordine cliente scriveva sul markup condiviso — scoped su
`.co-form` — sono passate in `_document-form.scss`: label in maiuscoletto (§3),
riga tabella a 30px e intestazione a 32px (§6), campi di testata a 29px (§4).
Erano gia' le regole di progetto; le rispettava una pagina sola.

Lo scope resta a due livelli (`.doc-form .doc-form__x`), non uno: e' la
specificita' che avevano prima, e cambiarla sposterebbe chi vince nella cascata.

La vista card mobile passa da `md` a `lg`, come dice §9 — a `md` un tablet in
verticale si prendeva una tabella documentale da nove colonne. Le misure della
reference mobile approvata diventano `--doc-m-*` sul blocco condiviso.

**Non e' salita la vista mobile dell'Ordine cliente.** E' agganciata al suo
markup (`.co-panel`, `.co-order-card`, `.co-dock`) e promuoverla spegnerebbe
pezzi di schermata nelle maschere che quel markup non hanno: `.doc-form__actions
{ display: none }` senza la barra che la sostituisce lascia un documento senza
Salva. Tocca a loro adottarlo, una alla volta.

## Stato finale

| Misura                                    | Prima | Dopo  |
| ----------------------------------------- | ----- | ----- |
| `::ng-deep` nell'app                      | 65    | 0     |
| Token globali conformi alle regole        | 3/33  | 31/33 |
| Copie della maschera documento nel CSS    | 5+1   | 1     |
| Fogli di stile oltre budget               | 6     | 0     |
| Variabili di palette private a una pagina | ~40   | 3     |
| `settings.component.ts`                   | 1099  | 421   |

Suite: 152 file / 804 test verdi (frontend), 148 file / 1064 verdi (API).
Lint: 0 errori. Build: OK.

---

## Cosa resta

### Fatto: la card di riga e' un componente

Era l'ultimo foglio sopra soglia, e la ragione per cui non l'avevo estratta era
che la card leggeva **37 valori** chiamando altrettanti metodi del form.
Passarglieli uno per uno avrebbe prodotto trenta `input()` — l'anti-pattern che
le regole vietano per nome.

La strada era quella indicata: prima un **view-model di riga**
(`CustomerOrderLineCardVm`), che raccoglie i ventitre' derivati in un oggetto e
si prende anche la formattazione (la card riceve stringhe pronte e non sa cosa
sia una `Money`). Con quello, il componente prende **tre input** — il FormGroup,
il view-model, lo stato aperto/chiuso — e una variante di testata.

Le due disposizioni della testata sono un `input<'order' | 'registry'>()`, non
due componenti gemelli: il corpo espanso e' identico, cambia solo cio' che si
vede a card chiusa. Erano un `@if (isOrder)` in mezzo al template del form.

Il template del form scende da 3012 a 2582 righe; le 460 della card vivono ora
nel proprio componente, accanto ai propri stili. E la forma esterna della card
(bordi, raggio, padding, ombra) si configura dal contenitore con
`--co-card-*`: la sezione «niente card dentro card» del foglio ritmo non
raggiunge piu' gli interni della card, le dice che forma avere.

Resta separata dal gemello dell'arrivo merce, e va bene cosi': le due righe
portano campi diversi — costo e prezzo di vendita da una parte, sconto, IVA e
impegno di magazzino dall'altra — e fonderle richiederebbe la dozzina di flag
che le regole chiamano «sintomo che si stanno fondendo due componenti diversi».
Condividono i token e i componenti condivisi, non un antenato.

**Nessun foglio di stile e' piu' sopra il budget.**

### Da verificare a occhio

Il cambio piu' visibile e' che **la sidebar passa da chiara a verde-scura**
(`--color-nav-bg: #15211f`), come le regole descrivevano da sempre. E' voluto.

Vanno guardate le sei maschere documento: ora condividono la forma decisa
sull'Ordine cliente (label in maiuscoletto, righe piu' basse, testata piu'
densa) e passano alla vista card gia' sotto 1024px invece che sotto 768px.
L'ordine fornitore, che aveva un ritmo tutto suo piu' largo, e' quello che
cambia di piu'.

E la schermata Impostazioni: il pannello Shopify e' lo stesso, ma ora e' un
componente — l'esito «Sedi attive aggiornate» compare accanto alla tabella
Location invece che dentro il pannello Shopify, dove non c'entrava.
