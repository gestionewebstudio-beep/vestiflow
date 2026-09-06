import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

import { UnitOfMeasureManagerDialogComponent } from '../unit-of-measure-manager-dialog/unit-of-measure-manager-dialog.component';
import { UnitOfMeasureOptionService } from '../../services/unit-of-measure-option.service';

/**
 * **Il selettore dell'unità di misura, fuori dalle righe documento.**
 *
 * ## Perché non si riusa la cella di riga
 *
 * ⛔ `app-document-line-unit-cell` **non è agnostica**, misurato il 26/08/2026:
 * ha `lineIndex` come input **obbligatorio**, `inColumnCycle`, e quattro uscite
 * di navigazione della griglia (`lineAdvance`, `lineRetreat`, `lineRowAdvance`,
 * `lineRowRetreat`). Usarla in anagrafica costringerebbe a inventare un indice
 * di riga e a ignorare quattro uscite che lì non significano niente.
 *
 * ⛔ E non si riusa nemmeno il suo interno, `document-line-select-cell`: è
 * **anch'essa** una cella di riga, con gli stessi vincoli.
 *
 * ⭐ Quindi sono **due fratelli**, non un genitore e un figlio. Condividono il
 * concetto — le stesse unità del tenant, lo stesso comando di gestione — non il
 * controllo. E la cella di riga resta dov'è, col suo nome onesto: è una cella di
 * riga documento.
 *
 * ## Autosufficiente, e perché
 *
 * Legge l'elenco da sé e ospita il proprio gestore: si adotta con **un tag**.
 * La cella di riga non può farlo — è resa una volta per riga, e l'elenco lo
 * tiene la maschera — ma qui la resa è una sola per form.
 *
 * ⚠️ Ne consegue che due istanze nella stessa schermata porterebbero due
 * dialoghi. Oggi non succede, e se succedesse la risposta è alzare il dialogo
 * al chiamante, non duplicarlo.
 *
 * ## ⛔ Cosa NON fa
 *
 * Non conosce la predefinita del tenant. Chi crea un articolo nuovo la usa per
 * **seminare il valore iniziale**, e da lì è un valore come un altro:
 * modificabile, e salvato sull'articolo. Leggerla qui la trasformerebbe in un
 * ripiego permanente, e cambiare l'impostazione domani cambierebbe cosa
 * sembrano dire gli articoli di ieri.
 */
@Component({
  selector: 'app-unit-of-measure-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SelectMenuComponent, UnitOfMeasureManagerDialogComponent],
  templateUrl: './unit-of-measure-select.component.html',
})
export class UnitOfMeasureSelectComponent {
  private readonly service = inject(UnitOfMeasureOptionService);

  /** L’unità corrente della riga o dell’articolo. Vuota = nessuna scelta. */
  readonly value = input<string>('');

  /**
   * ⛔ **Niente `inputId` e niente `disabled`, e non è una dimenticanza:**
   * `app-select-menu` non li ha. La stessa mancanza è già annotata su
   * `document-listino-select`, che per «documento in sola lettura» nasconde il
   * controllo invece di spegnerlo — perché spegnerlo non si può.
   *
   * ⚠️ Esporli qui li avrebbe resi ingressi finti: accettati e ignorati, cioè
   * il difetto peggiore di tutti — chi li passa crede di aver bloccato il campo.
   * Se serviranno, si aggiungono a `select-menu`, non si simulano qui.
   */
  readonly ariaLabel = input('Unità di misura');

  readonly valueChange = output<string>();

  protected readonly managerOpen = signal(false);

  /** L'elenco si carica alla prima lettura del segnale: non c'è modo di scordarlo. */
  private readonly options = this.service.options();

  protected readonly selectOptions = computed<readonly SelectMenuOption[]>(() =>
    this.options()
      .filter((voce) => voce.isActive)
      .map((voce) => ({ value: voce.name, label: voce.name })),
  );

  /**
   * ⚠️ Il segnaposto NON è la predefinita del tenant: è un esempio. Mostrare qui
   * la predefinita farebbe sembrare compilato un campo vuoto.
   */
  protected readonly placeholder = 'pz';

  protected onChange(valore: string | null): void {
    if (valore === MANAGE_VALUE) {
      this.managerOpen.set(true);
      return;
    }
    this.valueChange.emit(valore ?? '');
  }

  protected onManagerChanged(): void {
    this.service.reload();
  }
}

/** Voce sentinella del comando di gestione, fuori dai valori reali. */
export const MANAGE_VALUE = '__gestisci__';
