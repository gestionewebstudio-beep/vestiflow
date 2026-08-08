import { signal } from '@angular/core';

/**
 * Da dove veniva il precompilato che non è arrivato. Cambia cosa l'operatore
 * rischia di creare se salva lo stesso, ed è quello che va detto.
 */
export type DocumentPrefillKind = 'convert' | 'include' | 'duplicate';

const MESSAGES: Record<DocumentPrefillKind, string> = {
  convert:
    'Non è stato possibile recuperare il documento di origine: la maschera è rimasta vuota. ' +
    'Torna indietro e riprova — salvando adesso creeresti un documento nuovo, non la conversione.',
  include:
    "Non è stato possibile recuperare l'ordine da concludere: la maschera è rimasta vuota. " +
    'Torna indietro e riprova — salvando adesso creeresti un documento che non conclude nessun ordine.',
  duplicate:
    'Non è stato possibile recuperare il documento da duplicare: la maschera è rimasta vuota. ' +
    'Torna indietro e riprova — salvando adesso creeresti un documento nuovo, non la copia.',
};

/**
 * Il precompilato che non è arrivato.
 *
 * Quando si preme «Genera documento», «Concludi ordine» o «Duplica», la maschera
 * di destinazione si apre e chiede al server il contenuto da precompilare. Se
 * quella chiamata falliva, l'errore veniva **ingoiato** (`error: () => undefined`)
 * e restava una maschera vuota — indistinguibile da un documento nuovo
 * legittimo. L'operatore crede di aver fatto una cosa che non è avvenuta, e se
 * salva crea il documento sbagliato.
 *
 * Il messaggio non dice «si è verificato un errore»: dice **cosa succede se
 * salvi lo stesso**, che è l'unica parte utile.
 *
 * Non è un service iniettabile: non ha dipendenze e ogni maschera ne vuole
 * un'istanza propria, quindi si costruisce come campo del componente
 * (`private readonly prefillError = new DocumentPrefillErrorStore()`) — stessa
 * forma di `DocumentNumberConflictStore`.
 */
export class DocumentPrefillErrorStore {
  private readonly _message = signal<string | null>(null);

  /** Messaggio da mostrare, o null se il precompilato è arrivato (o non serviva). */
  readonly message = this._message.asReadonly();

  fail(kind: DocumentPrefillKind): void {
    this._message.set(MESSAGES[kind]);
  }

  /**
   * L'operatore ha preso atto. Non «riprova»: la maschera è vuota e l'unica
   * strada sensata è tornare indietro, quindi qui si chiude e basta.
   */
  dismiss(): void {
    this._message.set(null);
  }
}
