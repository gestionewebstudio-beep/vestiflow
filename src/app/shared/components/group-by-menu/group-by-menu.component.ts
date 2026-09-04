import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

/**
 * ⭐ **Il controllo «Raggruppa» di un elenco**, indicato dal proprietario il
 * 31/08/2026: _«l'impostazione "raggruppa" presente nei corrispettivi va
 * inserita nei riepiloghi con le date»_.
 *
 * ## ⛔ È PRESENTAZIONE, non un filtro
 *
 * Non cambia quali righe si vedono: cambia come si leggono. Per questo non entra
 * in nessun costruttore di query, non conta nel badge «Filtri (n)» e «Azzera
 * filtri» non lo tocca — `14` §19 lo dice per il Registro, e vale identico qui.
 *
 * ⚠️ **Sta con i filtri e non nella testata**, perché è lì che l'occhio lo cerca.
 * Sui Corrispettivi ci era finito appeso al titolo per un errore di script, ed è
 * stato spostato: quella nota è la ragione per cui questo componente esiste come
 * componente e non come sette copie del solito `select-menu`.
 *
 * ⚠️ **Mostra il valore** (`fitContent`, non `labelOnly`): «Nessuno» e «Giorno»
 * danno due schermate diverse, e saperlo a colpo d'occhio serve. La larghezza è
 * stabile perché il controllo ha SEMPRE un valore — mai `filterChip`, che
 * aggiungerebbe una × per cancellare un filtro che non può restare vuoto
 * (`regole-stile-ui` §5).
 */
@Component({
  selector: 'app-group-by-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SelectMenuComponent],
  templateUrl: './group-by-menu.component.html',
})
export class GroupByMenuComponent {
  /** `'none'` o `'day'`. Un valore sconosciuto si legge come «Nessuno». */
  readonly value = input<string>('none');

  /**
   * ⚠️ **Il nome della granularità sta qui**, non nel componente: su un registro
   * si raggruppa per «Giorno», su un elenco documenti potrebbe un domani essere
   * «Mese» o «Cliente». Oggi la usa una sola voce, e va bene così — cambiare
   * l'etichetta non deve costringere a toccare sette pagine.
   */
  readonly dayLabel = input<string>('Giorno');

  readonly valueChange = output<string>();

  /*
    ⚠️ **`computed`, non un metodo.** Un metodo restituirebbe un array NUOVO a
    ogni giro di rilevamento, e `select-menu` è OnPush: ricostruirebbe la
    tendina per un elenco che non è cambiato.
  */
  protected readonly menuOptions = computed<readonly SelectMenuOption[]>(() => [
    { value: 'none', label: 'Nessuno' },
    { value: 'day', label: this.dayLabel() },
  ]);

  /** ⚠️ `null` non è uno stato: il menu non si può svuotare, torna «Nessuno». */
  protected onChange(value: string | null): void {
    this.valueChange.emit(value === 'day' ? 'day' : 'none');
  }
}
