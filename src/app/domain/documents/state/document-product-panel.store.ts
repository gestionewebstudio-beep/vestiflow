import { signal } from '@angular/core';

export type DocumentProductPanelMode = 'create' | 'edit';

/**
 * Stato del pannello prodotto dei form documento: apertura in creazione o in
 * modifica, riga di destinazione e variante in attesa di aggancio.
 *
 * Era duplicato in Ordine cliente e Arrivo merce — sei signal e quattro
 * transizioni identiche byte per byte.
 *
 * Come `DocumentNumberConflictStore`, non è un service iniettabile: nessuna
 * dipendenza e un'istanza per form, quindi si costruisce come campo del
 * componente. Qui vive SOLO lo stato: i controlli sui dati di riga, le
 * chiamate a `ProductService` e l'aggancio della variante restano nel form,
 * perché differiscono per tipo documento.
 */
export class DocumentProductPanelStore {
  private readonly _open = signal(false);
  private readonly _lineIndex = signal<number | null>(null);
  private readonly _mode = signal<DocumentProductPanelMode>('create');
  private readonly _editProductId = signal<string | null>(null);
  private readonly _attachTargetLineIndex = signal<number | null>(null);
  private readonly _pendingAttachVariantId = signal<string | null>(null);

  readonly isOpen = this._open.asReadonly();
  /** Riga da cui il pannello è stato aperto; null se aperto dalla barra. */
  readonly lineIndex = this._lineIndex.asReadonly();
  readonly mode = this._mode.asReadonly();
  readonly editProductId = this._editProductId.asReadonly();
  /** Riga a cui agganciare la variante creata; null = la sceglie il form. */
  readonly attachTargetLineIndex = this._attachTargetLineIndex.asReadonly();
  readonly pendingAttachVariantId = this._pendingAttachVariantId.asReadonly();

  /**
   * Co-posseduto con il dialog «aggancia alla riga», che si chiude da sé
   * tramite `[(open)]`: per questo è scrivibile. Vale la stessa nota di
   * `DocumentNumberConflictStore.isOpen`.
   */
  readonly attachDialogOpen = signal(false);

  /** «Nuovo prodotto» dalla barra: nessuna riga di partenza. */
  openForNewProduct(): void {
    this._attachTargetLineIndex.set(null);
    this._lineIndex.set(null);
    this._editProductId.set(null);
    this._mode.set('create');
    this._open.set(true);
  }

  /** «Completa anagrafica» da una riga: il prodotto nascerà agganciato lì. */
  openForLine(lineIndex: number): void {
    this._attachTargetLineIndex.set(lineIndex);
    this._lineIndex.set(lineIndex);
    this._editProductId.set(null);
    this._mode.set('create');
    this._open.set(true);
  }

  /**
   * Riga già collegata: apre la scheda del prodotto in modifica. La riga resta
   * anche destinazione di aggancio: se dal pannello nasce una variante nuova,
   * finisce sulla riga da cui si è partiti.
   */
  openForEdit(lineIndex: number, productId: string): void {
    this._attachTargetLineIndex.set(lineIndex);
    this._lineIndex.set(lineIndex);
    this._editProductId.set(productId);
    this._mode.set('edit');
    this._open.set(true);
  }

  close(): void {
    this._open.set(false);
    this._lineIndex.set(null);
    this._editProductId.set(null);
    this._mode.set('create');
  }

  /**
   * Prodotto salvato senza essere aggiunto al documento: si chiede
   * all'operatore se agganciarlo a una riga.
   */
  savedWithoutAttach(variantId: string): void {
    this._pendingAttachVariantId.set(variantId);
    this.attachDialogOpen.set(true);
    this.close();
  }

  /** Chiude il dialog di aggancio e dimentica la variante in attesa. */
  dismissAttach(): void {
    this._pendingAttachVariantId.set(null);
    this.attachDialogOpen.set(false);
    this._attachTargetLineIndex.set(null);
  }
}
