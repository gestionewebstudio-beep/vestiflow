import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { SlidePanelComponent } from '@shared/components/slide-panel/slide-panel.component';

import type { ExternalDocumentType } from '../../models/external-document-type.model';
import { ExternalDocumentTypeManagerComponent } from '../external-document-type-manager/external-document-type-manager.component';

/**
 * Gestione tipi documento aperta come pannello sopra la maschera in
 * compilazione (voce «Gestisci tipi documento…» in fondo alla tendina).
 *
 * Monta lo STESSO componente della scheda in Impostazioni, non una versione
 * ridotta: e' la ragione per cui esistono due file invece di uno. Il documento
 * resta montato sotto, quindi aprire e chiudere il pannello non perde nulla di
 * quanto compilato.
 */
@Component({
  selector: 'app-external-document-type-manager-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SlidePanelComponent, ExternalDocumentTypeManagerComponent],
  templateUrl: './external-document-type-manager-dialog.component.html',
})
export class ExternalDocumentTypeManagerDialogComponent {
  readonly open = input<boolean>(false);

  readonly closed = output<void>();
  /** Dopo ogni modifica: chi ospita ricarica la propria tendina. */
  readonly changed = output<void>();
  /** Tipo appena creato dal pannello: il chiamante puo' selezionarlo. */
  readonly created = output<ExternalDocumentType>();
}
