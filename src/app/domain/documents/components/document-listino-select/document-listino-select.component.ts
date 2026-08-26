import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import type { TenantFeatureSettings } from '@domain/tenant/models/tenant-feature-settings.model';

import {
  ARTICLE_LISTINO_VALUE,
  listinoSelectOptions,
  parseListinoChoice,
} from '../../utils/document-listino.util';
import type { DocumentListinoChoice } from '../../utils/document-listino.util';

/**
 * **Il selettore del listino di testata documento: uno solo.**
 *
 * ⛔ Era scritto due volte, in due maschere — DDT/Fatture e Ordine cliente — con
 * gli stessi identici tre `computed` (`listinoOptions`, `listinoValue`,
 * l'etichetta) e le stesse dodici righe di template. La regola «1 + 1» di
 * `regole-architettura` era già superata: due usi reali, estrazione obbligatoria.
 *
 * ⚠️ **E stava per diventare la terza copia.** L'Ordine cliente lo aveva solo
 * nel pannello mobile; portarlo anche in testata desktop copiando il blocco
 * avrebbe aggiunto una copia proprio mentre se ne toglieva un'altra.
 *
 * ## ⛔ Che cosa NON entra qui, e perché
 *
 * **Solo il come si procura il dato, e come si scrive il campo.** Una maschera
 * chiede i riepiloghi variante al servizio, l'altra li ha già in memoria; e
 * ognuna scrive il prezzo nel campo secondo la propria modalità netto/ivato.
 * Due strade tecniche, e la forma del campo — non il Listino.
 *
 * ⛔ **Qui c'era scritto il contrario, ed era un errore di analisi:** «l'effetto
 * non è condiviso perché sono due logiche di dominio diverse». Falso. **Il
 * comportamento di dominio è UNO** — il Listino scelto stabilisce quale prezzo
 * dell'anagrafica diventa il prezzo proposto delle righe, e cambiarlo riprezza
 * anche quelle già inserite. Quelle erano due implementazioni, e prendere lo
 * stato dell'implementazione per promuoverlo a regola è esattamente il
 * contrario di quello che questo progetto fa.
 *
 * ⚠️ **Il motivo dell'errore è ripetibile, e per questo va nominato**: la regola
 * «una divergenza è spesso una decisione» ha una PRECONDIZIONE — verificare se
 * qualcuno l'ha dichiarata. Per i campi della testata mobile quel controllo era
 * stato fatto; qui no. Trovate due implementazioni, sono state chiamate due
 * domini senza cercare una sola riga che lo dicesse.
 *
 * ⭐ Il dominio sta in `document-listino.util`: `listinoRepricing` e
 * `listinoMissingWarning`. Le maschere lo chiamano, non lo riscrivono.
 *
 * **Se mostrarlo affatto.** È una regola di dominio del chiamante. Qui c'è solo
 * la parte che vale per tutti — *se c'è un solo listino attivo, la scelta non
 * esiste e il controllo non si mostra*.
 *
 * ⛔ **Qui c'era «lo Scarico manuale non è un documento di vendita e la
 * tendina non ci va»** — col nome vecchio, citato com'era. Falso, e nato
 * proprio dal nome vecchio, che faceva concludere che non
 * fosse una vendita, e il Listino era stato spento per quello. È una vendita
 * che riduce la giacenza senza generare movimenti, e il Listino le appartiene
 * come a ogni altro documento di vendita.
 *
 * ## Le due vesti, senza una riga di logica in più
 *
 * ⭐ Il controllo è lo stesso in testata di scrivania e nel pannello mobile: a
 * cambiarne l'aspetto è il CONTENITORE, con le custom property `--field-*` che
 * `select-menu` espone (`regole-stile-ui` §5). Nessun `input` di layout, nessun
 * ramo per viewport.
 */
@Component({
  selector: 'app-document-listino-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SelectMenuComponent],
  template: `
    @if (visible()) {
      <!--
        La voce vuota resta SPENTA: l'elenco ha già la sua voce neutra
        («Prezzo di vendita», la prima), e il segnaposto direbbe le stesse
        identiche parole una seconda volta.
      -->
      <app-select-menu
        [options]="options()"
        [value]="value()"
        ariaLabel="Listino applicato alle righe"
        placeholder="Prezzo di vendita"
        [includeEmptyOption]="false"
        [compact]="true"
        [fullWidth]="true"
        (valueChange)="onChange($event)"
      />
    }
  `,
})
export class DocumentListinoSelectComponent {
  /** Le impostazioni del tenant: da lì escono i listini attivi. */
  readonly settings = input<TenantFeatureSettings | null>(null);
  /** La scelta corrente del documento. */
  readonly choice = input<DocumentListinoChoice>('article');

  /**
   * Documento in sola lettura: il controllo **non si mostra**.
   *
   * ⚠️ Non «disabilitato»: è il comportamento che le due maschere avevano già
   * (`@if (… && !formReadOnly())`), ed è anche l'unico possibile —
   * `app-select-menu` non ha un ingresso `disabled`. Sceglierne un altro qui
   * avrebbe cambiato in silenzio come si vede un documento bloccato.
   */
  readonly readOnly = input(false);

  readonly choiceChange = output<DocumentListinoChoice>();

  protected readonly options = computed<readonly SelectMenuOption[]>(() =>
    listinoSelectOptions(this.settings()),
  );

  /**
   * ⭐ **Con un solo listino attivo la scelta non esiste**, e un controllo che
   * non può cambiare niente è rumore: l'elenco porta sempre «Prezzo di
   * vendita», quindi «una sola opzione» significa «nessun listino acceso».
   */
  protected readonly visible = computed(() => !this.readOnly() && this.options().length > 1);

  protected readonly value = computed(() => {
    const scelta = this.choice();
    return scelta === 'article' ? ARTICLE_LISTINO_VALUE : String(scelta);
  });

  protected onChange(value: string | null): void {
    this.choiceChange.emit(parseListinoChoice(value));
  }
}
