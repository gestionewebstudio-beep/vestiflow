import { describe, expect, it } from 'vitest';

import { DocumentType } from '@core/models/document.model';

import {
  DOCUMENT_ROW_OPENS,
  documentDetailPath,
  documentEditPath,
  documentRowPath,
} from './document-routing.util';

/**
 * ⭐ **I due ordini vivono FUORI da `/app/documents`**, e sono l'unico caso in
 * cui la maschera non sta nel modulo documenti. Queste prove inchiodano gli
 * indirizzi, perché un errore qui manda l'operatore su una rotta che per quel
 * tipo non esiste — e il catch-all lo assorbe in silenzio.
 */
describe('routing dei due ordini', () => {
  const utente = {
    role: 'owner',
    permissions: [],
    tenantChannelProfile: 'gestionale',
  } as unknown as Parameters<typeof documentRowPath>[1];

  it('⭐ il clic sulla riga di un Ordine fornitore apre la MODIFICA', () => {
    // ⛔ Era il difetto: `supplier-order-list` cablava `/app/orders/:id`, cioè il
    //   Dettaglio, mentre `DOCUMENT_ROW_OPENS` dichiara `'form'` dal 20/08/2026.
    //   La rotta di modifica esisteva e il clic la scavalcava.
    const path = documentRowPath({ id: 'ord-1', type: DocumentType.SupplierOrder }, utente);

    expect(path).toBe('/app/orders/ord-1/edit');
  });

  /**
   * ⭐ **E vale in OGNI stato** — decisione del proprietario del 27/08/2026.
   *
   * ⛔ Il commit 166e7cb mappava `concluded → DocumentStatus.Confirmed` con un
   * adattatore, per alimentare il ramo «annullato → Dettaglio». Effetto: un
   * ordine CONCLUSO finiva sulla maschera, che allora lo rifiutava con «Ordine
   * non modificabile» — un vicolo cieco introdotto dalla correzione stessa.
   *
   * ⚠️ Ora `documentRowPath` non riceve nemmeno lo stato: non è che lo ignora,
   * **non può leggerlo**. È la forma che impedisce al difetto di tornare.
   */
  it('⭐ e la destinazione non dipende dallo stato: la firma non lo accetta', () => {
    expect(documentRowPath({ id: 'ord-2', type: DocumentType.SupplierOrder }, utente)).toBe(
      '/app/orders/ord-2/edit',
    );
    expect(documentRowPath({ id: 'ord-3', type: DocumentType.CustomerOrder }, utente)).toBe(
      '/app/sales/ord-3/edit',
    );
  });

  it('⭐ e la regola è dichiarata, non dedotta dal comportamento', () => {
    expect(DOCUMENT_ROW_OPENS[DocumentType.SupplierOrder]).toBe('form');
  });

  it('⭐ `documentDetailPath` dà l’indirizzo VERO dell’Ordine fornitore', () => {
    // ⛔ Cadeva nel `default` → `/app/documents/:id`, che per un ordine non
    //   esiste. Non era teorico: la ricerca globale restituisce ordini
    //   fornitore e passa di qui quando l'ordine è annullato.
    expect(documentDetailPath({ id: 'ord-1', type: DocumentType.SupplierOrder })).toBe(
      '/app/orders/ord-1',
    );
  });

  it('⛔ ma l’Ordine CLIENTE resta fuori: non ha una rotta di Dettaglio', () => {
    // ⚠️ Verificato il 27/08/2026: `/app/sales/:id` monta la maschera di
    //   MODIFICA. Mapparlo qui farebbe dire «Dettaglio» a una cosa che apre la
    //   Modifica — una bugia semantica, peggio del ripiego sbagliato.
    expect(documentDetailPath({ id: 'ocl-1', type: DocumentType.CustomerOrder })).not.toBe(
      '/app/sales/ocl-1',
    );
  });

  it('⭐ e la modifica dei due ordini non passa da `/app/documents`', () => {
    expect(documentEditPath({ id: 'ord-1', type: DocumentType.SupplierOrder })).toBe(
      '/app/orders/ord-1/edit',
    );
    expect(documentEditPath({ id: 'ocl-1', type: DocumentType.CustomerOrder })).toBe(
      '/app/sales/ocl-1/edit',
    );
  });
});
