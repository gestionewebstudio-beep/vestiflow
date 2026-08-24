# Specifica comune — testate documento

> **Cos'è.** Il contratto della **testata** di un documento: che forma ha, chi la
> disegna, che cosa resta della maschera. Vale per tutte le maschere con una testata
> documentale, oggi otto.
>
> **Perché esiste.** `CORE-FORM-DOCUMENTO` cita la regola di progetto — _«Form
> documentali: testata a celle unite, riga editabile, riepilogo totali, barra azioni —
> un componente per pattern, riusato da ogni tipo documento»_ (`regole-architettura`,
> «Catalogo dei pattern che DEVONO essere componenti») — e ne fa il piano di lavoro. Per
> la **riga** è stato fatto; per la **testata** no, e la misura sotto dice quanto è
> costato.
>
> **Il metodo è quello del core**, e non cambia: caratterizzare col test, estrarre una
> fetta, verificare che i test restino verdi.
>
> **Rapporto con le altre specifiche.** `03` governa le **righe**, questo documento la
> **testata**. Dove una decisione riguarda entrambe — la vista sola viva, gli
> identificativi univoci — vale la stessa, e questo documento la richiama invece di
> riscriverla.
>
> Prima stesura: **24/08/2026**.

---

## 0. La decisione, in una riga

> **La testata di un documento si dichiara UNA VOLTA. Le due vesti — griglia su
> scrivania, pannello apribile su schermo compatto — le sceglie il componente comune,
> non la maschera.**

---

## 1. Il difetto che questa specifica chiude

⛔ **Ogni maschera scriveva i propri campi due volte**: una nella griglia desktop e una
nel pannello mobile.

Misurato il **24/08/2026** su otto maschere:

```text
template delle maschere documento     7.240 righe
di cui TESTATA                        2.152 righe   → il 30%
di cui seconda copia della prima      ~1.076 righe  → metà della testata
```

Sul **Trasferimento**, la più piccola: **74 righe** nel pannello mobile contro **78**
nella griglia desktop. Stessi quattro campi, stesse opzioni, stessi gestori. Cambiavano:

| Cosa                  | Mobile              | Desktop               |
| --------------------- | ------------------- | --------------------- |
| identificativo        | `tr-m-origin-error` | `tr-origin-error`     |
| `aria-label`          | «Location origine»  | «Location di origine» |
| classe del campo      | `doc-panel__field`  | `doc-form__field`     |
| classe dell'etichetta | `doc-panel__label`  | `doc-form__label`     |

⚠️ **Non erano due viste: era la stessa vista scritta due volte**, dentro lo stesso
file. E ogni correzione ne raggiungeva una sola.

⭐ **Il test lo sorvegliava invece di segnalarlo.** Lo spec del Trasferimento asseriva
`toHaveLength(2)` sull'avviso di numero proposto, col commento «Due copie: testata
desktop e pannello mobile convivono nel DOM». La doppia scrittura era diventata un
requisito.

---

## 2. I pezzi

| Componente                      | Che cosa fa                                                             |
| ------------------------------- | ----------------------------------------------------------------------- |
| `app-document-header`           | la FORMA: griglia o pannello apribile, e il riepilogo a pannello chiuso |
| `app-document-header-field`     | UN campo: etichetta, controllo proiettato, messaggio d'errore           |
| `app-document-mobile-panel`     | il pannello apribile, già condiviso                                     |
| `app-document-number-field`     | numero + serie, già condiviso                                           |
| `app-document-counterparty-ref` | il documento della controparte, già condiviso                           |

### 2.1 Come proietta una volta sola in due posti

`<ng-content>` si riempie **una volta**: due `<ng-content>` nei due rami di un `@if`
lascerebbero il secondo vuoto. I campi entrano quindi in un `<ng-template>`, e i due
rami ne montano un'istanza ciascuno.

⚠️ **Le due vesti restano ESCLUSIVE**, non nascoste col foglio di stile. È la regola
della «vista sola viva» di `03` §4.11, e sulla testata vale doppio: con due viste vive
gli identificativi dei campi non sono univoci, e ogni pannello condiviso può aprirsi in
quella che non si vede.

### 2.2 Che cosa resta della maschera

⛔ **Quali campi ci sono.** Che l'Arrivo merce abbia il fornitore e l'Ordine cliente il
cliente **non è una copia**: è un campo diverso, e la maschera lo dichiara. Restano suoi
anche le opzioni, i gestori, le validazioni e il testo dell'etichetta.

Qui sta la **forma**: la griglia, il pannello, il riepilogo chiuso, le classi, il
messaggio d'errore.

---

## 3. Le regole

### 3.1 Un campo, un identificativo

⛔ **Vietati gli identificativi doppi per lo stesso campo.** Non esistono più `tr-*` e
`tr-m-*`: il campo è uno e il suo identificativo è uno. Chi scrive `describedBy` cita
quello.

### 3.2 Un campo, un'etichetta

⛔ **Vietate due `aria-label` per lo stesso campo.** «Location origine» e «Location di
origine» erano lo stesso controllo con due nomi, e un lettore di schermo lo annunciava
diversamente a seconda della larghezza della finestra.

### 3.3 Il campo in attesa non è un errore

Un campo **obbligatorio, ancora vuoto, che tiene ferme le righe** si segna con
`[waiting]`, che porta `--color-field-waiting`. **Non** con il rosso dell'errore:
aprire un documento nuovo non è uno sbaglio dell'operatore (`regole-stile-ui` §5).

### 3.4 Il messaggio d'errore non ripete il segnaposto

Il default è **«Campo obbligatorio.»**. Un campo che dice «Seleziona un fornitore…» e
sotto «Seleziona un fornitore.» è la stessa frase due volte a quaranta pixel di
distanza — e il messaggio non si toglie del tutto, perché al rifiuto il segnaposto
cambia **solo tinta**, e chi non distingue i colori non vedrebbe accadere nulla.

---

## 4. Stato dell'adozione

| Maschera               | Testata comune | Righe prima → dopo |
| ---------------------- | -------------- | ------------------ |
| Trasferimento          | ✅             | 162 → 81           |
| Rettifica / Inventario | ✅             | 164 → 99           |
| Arrivo merce           | ✅ (2 fasce)   | 414 → 285          |
| Ordine fornitore       | ✅             | 320 → 212          |
| Documenti vendita      | ✅ (2 fasce)   | 445 → 285          |
| Vendita al banco       | ✅             | 150 → 91           |
| Registrazione fattura  | ✅             | 218 → 177          |
| **Ordine cliente**     | ⏳ **ultima**  | 598 → —            |

**Totale, sette su otto: 1.711 → 1.149 righe (−33%).**

⚠️ **L'Ordine cliente non e' rimasto indietro per caso**: serve quattro tipi
documento ed e' la piu' grande. Ma e' anche quella da cui dipende un difetto
funzionale aperto — il campo **«Listino» esiste solo nella vista mobile**, quindi
da scrivania non si puo' scegliere il listino su un ordine, un preventivo o un
DDT. La migrazione lo porta su entrambe le viste.

⚠️ **Manca una NONA maschera**: il Movimento di magazzino
(`features/inventory/movement-form`) ha la stessa anatomia e la stessa doppia
scrittura, camuffata con `ariaLabel="Location (testata mobile)"` invece di un
identificativo gemello — quindi il controllo automatico non la vede. Non e' mai
entrata nel perimetro.

---

## 5. ⏸ Decisioni aperte — NON colmarle per verosimiglianza

Due punti che il proprietario ha dichiarato **non decisi** il 24/08/2026, e che
riguardano l'Ordine cliente, cioè il riferimento. Finché non sono decisi, la testata
comune li rende **come sono oggi**: non è un'approvazione, è il non aver deciso al posto
suo.

### 5.1 Dove vanno numerazione e serie su mobile

Oggi `app-document-number-field` sta in fondo al pannello, dopo la data. Non è stato
deciso se sia il suo posto.

### 5.2 Il selettore delle giacenze

Sull'Ordine cliente **impegna** le giacenze; su altri documenti lo stesso posto
**scarica** o **carica**. Sono tre effetti fisici distinti — e infatti sono due colonne
distinte nel catalogo (`commitsStock`, `loadsStock`) con etichette dal documento — ma
**dove il comando vada in testata, e se debba starci**, non è stato deciso.

⛔ **Non sono la stessa domanda**, e confonderle è l'errore da evitare: la prima è di
collocazione, la seconda è di che cosa il comando fa.

---

## 6. Come si rigenera la misura

```bash
# righe di testata per maschera
grep -c '' src/app/features/**/[a-z-]*form.component.html

# chi ha ancora due scritture: cerca gli identificativi gemelli
grep -rnE '"[a-z]{2}-m-[a-z-]+"' src/app/features --include=*.html
```

Il secondo comando è la prova che conta: **un identificativo con `-m-` è una testata
ancora scritta due volte**.
