import { describe, expect, it } from 'vitest';

import { DocumentStatus, DocumentType } from '@core/models/document.model';

import { documentStatusLabel, documentStatusLabelForType } from './document-labels.util';

/**
 * Guardia dell'ordine di rimozione di `externally_registered` (16/08/2026).
 *
 * L'azione «Inviata al commercialista» è stata rimossa: nessuna maschera e
 * nessun endpoint può più produrre quello stato. Ma **due arrivi merce storici
 * ce l'hanno ancora nel database**, e finché non sono normalizzati il membro
 * dell'enum e la sua etichetta devono restare.
 *
 * `STATUS_LABELS` è un `Record<DocumentStatus, string>` esaustivo: togliere il
 * membro dall'enum farebbe sparire l'etichetta **in silenzio**, e quei due
 * documenti mostrerebbero un badge vuoto. Nessun errore, nessun test rosso —
 * per questo la guardia è qui e non altrove.
 *
 * Quando i due record saranno passati a `confirmed`, questo file va via
 * insieme al membro dell'enum.
 */
describe('etichette di stato — documenti storici registrati esternamente', () => {
  it('lo stato legacy ha ancora un nome leggibile', () => {
    expect(documentStatusLabel(DocumentStatus.ExternallyRegistered)).toBe(
      'Registrato esternamente',
    );
  });

  it('sulla famiglia Fattura non dice più «Inviata al commercialista»', () => {
    // Il ramo che rimappava l'etichetta sul ciclo fiscale è stato rimosso con
    // l'azione: resta il nome generico, che descrive il dato e non un flusso.
    expect(
      documentStatusLabelForType(DocumentType.InvoiceDraft, DocumentStatus.ExternallyRegistered, {
        externallyIssuedAt: undefined,
      }),
    ).toBe('Registrato esternamente');
  });

  it('gli stati vivi restano quelli di sempre', () => {
    expect(documentStatusLabel(DocumentStatus.Confirmed)).toBe('Confermato');
    expect(
      documentStatusLabelForType(DocumentType.InvoiceDraft, DocumentStatus.Confirmed, {
        externallyIssuedAt: undefined,
      }),
    ).toBe('Da emettere');
  });
});
