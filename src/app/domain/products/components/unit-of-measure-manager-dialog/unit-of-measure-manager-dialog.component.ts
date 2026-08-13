import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { SlidePanelComponent } from '@shared/components/slide-panel/slide-panel.component';

import type { UnitOfMeasureOption } from '@domain/products/models/unit-of-measure-option.model';
import { UnitOfMeasureManagerComponent } from '../unit-of-measure-manager/unit-of-measure-manager.component';

/**
 * La gestione delle unità di misura aperta come pannello sopra il documento in
 * compilazione — la voce «» Altro…» in fondo alla tendina.
 *
 * Sta **una volta per maschera**, non per riga: la cella chiede di aprirlo, il
 * documento lo ospita. Il documento resta montato sotto, quindi aprire e
 * chiudere non perde niente di quanto compilato.
 */
@Component({
  selector: 'app-unit-of-measure-manager-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SlidePanelComponent, UnitOfMeasureManagerComponent],
  templateUrl: './unit-of-measure-manager-dialog.component.html',
})
export class UnitOfMeasureManagerDialogComponent {
  readonly open = input<boolean>(false);

  readonly closed = output<void>();
  /** Dopo ogni modifica: chi ospita ricarica il proprio elenco. */
  readonly changed = output<void>();
  /** Unità appena creata: il chiamante può scriverla subito sulla riga. */
  readonly created = output<UnitOfMeasureOption>();
}
