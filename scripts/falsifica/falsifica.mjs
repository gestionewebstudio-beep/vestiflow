/**
 * STRUMENTO DI FALSIFICAZIONE — e fallisce da sé quando non esegue niente.
 *
 * ⭐ **Una prova verde dimostra che il codice passa, non che la prova guardi.**
 *    La falsificazione rovescia la domanda: si guasta il codice di proposito e
 *    si pretende che la prova diventi ROSSA. Se resta verde, quella prova non
 *    stava misurando ciò che dichiara.
 *
 * ⛔ **Due volte, in questo progetto, una falsificazione è risultata VERDE
 *    perché il filtro `-t` non agganciava nessuna prova** — una maiuscola la
 *    prima volta, un accento la seconda. Zero prove eseguite e, nell'esito,
 *    indistinguibile da una prova che passa.
 *
 * ⭐ **Qui il conteggio si legge e si controlla**: se le prove eseguite sono
 *    zero, l'esito è `NESSUNA PROVA` — un guasto dello strumento, non un verde.
 *    E ogni copione comincia con un'AUTOPROVA che lo verifica.
 *
 * ⚠️ **Il file guastato viene sempre ripristinato**, anche se l'esecuzione va in
 *    errore o scade: il ripristino sta in un `finally`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** La radice del repository, dedotta dalla posizione di questo file. */
export const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const API = path.join(RADICE, 'api');

/** Un percorso dentro `api/`, scritto relativo alla radice del repository. */
export const dentroApi = (relativo) => path.join(API, relativo);

/** Quante prove ha eseguito davvero, leggendo la riga di riepilogo di vitest. */
export function proveEseguite(uscita) {
  // «Tests  3 failed | 8 passed | 41 skipped (52)» — contano failed e passed.
  const riga = /Tests\s+([^\n]*)/.exec(uscita)?.[1] ?? '';
  const falliti = Number(/(\d+)\s+failed/.exec(riga)?.[1] ?? 0);
  const passati = Number(/(\d+)\s+passed/.exec(riga)?.[1] ?? 0);
  return { falliti, passati, totale: falliti + passati };
}

/**
 * Applica un guasto, esegue le prove filtrate, ripristina il file.
 *
 * @returns 'ROSSO' (la prova vede il difetto), 'VERDE' (non lo vede),
 *          'NESSUNA PROVA' (il filtro non ha agganciato niente: strumento cieco),
 *          'ANCORA ASSENTE' (il testo da guastare non c'è più: il guasto va
 *          riscritto, o si sta falsificando codice che non esiste),
 *          'BLOCCATO' (l'esecuzione è scaduta).
 */
export function falsifica({ file, da, a, filtro, prova }) {
  const grezzo = fs.readFileSync(file, 'utf8');
  if (!grezzo.includes(da)) {
    return 'ANCORA ASSENTE';
  }
  fs.writeFileSync(file, grezzo.replace(da, a));
  let uscita = '';
  let sollevato = false;
  try {
    uscita = execSync(
      `npx vitest run --config vitest.integration.config.ts ${prova} -t "${filtro}"`,
      { cwd: API, encoding: 'utf8', stdio: 'pipe', timeout: 900000 },
    );
  } catch (e) {
    sollevato = true;
    uscita = String(e?.stdout ?? '') + String(e?.stderr ?? '');
    if (/timed out|ETIMEDOUT/i.test(String(e?.message))) {
      fs.writeFileSync(file, grezzo);
      return 'BLOCCATO';
    }
  } finally {
    fs.writeFileSync(file, grezzo);
  }

  const { totale } = proveEseguite(uscita);
  // ⛔ La domanda viene PRIMA di «verde o rosso»: ha eseguito qualcosa?
  if (totale === 0) {
    return 'NESSUNA PROVA';
  }
  return sollevato ? 'ROSSO' : 'VERDE';
}

/**
 * L'AUTOPROVA: un filtro che non aggancia niente deve dare `NESSUNA PROVA`.
 *
 * ⚠️ **Si esegue per PRIMA, sempre.** Una guardia che non si verifica è una
 *    guardia di cui non si sa niente — ed è proprio il modo in cui questa è
 *    stata cieca due volte.
 */
export function autoprova({ file, ancora, prova }) {
  const esito = falsifica({
    file,
    da: ancora,
    a: ancora, // nessun guasto: si misura solo lo strumento
    filtro: 'un titolo che non esiste da nessuna parte',
    prova,
  });
  const ok = esito === 'NESSUNA PROVA';
  console.log(
    `[autoprova] filtro che non aggancia nulla -> ${esito}` +
      (ok ? '  OK lo strumento se ne accorge' : '  NO non se ne accorge'),
  );
  console.log('');
  return ok;
}

/** Esegue un elenco di guasti e riassume. Ritorna true se tutti sono visti. */
export function falsificaTutti(guasti, prova) {
  let tutti = true;
  for (const g of guasti) {
    const esito = falsifica({ ...g, prova });
    const ok = esito === 'ROSSO';
    if (!ok) tutti = false;
    const segno =
      esito === 'ROSSO'
        ? '[OK   ]'
        : esito === 'NESSUNA PROVA'
          ? '[CIECO]'
          : esito === 'ANCORA ASSENTE'
            ? '[SCADU]'
            : '[VERDE]';
    console.log(`${segno} ${g.nome.padEnd(58)} -> ${esito}`);
  }
  console.log(
    '\n' +
      (tutti
        ? 'Le prove vedono tutti i difetti.'
        : 'ATTENZIONE: qualcosa non e stato visto. [SCADU] = il guasto punta a codice che non esiste piu.'),
  );
  return tutti;
}
