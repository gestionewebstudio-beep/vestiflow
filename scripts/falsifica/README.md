# Falsificazione delle prove

⭐ **Una prova verde dimostra che il codice passa, non che la prova guardi.** La
falsificazione rovescia la domanda: si guasta il codice di proposito e si pretende
che la prova diventi **rossa**. Se resta verde, quella prova non stava misurando
ciò che dichiara.

⛔ **Non è dentro `npm run lint` e non gira in CI**, ed è deliberato: ogni
falsificazione modifica un sorgente, lancia le prove di integrazione contro il
database di prova e ripristina. Si esegue a mano, quando si chiude un blocco.

## Come si esegue

Serve il database di prova **sacrificabile**, mai il condiviso:

```bash
npm run db:test:up --prefix api          # solo la prima volta
npm run prisma:deploy:test --prefix api  # migration sul DB di prova
```

Poi, dalla radice del repository:

```bash
node scripts/falsifica/partenza-controllata.mjs   # docs/DA-FARE.md §31.20
node scripts/falsifica/secondo-utilizzo.mjs       # docs/DA-FARE.md §31.21
```

Esito atteso: **`[OK   ] … -> ROSSO` su ogni riga**, e l'autoprova che dice
`NESSUNA PROVA`. Uscita 0 solo se tutto è stato visto.

## ⛔ L'autoprova viene per prima, e non è una formalità

**Due volte, in questo progetto, una falsificazione è risultata VERDE perché il
filtro `-t` non agganciava nessuna prova** — una maiuscola la prima volta, un
accento la seconda. Zero prove eseguite e, nell'esito, indistinguibile da una
prova che passa.

⭐ Da allora lo strumento **legge il conteggio delle prove eseguite**: zero prove
danno `NESSUNA PROVA`, non un verde. E ogni copione comincia lanciando di
proposito un filtro che non esiste, per verificare di accorgersene. Una guardia
che non si verifica è una guardia di cui non si sa niente.

## Gli esiti

| Esito            | Significato                                                                       |
| ---------------- | --------------------------------------------------------------------------------- |
| `ROSSO`          | ⭐ la prova vede il difetto: è quello che si vuole                                |
| `VERDE`          | ⛔ la prova **non** misura ciò che dichiara                                       |
| `NESSUNA PROVA`  | ⛔ il filtro non ha agganciato niente: lo strumento è cieco, non il codice sano   |
| `ANCORA ASSENTE` | ⚠️ il testo da guastare non esiste più: il guasto va riscritto sul codice di oggi |
| `BLOCCATO`       | l'esecuzione è scaduta                                                            |

⚠️ **`ANCORA ASSENTE` non è un successo.** Significa che la falsificazione sta
puntando a codice che non c'è più: finché non si riscrive, quella prova **non è
verificata**. È già successo, rifattorizzando il residuo dell'allineamento.

⭐ **Il file guastato si ripristina sempre**, anche se l'esecuzione va in errore
o scade: il ripristino sta in un `finally`. Dopo una passata, `git diff` deve
essere vuoto — ed è la prima cosa da controllare se qualcosa va storto.

## Aggiungere una falsificazione

Un guasto è un `{ nome, file, da, a, filtro }`: `da` è il testo esatto da
sostituire, `a` il codice guastato, `filtro` un pezzo di titolo della prova che
deve arrossare.

⚠️ **Il filtro `-t` è sensibile a maiuscole e accenti**: si sceglie una porzione
di titolo semplice, senza lettere accentate. Se una riga dice `NESSUNA PROVA`, il
filtro è sbagliato — non il codice.
