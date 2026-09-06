import type { ButtonVariant } from '@shared/components/button/button.component';

/**
 * Contratto comune della **selezione negli elenchi** e delle azioni contestuali
 * che vi agiscono sopra (`14` parte D).
 *
 * ⛔ **Qui dentro non compare nessuna azione concreta.** Stampa, Esporta,
 * Elimina, Modifica e Anteprima sono cose che le PAGINE dichiarano: il giorno in
 * cui questo file o il componente che lo legge contengono un
 * `if (azione === 'stampa')`, la primitiva è morta — da lì in poi ogni elenco
 * nuovo la costringe a conoscere il proprio dominio, ed è di nuovo un
 * componente per pagina travestito da componente comune.
 */

/**
 * Se e come un elenco lascia selezionare le sue righe.
 *
 * ⚠️ È una scelta **per elenco**, non globale: una checkbox in una tabella che
 * non ha nessuna azione da offrire è una colonna sprecata e una promessa non
 * mantenuta.
 */
export type SelectionMode = 'none' | 'single' | 'multiple';

/**
 * ⭐ **Che cosa un'azione PRETENDE** per potersi eseguire.
 *
 * ⚠️ Ha sostituito `supports: 'single' | 'multiple' | 'any'`, e non è un
 * rinominare: **il campo ha cambiato mestiere**. Prima decideva se l'azione
 * COMPARIVA; da quando le azioni sono sempre visibili (`14` §5.1) decide se è
 * **abilitata**, e con quale motivo.
 *
 * | Valore         | 0 selezionati                          | 1 | 2+ |
 * | -------------- | -------------------------------------- | - | -- |
 * | `'none'`       | attiva, ambito `filtered`               | attiva | attiva |
 * | `'oneOrMore'`  | disabilitata, «Seleziona almeno un elemento» | attiva | attiva |
 * | `'one'`        | disabilitata, «Seleziona un elemento»    | attiva | disabilitata, «Seleziona un solo elemento» |
 *
 * ⛔ `'none'` non significa «non serve niente»: significa che l'azione **sa
 * lavorare sul risultato filtrato**. Stampare l'elenco filtrato ha senso;
 * eliminarlo no — ed è la differenza che questo campo esiste per esprimere.
 */
export type ListActionRequirement = 'none' | 'oneOrMore' | 'one';

/**
 * Aspetto del comando: **è la variante di `app-button`**, non un elenco
 * parallelo (`regole-stile-ui` §5). Tenerne una copia qui vorrebbe dire vederle
 * divergere alla prima variante aggiunta al design system.
 */
export type ListActionVariant = ButtonVariant;

/**
 * ⭐ **Su che cosa agisce un'azione** (`14` §5.3).
 *
 * > Nessuna riga selezionata → l'intero risultato corrente dei **filtri**.
 * > Una o più righe selezionate → **solo** quelle.
 *
 * ⛔ **Unione discriminata, non un array che a volte è vuoto.** Con
 * `run(ids: string[])` il caso «tutto il filtrato» sarebbe un array vuoto, cioè
 * indistinguibile da «non c'è niente da fare»: il primo handler scritto male
 * esporterebbe zero righe invece di centoventisette, e nessun tipo lo direbbe.
 * Così i due casi vanno gestiti entrambi, per costruzione.
 *
 * ⚠️ **`'filtered'` non si serve dalle righe caricate.** Gli elenchi sono
 * paginati lato server: ciò che il client ha in mano è una pagina, non il
 * risultato. Un handler che rispondesse con le righe in memoria darebbe le
 * prime venti di centoventisette senza dirlo — deve passare da un export che
 * conosce il filtro.
 */
export type ListActionTarget =
  { readonly scope: 'selection'; readonly ids: readonly string[] } | { readonly scope: 'filtered' };

/** Una voce del menu di un'azione con varianti. */
export interface ListActionItem {
  readonly id: string;
  readonly label: string;
  /** Classe PrimeIcons opzionale (es. `pi-file-excel`). */
  readonly icon?: string;
  /** Azione distruttiva: voce evidenziata. */
  readonly danger?: boolean;
  readonly run: (target: ListActionTarget) => void;
}

interface ListActionBase {
  /** Identità stabile: serve ai test e a riconoscere il comando nel tempo. */
  readonly id: string;
  /** Che cosa legge l'operatore sul pulsante. */
  readonly label: string;
  /** Classe PrimeIcons opzionale. */
  readonly icon?: string;
  readonly requires: ListActionRequirement;
  readonly variant?: ListActionVariant;
  /** Quando l'etichetta visibile non basta a chi non vede la barra. */
  readonly ariaLabel?: string;
  /**
   * Vincolo di DOMINIO che disabilita l'azione, oltre a quelli di `requires`.
   *
   * ⚠️ Va sempre con un `disabledReason`: un comando spento senza spiegazione
   * è peggio di un comando assente — l'operatore lo riprova.
   */
  readonly disabled?: boolean;
  /**
   * Perché non si può, **con parole sue**. I motivi che discendono da
   * `requires` NON si scrivono qui: li produce il contratto comune, o la
   * stessa frase finirebbe riscritta su ogni pagina con tre sfumature diverse.
   */
  readonly disabledReason?: string;
  /** Azione in corso: il pulsante mostra il caricamento e non si ripreme. */
  readonly busy?: boolean;
}

/**
 * Un'azione della barra contestuale: **o** fa una cosa (`run`), **o** apre un
 * menu di varianti (`items`).
 *
 * ⛔ L'unione discriminata non è pignoleria: dichiararle entrambe, o nessuna,
 * non compila — invece di produrre un pulsante che non fa niente.
 */
export type ListAction =
  | (ListActionBase & {
      readonly run: (target: ListActionTarget) => void;
      readonly items?: never;
    })
  | (ListActionBase & {
      readonly items: readonly ListActionItem[];
      readonly run?: never;
    });

/**
 * ⛔ **Stampa, Excel ed Esporta sono TRE azioni indipendenti**, non un'azione
 * con tre formati (`14` §5.2, corretto il 20/08/2026).
 *
 * Qui l'errore era mio: avevo messo Excel dentro il menu di Esporta come se
 * fosse un formato. In un gestionale non lo è —
 *
 * | Azione      | Che cosa fa                                                          |
 * | ----------- | -------------------------------------------------------------------- |
 * | **Stampa**  | produce la stampa degli elementi interessati                        |
 * | **Excel**   | porta l'elenco corrente in un vero foglio `.xlsx`, colonne comprese  |
 * | **Esporta** | un'altra funzione, il cui contenuto si decide **pagina per pagina**  |
 *
 * ⚠️ **Excel non è un CSV rinominato**, e l'azione si mostra solo dove un vero
 * foglio esiste. Un pulsante «Excel» che scarica un CSV è una promessa non
 * mantenuta, e l'operatore se ne accorge aprendo il file.
 *
 * ⭐ **Il generatore però ESISTE già**, e non è una libreria da aggiungere:
 * `api/src/corrispettivi/corrispettivi-export.service.ts` produce un workbook
 * **SpreadsheetML** (`<?mso-application progid="Excel.Sheet"?>`), che Excel apre
 * nativamente con intestazioni e colonne. È l'«Excel» del Registro
 * Corrispettivi, ed è la base da estendere agli altri elenchi — non un CSV
 * travestito, e nessuna dipendenza nuova in `package.json`.
 *
 * ⛔ **Il contenuto di Esporta non è deciso qui.** Ogni modulo esporta cose
 * diverse — tracciati, formati, sottoinsiemi — e va censito prima di scriverlo
 * in un contratto comune. Dove oggi esistono CSV e PDF restano, perché
 * funzionano: non sono però il contratto di tutti.
 */
export const LIST_ACTION_ID = {
  print: 'print',
  excel: 'excel',
  export: 'export',
} as const;

/**
 * ⚠️ **Un GAP di implementazione, non una caratteristica dell'azione.**
 *
 * Stampa, Excel ed Esporta sono per natura `requires: 'none'`: la regola
 * dell'ambito (`14` §5.3) dice che a zero selezionati valgono sul risultato
 * filtrato. Dove il percorso server-side che conosce il filtro non c'è ancora,
 * l'azione resta **visibile e spenta con questa ragione** — e il percorso si
 * completa migrando quella pagina.
 *
 * ⛔ **Non si degrada l'azione a `'oneOrMore'` per aggirare la mancanza**:
 * quello descriverebbe l'azione come se pretendesse una selezione per sua
 * natura, il che è falso, e il gap sparirebbe dalla vista invece che dal codice.
 * `'oneOrMore'` è per chi una selezione la pretende davvero — Elimina.
 */
export const FILTERED_SCOPE_NOT_AVAILABLE =
  'Non ancora disponibile su tutto il risultato filtrato: seleziona le righe.';

/** Stato di un'azione con questo numero di elementi selezionati. */
export interface ListActionState {
  readonly disabled: boolean;
  /** Presente solo se disabilitata. */
  readonly reason?: string;
}

/**
 * ⭐ **Lo stato di un'azione, dedotto dal contratto** (`14` §5.1 e §11).
 *
 * ⛔ Qui c'era `listActionAppliesTo`, che rispondeva «si vede o no». Non serve
 * più: **le azioni della pagina sono sempre visibili**, e la selezione ne cambia
 * l'ambito, non la presenza. Un'azione che non appartiene alla pagina non viene
 * dichiarata affatto — è la terza possibilità, e si esprime non chiamandola.
 *
 * ⚠️ I motivi standard nascono QUI, una volta sola: scritti pagina per pagina
 * diventerebbero tre frasi diverse per lo stesso vincolo.
 *
 * Il vincolo di dominio della pagina vince su quello di arità: se `disabled` è
 * dichiarato, la sua ragione è più specifica e più utile.
 */
export function listActionState(action: ListAction, count: number): ListActionState {
  if (action.disabled === true) {
    return { disabled: true, reason: action.disabledReason };
  }
  if (action.busy === true) {
    return { disabled: true, reason: action.disabledReason };
  }
  switch (action.requires) {
    case 'none':
      return { disabled: false };
    case 'oneOrMore':
      return count >= 1
        ? { disabled: false }
        : { disabled: true, reason: 'Seleziona almeno un elemento' };
    case 'one':
      if (count === 1) {
        return { disabled: false };
      }
      return {
        disabled: true,
        reason: count === 0 ? 'Seleziona un elemento' : 'Seleziona un solo elemento',
      };
  }
}

/**
 * L'ambito su cui l'azione agirà con questo numero di selezionati (`14` §5.3).
 *
 * ⛔ Nessuna riga scelta → l'intero risultato dei filtri. Una o più → solo
 * quelle. La selezione ha sempre la precedenza.
 */
export function listActionTarget(ids: readonly string[]): ListActionTarget {
  return ids.length > 0 ? { scope: 'selection', ids } : { scope: 'filtered' };
}
