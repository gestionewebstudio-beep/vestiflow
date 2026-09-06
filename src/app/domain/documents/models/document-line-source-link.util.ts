import type { AbstractControl } from '@angular/forms';

/**
 * Il legame fra una riga documento e la riga da cui DERIVA — duplicazione.
 *
 * ⭐ **Due regole sole, e sono le uniche che portano una decisione.** Il resto
 * di ciò che serve al riferimento — dichiarare il controllo nel form, metterlo
 * nel payload — è contratto della singola maschera, non regola condivisa: si
 * scrive dove il form è definito.
 *
 * ⛔ **Erano scritte tre volte**, una per maschera, e in due forme già diverse
 * (`riga.controls.x` da una parte, `riga.get('x')` dall'altra) — nella stessa
 * ora in cui sono state introdotte. È il modo in cui una regola comincia a
 * divergere: non con un errore, ma con due grafie che nessuno confronta.
 *
 * Il contratto di cosa il server fa col riferimento sta in `docs/24` §5.2-bis e
 * in `regole-gestionale` («Le righe nuove sono DUE cose diverse»).
 */

/** I due controlli che le regole toccano. Nient'altro serve. */
const CAMPO_ID = 'id';
const CAMPO_SORGENTE = 'sourceDocumentLineId';

/**
 * Trasforma le righe caricate da un documento in righe di un DUPLICATO.
 *
 * ⭐ **Sono due cose in un gesto solo, e nessuna è facoltativa:**
 *
 * - l'id dell'originale diventa il **riferimento alla sorgente**, o il server
 *   rifotograferebbe l'anagrafica di oggi e il duplicato di un documento di
 *   marzo direbbe il codice di settembre;
 * - la riga nuova **non porta un id proprio**, o il salvataggio aggiornerebbe
 *   il documento ORIGINALE invece di crearne un altro.
 *
 * ⚠️ L'id si azzera con la **stringa vuota**, e va bene per tutte le maschere:
 * i controlli nullabili la accettano, quelli di testo non accetterebbero
 * `null`, e il payload manda `id || undefined` — le due forme gli dicono la
 * stessa cosa.
 *
 * ⛔ Qui c'era un'euristica sul tipo (`typeof id.value === 'string'`), e
 * guardava il VALORE corrente invece del controllo: un campo nullabile che
 * conteneva una stringa sembrava di testo, e prendeva la forma sbagliata.
 * Distinguere il tipo di un `AbstractControl` a runtime non si può, e non
 * serve.
 */
export function collegaRigheDuplicateAllaSorgente(righe: readonly AbstractControl[]): void {
  for (const riga of righe) {
    const id = riga.get(CAMPO_ID);
    const sorgente = riga.get(CAMPO_SORGENTE);
    if (!id || !sorgente) {
      continue;
    }
    // ⚠️ `AbstractControl.value` è `any`: si restringe subito a ciò che il
    //    riferimento può essere — un id, o niente. Una riga vuota (id `''` o
    //    assente) non deriva da nulla, e non deve acquisire un riferimento
    //    vuoto: il server andrebbe a cercare una riga che non esiste.
    const valore: unknown = id.value;
    const idOriginale = typeof valore === 'string' && valore !== '' ? valore : null;
    sorgente.setValue(idOriginale);
    id.setValue('');
  }
}

/**
 * Scollega una riga dalla propria sorgente.
 *
 * ⛔ **Va chiamata quando l'articolo o la variante CAMBIANO.** Tenere il
 * riferimento farebbe copiare al server l'identità del prodotto di prima sopra
 * quello appena scelto — un difetto peggiore di quello che il riferimento
 * chiude, perché la riga direbbe il nome di un altro articolo.
 *
 * ⚠️ Il server ha comunque la propria rete (confronta la variante della
 * sorgente con quella della riga), ma la disciplina sta anche qui: una rete che
 * si dà per scontata è una rete che prima o poi non si controlla più.
 */
export function scollegaRigaDallaSorgente(riga: AbstractControl): void {
  riga.get(CAMPO_SORGENTE)?.setValue(null);
}
