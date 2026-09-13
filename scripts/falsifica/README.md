# Falsificazione delle prove

⭐ **Una prova verde dimostra che il codice passa, non che la prova guardi.** La
falsificazione rovescia la domanda: si guasta il codice di proposito e si pretende
che la prova diventi **rossa**. Se resta verde, quella prova non stava misurando
ciò che dichiara.

⛔ **Non è dentro `npm run lint` e non gira in CI**, ed è deliberato: ogni
falsificazione modifica un sorgente, lancia le prove di integrazione contro il
database di prova e ripristina. Si esegue a mano, quando si chiude un blocco.

## Come si esegue

Dalla radice del repository:

```bash
node scripts/falsifica/regole-per-campo.mjs       # §31.25 — prove UNITARIE, nessun database
node scripts/falsifica/partenza-controllata.mjs   # §31.20 — integrazione
node scripts/falsifica/giro-a-blocchi.mjs         # §31.23 — integrazione
```

⚠️ **Qui era elencato `secondo-utilizzo.mjs`, che non esiste più**: l’ha sostituito
`giro-a-blocchi.mjs` quando Allinea è diventato un gesto solo, e questa riga mandava a un
copione assente. `giro-a-blocchi.mjs` non era elencato affatto.

I copioni di **integrazione** vogliono il database di prova **sacrificabile**, mai il
condiviso:

```bash
npm run db:test:up --prefix api          # solo la prima volta
npm run prisma:deploy:test --prefix api  # migration sul DB di prova
```

⭐ **Quelli UNITARI non vogliono niente**: passano `config: null`, che toglie `--config`
dal comando e li fa girare sulla configurazione predefinita di vitest.

⛔ **Prima che `config` esistesse, la suite era cablata sull’integrazione**: falsificare
codice provato da prove unitarie rispondeva `NESSUNA PROVA` — lo strumento cieco, non il
codice sano. Misurato l’11/09/2026.

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

⛔ **E può mentire, se l’ancora è scritta male.** Nel repository convivono CRLF e LF: fino
all’11/09/2026 lo strumento confrontava con `\n`, quindi un’ancora di **più righe** su un
file CRLF dava `ANCORA ASSENTE` su codice che c’era eccome — cioè dichiarava **non
verificata** una prova sana. Due guasti su sei, la prima volta che è successo.

⚠️ Ora l’ancora si adatta alle fine riga del file. Resta però la lezione: `ANCORA ASSENTE`
non distingue «quel codice non c’è più» da «non so scriverlo», e va guardato, non contato.

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
