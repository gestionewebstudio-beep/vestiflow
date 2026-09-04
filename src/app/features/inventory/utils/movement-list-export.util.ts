import type { ListExportConfig } from '@shared/utils/list-export.util';

import type { StockMovementRow } from '../models/inventory-view.model';

/**
 * Colonne di Stampa ed Esporta del registro **Movimenti** (`14` §5.2).
 *
 * ⛔ **Solo la configurazione.** Il come — CSV con BOM e separatore `;`, pagina
 * HTML stampabile, totali di colonna — vive in `shared/utils/list-export.util`,
 * che serve già documenti e ordini fornitore. Questa pagina non aveva né stampa
 * né export: li riceve senza una riga di generatore nuovo.
 *
 * ⚠️ **Titolo documentale e stabile: «Movimenti di magazzino».** Non «— elenco
 * selezionati»: quanti elementi ci sono lo dice il piè, che li conta davvero.
 *
 * ⚠️ **Nessun totale di colonna, ed è voluto.** La quantità con segno somma
 * carichi e scarichi: un «totale» in fondo a un registro di movimenti sarebbe
 * un numero che non significa niente — non è la giacenza, non è il movimentato.
 * Il piè conta le righe, che è l'unica cosa vera.
 */
export const MOVEMENT_LIST_EXPORT: ListExportConfig<StockMovementRow> = {
  title: 'Movimenti di magazzino',
  filePrefix: 'movimenti',
  itemNoun: 'movimenti',
  columns: [
    { header: 'Data', cell: (row) => row.createdAtLabel },
    { header: 'Tipo', cell: (row) => row.originLabel ?? row.type },
    { header: 'Cod. articolo', cell: (row) => row.articleCode },
    { header: 'SKU', cell: (row) => row.sku },
    { header: 'Prodotto', cell: (row) => row.productTitle ?? '' },
    /*
      ⛔ **QUI C'ERA `row.signedQuantity`**, che è la stringa già formattata per
      lo SCHERMO: porta il meno tipografico `−` (U+2212), non il meno da
      tastiera.

      ```text
      Number('−205')  →  NaN        lo scarico diventa TESTO
      Number('+205')  →  205        il carico resta numero
      ```

      Excel riconosce il primo come testo e il secondo come numero: la colonna
      restava **metà numerica e metà testo**, e ogni `SUM()` o filtro saltava in
      silenzio tutte le righe in uscita — un totale che sembra giusto e conta
      solo i carichi.

      ⭐ **Il valore numerico era già lì accanto e inutilizzato.**
      `signedQuantityValue` esiste **esattamente per questo**, e il commento del
      modello lo dice: riparsare la stringa darebbe `NaN` su ogni scarico.
      L'export era l'unico consumatore che non aveva ricevuto la nota.
    */
    { header: 'Quantità', numeric: true, cell: (row) => String(row.signedQuantityValue) },
    { header: 'Sede', cell: (row) => row.locationLabel },
    { header: 'Documento', cell: (row) => row.documentReference ?? '' },
    { header: 'Causale', cell: (row) => row.reason ?? '' },
    { header: 'Operatore', cell: (row) => row.createdByName },
  ],
};
