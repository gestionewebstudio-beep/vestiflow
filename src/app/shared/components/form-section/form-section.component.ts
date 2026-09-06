import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Pannello di sezione per form anagrafica: titolo + gruppo di campi in un
 * riquadro bordato — bordo, sfondo, radius.
 *
 * ⭐ **Non è la prima volta che questo blocco viene scritto**: Impostazioni →
 * Azienda (`company-page__panel` + `<fieldset>/<legend>`) e la scheda
 * Prodotto (`general-step__pricing`, per Prezzi di vendita e Listini) lo
 * avevano già scritto ciascuno per conto proprio, con lo stesso bordo, lo
 * stesso radius, lo stesso padding — due copie a mano dello stesso pattern,
 * la soglia "1+1" di `regole-architettura` per l'estrazione obbligatoria.
 * Qui diventa un componente, non una terza copia per il fornitore.
 *
 * ⚠️ **`<fieldset>` è la scelta semantica**, non solo visiva: raggruppa i
 * controlli del form sotto un nome che uno screen reader annuncia — lo stesso
 * meccanismo nativo che Impostazioni → Azienda usa già. Non porta `disabled`:
 * serve a nominare il gruppo, non a bloccarlo.
 */
@Component({
  selector: 'app-form-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './form-section.component.html',
  styleUrl: './form-section.component.scss',
})
export class FormSectionComponent {
  readonly title = input.required<string>();

  /**
   * ⭐ **Variante piatta**: nessun riquadro, il titolo con un filo sotto.
   *
   * ⚠️ **Non è una preferenza estetica, è un problema di ALLINEAMENTO.** Il
   * padding del riquadro rientra il contenuto rispetto al titolo di pagina —
   * misurato il 01/09/2026 sull'anagrafica fornitore: intestazione a 204px,
   * campi a 213 — e il proprietario l'ha visto: «i testi vanno allineati».
   * Piatta, la sezione resta un raggruppamento leggibile e i campi cadono
   * sulla stessa colonna di tutto il resto della pagina.
   *
   * ⭐ Stessa forma di `app-segmented`, che ha già un `flat` per la stessa
   * ragione: togliere la scatola dove la scatola non serve.
   */
  readonly flat = input(false);
}
