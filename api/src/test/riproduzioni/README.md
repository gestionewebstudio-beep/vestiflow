# Riproduzioni di difetti APERTI

⛔ **Le prove che stanno qui sono ROSSE oggi, e devono esserlo.** Riproducono
difetti conosciuti e non ancora corretti: non stanno nella suite perché una
suite rossa smette di dire qualcosa: la si impara a ignorare, e il primo difetto
vero passa inosservato.

⚠️ **E non sono commentate né saltate.** Un `it.skip` è la stessa cosa di un
filtro che non aggancia niente: verde, e cieco. Qui il codice è **fuori** dai
file che vitest raccoglie, quindi non può risultare verde per sbaglio.

⭐ **Rientrano insieme al rimedio.** Chi chiude il difetto le innesta, le vede
diventare verdi, e le lascia dentro.

---

## Che cosa c'è

| File                                  | Contenuto                                           |
| ------------------------------------- | --------------------------------------------------- |
| `allinea-verifiche-aperte.blocco.txt` | tre prove — `I`, `I-bis`, `J` — più i loro attrezzi |
| `innesta.mjs`                         | le innesta nella suite e le ritira, con un comando  |

Il difetto che ognuna riproduce è argomentato in `docs/DA-FARE.md` **§31.22**.

### `I` · un ARRESTO fra «l'ho guardata» e il controllo

`last_attempt_at` si scrive **prima** del tentativo — ed è giusto, è ciò che fa
ruotare la coda anche quando il tentativo muore. Ma allora dice «l'ho guardata»,
non «l'ho controllata»: una coppia marcata e mai verificata risulta verificata.

La prova arresta il processo fra `segnaEsaminata` e `riallineaCoppia`, riparte
con un esecutore nuovo e lo stesso istante di operazione, e chiede che quella
coppia **non** risulti verificata.

### `I-bis` · la coda del ritentativo marca la stessa data

Gli scrittori di `last_attempt_at` sono **due**: l'allineamento e `retryPending`,
che gira in coda a ogni import giacenze. La coda scrive quella data senza fare il
controllo che fa Allinea.

⛔ È il caso peggiore: nella prova l'operazione **si dichiara conclusa** e il
canale porta ancora 1 invece di 5.

### `J` · una coppia ESCLUSA sparisce dal residuo

Un collegamento chiuso non scrive niente sulla riga di stato. Entrava nel residuo
solo perché l'elenco della passata l'aveva vista: alla passata dopo — che per
rotazione ne guarda altre — diventava indistinguibile da una coppia allineata.

---

## Come si eseguono

Serve il database di prova **sacrificabile**, non il condiviso:

```bash
npm run db:test:up --prefix api          # solo la prima volta
npm run prisma:deploy:test --prefix api  # applica le migration al DB di prova
```

Poi, dalla radice del repository:

```bash
node api/src/test/riproduzioni/innesta.mjs          # innesta le tre prove
npx vitest run --config api/vitest.integration.config.ts \
    api/src/test/integration/invio-composto.integration-spec.ts \
    -t "ARRESTO"                                    # oppure "coda del ritentativo" / "ESCLUSA"
node api/src/test/riproduzioni/innesta.mjs ripristina
```

⚠️ **`innesta.mjs` fa una copia di sicurezza** della spec prima di toccarla, e
`ripristina` la rimette esattamente com'era. Senza il ripristino la suite resta
rossa.

⚠️ **Il filtro `-t` è sensibile a maiuscole e accenti.** Se una falsificazione o
un'esecuzione filtrata risulta verde, la prima domanda è **quante prove ha
eseguito**: zero prove e una prova che passa hanno lo stesso colore.
