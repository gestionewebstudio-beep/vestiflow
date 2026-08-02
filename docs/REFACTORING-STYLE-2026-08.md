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

## Stato finale

| Misura                                    | Prima | Dopo  |
| ----------------------------------------- | ----- | ----- |
| `::ng-deep` nell'app                      | 65    | 0     |
| Token globali conformi alle regole        | 3/33  | 31/33 |
| Copie della maschera documento nel CSS    | 5+1   | 1     |
| Fogli di stile oltre budget               | 6     | 4     |
| Variabili di palette private a una pagina | ~40   | 3     |

Suite: 148 file / 782 test verdi (frontend), 148 file / 1064 verdi (API).
Lint: 0 errori. Build: OK.

---

## Cosa resta, e perché non l'ho fatto

### `settings.component.scss` — 13.54 kB (budget 12)

**Il 74% del foglio è il pannello Shopify**, che nella stessa cartella ha già il
proprio gemello fatto bene: `components/tiktok-integration-panel/`, componente
autonomo che si inietta i propri service. Il pannello Shopify invece vive dentro
la pagina: ~470 righe di template e ~700 di TypeScript su 1099.

Non l'ho estratto perché **non è un refactor di stile**. Lo stato è intrecciato
con la sezione Location della stessa pagina: `connection` alimenta
`showShopifyLocationColumn`, che decide le colonne della tabella location;
`locationSetupStatus` è letto sia dalla sezione location sia dallo stato di setup
del pannello Shopify. Estrarre bene richiede prima un
`ShopifyConnectionStore` in `domain/channels/shopify/` che entrambi leggano —
altrimenti la connessione viene caricata due volte e i due pezzi possono
divergere.

È un lavoro definito e sensato, ma è sulla pagina che gestisce l'OAuth verso
Shopify: va fatto potendolo provare, non alla cieca dentro un branch di stile.

### I tre fogli dell'Ordine cliente — 16.5 / 22.1 / 12.2 kB

Ridotti dove era dimostrabile. Il resto è il disegno della pagina, e i cinque
fogli ora **dichiarano ciascuno la propria responsabilità** in testa al file
(desktop · righe · card mobile · ritmo delle sezioni · reference approvata), con
l'indice completo nel primo.

Resta una duplicazione vera: la vista card mobile esiste due volte, come
`.doc-form__cards` nella base (la usa l'arrivo merce) e come `.co-order-card`
nell'Ordine cliente. Unificarle significa toccare il markup di entrambe le
maschere, ed è la prossima cosa da fare quando si potrà verificare a schermo.

### Da verificare a occhio

Il cambio più visibile è che **la sidebar passa da chiara a verde-scura**
(`--color-nav-bg: #15211f`), come le regole descrivevano da sempre. È voluto.
Vanno guardate anche le sei maschere documento: l'ordine fornitore ora ha il
ritmo denso delle altre invece del suo, più largo.
