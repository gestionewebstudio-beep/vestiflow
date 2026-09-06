import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import type { DocumentPageState } from './document-page-state.model';

/**
 * ⭐ **La macchina degli stati di pagina: una sola, per tutte le maschere.**
 *
 * ```text
 * loading → error → not-found → il documento
 * ```
 *
 * ## La misura (25/08/2026)
 *
 * L'ordine di precedenza era gia' **identico in sette maschere su sette**, e
 * cosi' i componenti usati e l'etichetta «Riprova». Ma il resto derivava:
 *
 * | | |
 * | --- | --- |
 * | descrizione dell'errore | TRE varianti: «…il documento», «…l'ordine», «…l'ordine cliente» |
 * | scheletro | `rows="6"` in sei maschere, `rows="5"` nell'Ordine fornitore |
 *
 * ⚠️ **E una sola prova in tutta l'app toccava questi stati** — quella del banco
 * sulla lettura fallita. `loading` e `not-found` non erano provati da nessuna
 * parte: e' cio' che l'operatore vede quando qualcosa va storto, e non lo
 * guardava nessuno.
 *
 * ## ⭐ Un ingresso solo, e non e' un caso
 *
 * Non tre booleani, non uno store, non il form: **lo stato che la maschera gia'
 * calcola**. `loadState()` esiste in tutte e sette con le stesse quattro parole,
 * quindi il contratto era gia' li' — bastava riconoscerlo.
 *
 * ## ⛔ Che cosa NON sa
 *
 * Non conosce i tipi documento — `check-document-grammar` lo verifica. E in
 * particolare **non sa perche' un documento non e' modificabile**: quel motivo
 * dipende dal documento (l'Ordine cliente ne calcola tre, uno per preventivo,
 * scarico e ordine), quindi titolo, descrizione e comando arrivano dal
 * consumer come contenuto proiettato.
 *
 * ⭐ La STRUTTURA di quel caso e' comune, il CONTENUTO no. E' la distinzione che
 * questo componente esiste per tenere.
 */
@Component({
  selector: 'app-document-page-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TableSkeletonComponent, ErrorStateComponent],
  templateUrl: './document-page-state.component.html',
  styleUrl: './document-page-state.component.scss',
})
export class DocumentPageStateComponent {
  /** Lo stato che la maschera gia' calcola. */
  readonly state = input.required<DocumentPageState>();

  /** «Riprova»: la maschera rilegge il documento. */
  readonly retry = output<void>();
}
