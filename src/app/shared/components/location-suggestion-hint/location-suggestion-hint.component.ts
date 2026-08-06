import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Hint cliccabile "Suggerita: {nome}" sotto un campo sede: propone la sede
 * predefinita (o l'unica autorizzata) senza mai autoselezionarla — la conferma
 * resta un gesto esplicito dell'utente (specifica cliente sede predefinita).
 */
@Component({
  selector: 'app-location-suggestion-hint',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './location-suggestion-hint.component.html',
  styleUrl: './location-suggestion-hint.component.scss',
})
export class LocationSuggestionHintComponent {
  readonly locationName = input.required<string>();
  /** L'utente ha accettato il suggerimento: il form imposta la sede. */
  readonly applied = output<void>();
}
