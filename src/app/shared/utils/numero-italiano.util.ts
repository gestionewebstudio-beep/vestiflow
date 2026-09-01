/**
 * ⭐ **UN NUMERO SCRITTO ALL'ITALIANA, LETTO COME NUMERO** — e `null` se non lo è.
 *
 * Serve dove si ha in mano il **testo già formattato** di una cella e non il
 * valore grezzo: l'elenco dei valori di un filtro di colonna, e l'ordinamento di
 * una colonna il cui estrattore non c'è.
 *
 * ⛔ **Senza, l'ordine è alfabetico e quasi casuale**, ed è quello che il
 * proprietario ha visto il 01/09/2026 nel filtro della colonna Totale:
 *
 * ```text
 * 0,00 €  ·  10,98 €  ·  3,66 €  ·  35,14 €  ·  39,66 €  ·  4,88 €  ·  732,00 €
 * ```
 *
 * «10» prima di «3» perché il confronto parte dal primo carattere, e i 732 in
 * mezzo ai 43.
 *
 * ## Le tre cose che deve sapere, e nessuna è ovvia
 *
 * ⚠️ **Il punto separa le MIGLIAIA, la virgola i decimali.** `parseFloat` legge
 * `1.234,56` come `1.234`, cioè mille volte meno: non sbaglia l'ordine di una
 * riga, sbaglia l'ordine di grandezza.
 *
 * ⚠️ **Il SEGNO conta** — chiesto esplicitamente: «considerare anche il segno
 * negativo nell'ordinamento dei filtri e anche nell'ordinamento delle colonne».
 * −25,00 sta **prima** di 0,00, e ignorare il meno mette una nota di credito in
 * mezzo agli importi positivi.
 *
 * ⚠️ **Due segni di meno esistono**: quello da tastiera (`-`) e quello
 * tipografico (`−`, U+2212), che alcune formattazioni producono. Riconoscerne
 * uno solo lascerebbe metà dei negativi ordinati come positivi — e in una
 * colonna di resi sono la metà che conta.
 *
 * ⛔ **Non sostituisce `parseMoneyInput`**, che legge ciò che l'operatore
 * DIGITA e vive in `@core/utils/money.util`. Questa legge ciò che l'operatore
 * **vede**: il simbolo di valuta, il segno di percentuale e il meno tipografico
 * ci sono già, e quel lettore li rifiuta tutti e tre — su «6,33 €» torna `null`,
 * che in un ordinamento diventa «tutte le righe valgono uguale».
 */
export function numeroItaliano(valore: string): number | null {
  /*
    ⚠️ **Lo spazio che si toglie è QUALSIASI spazio**, non solo quello da
    tastiera: `Intl.NumberFormat('it-IT')` separa l'importo dal simbolo con uno
    spazio unificatore (U+00A0), e in `1 234,56` mette il puntino di migliaia —
    ma in altre forme resta uno spazio stretto. `\s` li copre tutti.

    ⛔ **Qui c'era un `.trim()` in coda, e non poteva togliere niente**: dopo
    `replace(/\s/g, '')` non è rimasto uno spazio da nessuna parte, tantomeno agli
    estremi. Verificato per esaurimento su tutto il BMP (0x0000–0xFFFF): non
    esiste un carattere su cui `trim()` e `\s` diano risposte diverse.
  */
  const pulito = valore
    .replace(/[€%]/g, '')
    .replace(/[−–—]/g, '-')
    .replace(/\s/g, '');

  if (pulito === '' || !/^-?(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/.test(pulito)) {
    return null;
  }

  const numero = Number(pulito.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(numero) ? numero : null;
}

/**
 * Tutti i valori sono numeri? Allora l'elenco si ordina come numeri.
 *
 * ⚠️ **Tutti, non la maggioranza**: con un solo valore non numerico il confronto
 * dovrebbe decidere dove metterlo, e qualunque scelta faccia mescola le due
 * grammatiche. Meglio l'ordine alfabetico, che almeno è prevedibile.
 */
export function sonoTuttiNumeri(valori: readonly string[]): boolean {
  return valori.length > 0 && valori.every((v) => numeroItaliano(v) !== null);
}
