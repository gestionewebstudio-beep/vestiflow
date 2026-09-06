import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { take } from 'rxjs';

import { ButtonComponent } from '@shared/components/button/button.component';

import { DocumentService } from '../../services/document.service';

/**
 * «Anteprima stampa» + «Scarica PDF» di un documento salvato.
 *
 * Esisteva una sola volta, nella maschera arrivo merce, e serviva già tre tipi
 * documento; portarla anche su registrazione fattura e rettifica ne avrebbe
 * fatto tre copie — stessa coppia di bottoni, stesso stato di caricamento,
 * stesso scarico del blob. Le regole di progetto chiedono l'estrazione alla
 * seconda occorrenza (regole-architettura, «Soglia di estrazione 1 + 1»).
 *
 * Sta in `domain/` e non in `shared/` perché inietta un service di entità: è il
 * test decisivo della regola. Per la stessa ragione NON decide se mostrarsi —
 * il predicato di stampabilità vive in `features/documents`, e da qui non si
 * può guardare in giù. La visibilità la decide chi lo ospita.
 *
 * L'host è `display: contents`, come `app-button`: la coppia sta in un pannello
 * nella testata e nuda dentro la barra azioni, e la cornice è del contenitore.
 * L'errore esce come `output` per la stessa ragione — ogni maschera ha già la
 * propria fascia di messaggi, e un banner qui dentro finirebbe in mezzo ai
 * bottoni di quella barra.
 */
@Component({
  selector: 'app-document-print-actions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent],
  templateUrl: './document-print-actions.component.html',
  styleUrl: './document-print-actions.component.scss',
})
export class DocumentPrintActionsComponent {
  private readonly service = inject(DocumentService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly documentId = input.required<string>();

  /** Riferimento e data servono solo a nominare il file scaricato. */
  readonly reference = input<string | null>(null);
  readonly documentDate = input<string | null>(null);

  /**
   * Lo scarico è fallito. Esce l'errore GREZZO, non un messaggio già scritto:
   * ogni maschera ha il proprio `toAppError` e la propria fascia di messaggi, e
   * costruire qui un `AppError` a mano vorrebbe dire inventarne il `kind`.
   */
  readonly failed = output<unknown>();

  protected readonly downloadingPdf = signal(false);

  protected openPrintPreview(): void {
    void this.router.navigate(['/app/documents', this.documentId(), 'print']);
  }

  protected downloadDocumentPdf(): void {
    if (this.downloadingPdf()) {
      return;
    }
    this.downloadingPdf.set(true);
    this.service
      .exportPdf(this.documentId())
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          this.downloadingPdf.set(false);
          const reference = this.reference() ?? 'bozza';
          const stamp = (this.documentDate() ?? new Date().toISOString()).slice(0, 10);
          this.downloadBlob(blob, `documento-${reference}-${stamp}.pdf`);
        },
        error: (err: unknown) => {
          this.downloadingPdf.set(false);
          this.failed.emit(err);
        },
      });
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename.replace(/[^\w\s.-]/g, '-');
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
