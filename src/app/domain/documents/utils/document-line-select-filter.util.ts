import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

/**
 * Il filtro delle celle a **ricerca-e-selezione** di riga documento: prima le
 * voci il cui **codice** comincia con quanto si è digitato, poi tutte le altre
 * che contengono quel testo da qualche parte (specifica §4.3).
 *
 * **Perché non si riusa `filterSelectMenuOptions`.** Quello cerca la stringa
 * ovunque dentro etichetta *e* descrizione, senza ordine: digitando `1` nella
 * cella IVA pescava anche `22r — Imp. 22% acquisti rev. charge art. 17`, per
 * l'«1» di «art. 17». Rumore proprio nel caso a un carattere, che è quello più
 * usato — si digita una cifra e si guarda cosa compare in cima.
 *
 * La differenza non è la quantità di risultati: è **quale sta per primo**. Sulla
 * cella la voce in cima è quella evidenziata, cioè quella che Invio sceglie
 * senza guardare. Un ordinamento sbagliato lì non è rumore, è un valore
 * sbagliato scritto sulla riga.
 *
 * Le voci che non corrispondono affatto restano fuori: il resto **è il resto
 * delle corrispondenze**, non tutto l'elenco.
 *
 * ⚠️ Chi arriva qui cercando «il filtro delle tendine» ne trova due, ed è
 * voluto: `filterSelectMenuOptions` serve le liste dove si cerca per nome (le
 * varianti, i clienti), dove un codice non c'è e la precedenza non ha senso.
 */
export function filterLineSelectOptions(
  options: readonly SelectMenuOption[],
  query: string,
): readonly SelectMenuOption[] {
  const cercato = query.trim().toLocaleLowerCase('it-IT');
  if (!cercato) {
    return options;
  }

  const perPrefisso: SelectMenuOption[] = [];
  const resto: SelectMenuOption[] = [];

  for (const option of options) {
    const codice = option.label.toLocaleLowerCase('it-IT');
    if (codice.startsWith(cercato)) {
      perPrefisso.push(option);
      continue;
    }
    const dettaglio = (option.detail ?? '').toLocaleLowerCase('it-IT');
    if (codice.includes(cercato) || dettaglio.includes(cercato)) {
      resto.push(option);
    }
  }

  return [...perPrefisso, ...resto];
}
