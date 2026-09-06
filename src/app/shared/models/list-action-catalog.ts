import type {
  ListAction,
  ListActionItem,
  ListActionRequirement,
  ListActionVariant,
} from './list-selection.model';

/**
 * ⭐ **La FORMA dei comandi comuni, dichiarata una volta sola.**
 *
 * ## Perché esiste — la misura, non un principio
 *
 * Da quando ogni elenco dichiara le proprie azioni, il **gestore** è giustamente
 * diverso — eliminare un documento non è eliminare un fornitore — ma il
 * **vestito** veniva ridigitato ogni volta. Misurata la deriva il 30/08/2026:
 *
 * ```text
 * «print»          5 punti, 2 forme    ghost sui Corrispettivi, secondary altrove
 * «csv»            4 punti, 3 forme    tre icone: pi-file-excel, pi-file, pi-download
 * «pdf»            3 punti, 2 forme    'PDF (.pdf)' contro 'PDF'
 * «export»         7 punti, 2 forme    'Esporta' contro 'Esporta CSV'
 * «shopify-sync»   4 punti, 4 forme    quattro etichette per quattro operazioni diverse
 * ```
 *
 * Il proprietario l'ha vista a schermo: lo stesso «Stampa» senza cornice su una
 * pagina e con la cornice su un'altra.
 *
 * ## Come si usa
 *
 * ```ts
 * comando('print', { run: () => this.stampaSelezione() })
 * comando('delete', { disabled: motivo !== null, disabledReason: motivo ?? '', run: … })
 * ```
 *
 * La pagina passa **il gestore** e ciò che è davvero suo — `disabled`, `busy`,
 * un `ariaLabel` più preciso, un'etichetta che deve differire per una ragione
 * dichiarata. Tutto il resto viene da qui.
 *
 * ⛔ **E la deriva non può tornare**: se l'etichetta non si scrive più nelle
 * pagine, non si può riscriverla diversa.
 *
 * ## ⚠️ Che cosa NON sta qui
 *
 * I comandi che **non sono gli stessi** su pagine diverse. I quattro pulsanti
 * Shopify si chiamano tutti `shopify-sync` ma due tirano dentro e uno spinge
 * fuori: unificarne la forma nasconderebbe che sono operazioni diverse. Vanno
 * distinti gli id, ed è registrato in `docs/01-registro-difetti-shopify.md`
 * §Livello 5.
 */
interface FormaComando {
  readonly label: string;
  readonly icon: string;
  readonly variant?: ListActionVariant;
  readonly requires: ListActionRequirement;
  /** Il nome per esteso, dove l'etichetta è corta perché il contesto la completa. */
  readonly ariaLabel?: string;
}

/**
 * ⭐ **Stampa, Excel ed Esporta sono TRE comandi**, non uno con tre formati
 * (`14` §5.2) — e `Esporta` è il menu dei tracciati: PDF, CSV, e XML dove serve.
 *
 * _Deciso dal proprietario il 30/08/2026: «potremmo utilizzare Esporta e lì
 * mettere le funzioni di esporta come pdf, csv, xml se serve»._
 *
 * ⛔ **PDF e CSV non sono più pulsanti a sé.** Sui Corrispettivi lo erano —
 * quattro comandi in fila per quattro formati — e sulle altre pagine erano già
 * voci del menu. Ora la forma è una.
 */
export const CATALOGO_COMANDI = {
  new: { label: 'Nuovo', icon: 'pi-plus', variant: 'primary', requires: 'none' },

  /*
    ⭐ **La modalità selezione della vista a card**, decisa dal proprietario il
    30/08/2026: acceso, il tocco sulla riga seleziona invece di aprire; spento,
    tutto torna come prima.

    ⚠️ **`requires: 'none'`**: è il comando che PRODUCE una selezione, quindi non
    può chiederne una. È l'unico del catalogo per cui la domanda si rovescia.

    ⚠️ Sta nel catalogo e non nella pagina perché ogni elenco con la vista a card
    ne avrà bisogno: dichiararlo una volta evita che il secondo lo chiami
    «Scegli» e il terzo gli dia un'altra icona — che è esattamente il difetto
    per cui questo catalogo esiste.
  */
  select: { label: 'Seleziona', icon: 'pi-check-square', requires: 'none' },
  detail: {
    label: 'Dettaglio',
    icon: 'pi-eye',
    requires: 'one',
    ariaLabel: "Apri il dettaglio dell'elemento selezionato",
  },
  edit: { label: 'Modifica', icon: 'pi-pencil', requires: 'one' },
  duplicate: { label: 'Duplica', icon: 'pi-copy', requires: 'one' },
  delete: { label: 'Elimina', icon: 'pi-trash', variant: 'danger', requires: 'oneOrMore' },
  print: { label: 'Stampa', icon: 'pi-print', requires: 'none' },
  excel: { label: 'Excel', icon: 'pi-file-excel', requires: 'none' },
  export: { label: 'Esporta', icon: 'pi-download', requires: 'none' },
  labels: { label: 'Etichette', icon: 'pi-tag', requires: 'one' },
  attachments: { label: 'Allegati', icon: 'pi-paperclip', requires: 'one' },
} as const satisfies Record<string, FormaComando>;

export type ComandoComune = keyof typeof CATALOGO_COMANDI;

/**
 * ⭐ **Le VOCI del menu «Esporta»**, e anche loro una volta sola.
 *
 * ⛔ Misurato il 30/08/2026: «CSV (.csv)» compariva con **tre icone diverse** —
 * `pi-file-excel`, `pi-file`, `pi-download` — in tre elenchi. Le voci non
 * passavano dal catalogo perché il catalogo non ce le aveva.
 *
 * ⚠️ **L'estensione fra parentesi resta QUI e non sul pulsante.** Dentro un menu
 * di formati distingue; su un pulsante da sola sarebbe rumore — «Esporta» dice
 * già tutto, e il formato lo si sceglie dopo.
 */
export const VOCI_ESPORTA = {
  pdf: { label: 'PDF (.pdf)', icon: 'pi-file-pdf' },
  csv: { label: 'CSV (.csv)', icon: 'pi-file' },
  xml: { label: 'XML (.xml)', icon: 'pi-code' },
} as const satisfies Record<string, { readonly label: string; readonly icon: string }>;

export type VoceEsporta = keyof typeof VOCI_ESPORTA;

/** Una voce del menu «Esporta», con la sua forma dal catalogo. */
export function voceEsporta(id: VoceEsporta, run: ListActionItem['run']): ListActionItem {
  return { id, ...VOCI_ESPORTA[id], run };
}

/** Ciò che la pagina aggiunge: il gestore, e quello che è davvero suo. */
type SuoDellaPagina = Partial<Omit<ListAction, 'id' | 'run' | 'items'>>;

/**
 * Un comando comune, con la sua forma dal catalogo.
 *
 * ⚠️ Le due firme rispecchiano l'unione discriminata di `ListAction`: **o** fa
 * una cosa, **o** apre un menu. Dichiararle entrambe non compila.
 */
export function comando(
  id: ComandoComune,
  resto: SuoDellaPagina & { readonly run: ListAction['run'] },
): ListAction;
export function comando(
  id: ComandoComune,
  resto: SuoDellaPagina & { readonly items: readonly ListActionItem[] },
): ListAction;
export function comando(
  id: ComandoComune,
  resto: SuoDellaPagina & {
    readonly run?: ListAction['run'];
    readonly items?: readonly ListActionItem[];
  },
): ListAction {
  return { id, ...CATALOGO_COMANDI[id], ...resto } as ListAction;
}
