import { ChangeDetectionStrategy, Component, output } from '@angular/core';

import { ButtonComponent } from '@shared/components/button/button.component';

/**
 * Banner «Documento protetto»: un documento confermato si riapre sempre
 * bloccato e questo banner offre lo sblocco. Riusato da tutte le maschere
 * documentali — stesso testo, stesso pulsante, stessa logica. Emette `unlock`
 * al click o da tastiera; la maschera apre la conferma e sblocca l'editing.
 */
@Component({
  selector: 'app-edit-lock-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent],
  templateUrl: './edit-lock-banner.component.html',
  styleUrl: './edit-lock-banner.component.scss',
})
export class EditLockBannerComponent {
  /** Richiesta di sblocco (click sul banner o sul pulsante). */
  readonly unlock = output<void>();
}
